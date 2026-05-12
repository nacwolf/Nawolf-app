import { useState, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateSku, useListIngredients, useListPrintingBlockSuppliers, useSetSkuPrintingBlockConfig } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trash2, ChevronDown, ChevronUp, Printer, ImagePlus, X, FileText, Upload } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatPercent } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { getApiUrl } from "@/lib/queryClient";

const CATEGORY_COLORS: Record<string, string> = {
  "Raw Materials": "bg-green-100 text-green-800",
  "Packaging": "bg-purple-100 text-purple-800",
  "Labor": "bg-orange-100 text-orange-800",
  "Overhead": "bg-slate-100 text-slate-700",
  "Quality & Compliance": "bg-blue-100 text-blue-800",
  "Delivery": "bg-amber-100 text-amber-800",
};

const SKU_CATEGORIES = ["Bakery", "Beverages", "Condiments", "Dairy", "Frozen", "Grains", "Oils", "Snacks", "Other"];

const skuFormSchema = z.object({
  skuCode: z.string().min(1, "SKU Code is required"),
  nameThai: z.string().min(1, "Product Name (Thai) is required"),
  name: z.string().optional(),
  brandName: z.string().optional(),
  category: z.string().optional(),
  customerName: z.string().optional(),
  notes: z.string().optional(),
  // Section II
  unitSize: z.string().optional(),
  netWeight: z.coerce.number().optional(),
  netWeightUnit: z.string().optional(),
  grossWeight: z.coerce.number().optional(),
  grossWeightUnit: z.string().optional(),
  unitsPerCarton: z.coerce.number().int().optional(),
  cartonGrossWeight: z.coerce.number().optional(),
  cartonGrossWeightUnit: z.string().optional(),
  cartonDimL: z.coerce.number().optional(),
  cartonDimW: z.coerce.number().optional(),
  cartonDimH: z.coerce.number().optional(),
  shelfLife: z.coerce.number().int().optional(),
  shelfLifeUnit: z.string().optional(),
  storageCondition: z.string().optional(),
  // Section III
  sellPrice: z.coerce.number().min(0.01, "Sell price must be > 0"),
  exFactoryPrice: z.coerce.number().optional(),
  fobPrice: z.coerce.number().optional(),
  moq: z.coerce.number().int().optional(),
  moqUnit: z.string().optional(),
  // Section IV
  fdaNumber: z.string().optional(),
  barcodeEan13: z.string().optional(),
  halalCertified: z.boolean().optional(),
  gmpCertified: z.boolean().optional(),
  haccpCertified: z.boolean().optional(),
  organicCertified: z.boolean().optional(),
  otherCertifications: z.string().optional(),
  // Section V text
  ingredientsListThai: z.string().optional(),
  ingredientsListEnglish: z.string().optional(),
  allergenInfo: z.string().optional(),
  nutritionalInfo: z.string().optional(),
  // BOM
  costLines: z.array(z.object({
    ingredientId: z.coerce.number().min(1, "Select an ingredient"),
    quantityPerUnit: z.coerce.number().min(0.0001, "Quantity must be > 0"),
    notes: z.string().optional()
  })).optional()
});

type SkuFormValues = z.infer<typeof skuFormSchema>;

interface PendingFile { file: File; preview: string | null; }

function UnitSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-20 flex-shrink-0"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function SectionHeader({ title, open, onToggle, badge }: { title: string; open: boolean; onToggle: () => void; badge?: string }) {
  return (
    <button
      type="button"
      className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors rounded-t-lg"
      onClick={onToggle}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{title}</span>
        {badge && <span className="text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5">{badge}</span>}
      </div>
      {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
    </button>
  );
}

async function uploadFile(file: File, skuId: number, endpoint: string, extraBody?: Record<string, string>) {
  const urlRes = await fetch(getApiUrl("/storage/uploads/request-url"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
  });
  if (!urlRes.ok) throw new Error("Failed to get upload URL");
  const { uploadURL, objectPath } = await urlRes.json();
  const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
  if (!putRes.ok) throw new Error("Upload failed");
  await fetch(getApiUrl(endpoint.replace(":id", String(skuId))), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectPath, contentType: file.type, fileName: file.name, ...extraBody }),
  });
}

async function uploadSingleFile(file: File, skuId: number, endpoint: string) {
  const urlRes = await fetch(getApiUrl("/storage/uploads/request-url"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
  });
  if (!urlRes.ok) throw new Error("Failed to get upload URL");
  const { uploadURL, objectPath } = await urlRes.json();
  const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
  if (!putRes.ok) throw new Error("Upload failed");
  await fetch(getApiUrl(endpoint.replace(":id", String(skuId))), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectPath, contentType: file.type, fileName: file.name }),
  });
}

export default function SkuNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: ingredients } = useListIngredients();
  const { data: blockSuppliers } = useListPrintingBlockSuppliers();
  const createSku = useCreateSku();
  const setBlockConfig = useSetSkuPrintingBlockConfig();

  // Section open/closed state — I open by default, rest collapsed
  const [openSections, setOpenSections] = useState({ I: true, II: false, III: false, IV: false, V: false, bom: false, blocks: false });
  const toggleSection = (s: keyof typeof openSections) => setOpenSections(p => ({ ...p, [s]: !p[s] }));

  // Printing blocks
  const [blockSupplierId, setBlockSupplierId] = useState<string>("");
  const [blockNumBlocks, setBlockNumBlocks] = useState<string>("");
  const [blockMoq, setBlockMoq] = useState<string>("");

  // Pending single-file uploads
  const [pendingPhoto, setPendingPhoto] = useState<PendingFile | null>(null);
  const [pendingLabel, setPendingLabel] = useState<PendingFile | null>(null);
  const [pendingSpec, setPendingSpec] = useState<PendingFile | null>(null);
  const [pendingDieline, setPendingDieline] = useState<PendingFile | null>(null);

  // Pending multi-file uploads
  const [pendingPhotos, setPendingPhotos] = useState<PendingFile[]>([]);
  const [pendingCerts, setPendingCerts] = useState<PendingFile[]>([]);

  const photoRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const specRef = useRef<HTMLInputElement>(null);
  const dielineRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);
  const certsRef = useRef<HTMLInputElement>(null);

  function makePending(file: File): PendingFile {
    return { file, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null };
  }
  function pickSingle(setter: (f: PendingFile | null) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]; e.target.value = "";
      if (f) setter(makePending(f));
    };
  }
  function pickMulti(setter: React.Dispatch<React.SetStateAction<PendingFile[]>>) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []); e.target.value = "";
      setter(p => [...p, ...files.map(makePending)]);
    };
  }

  const form = useForm<SkuFormValues>({
    resolver: zodResolver(skuFormSchema),
    defaultValues: {
      skuCode: "", nameThai: "", name: "", brandName: "", category: "", customerName: "", notes: "",
      unitSize: "", netWeightUnit: "g", grossWeightUnit: "g", cartonGrossWeightUnit: "kg",
      shelfLifeUnit: "days", moqUnit: "units", sellPrice: 0,
      halalCertified: false, gmpCertified: false, haccpCertified: false, organicCertified: false,
      costLines: []
    }
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "costLines" });
  const watchCostLines = form.watch("costLines");
  const watchSellPrice = form.watch("sellPrice");

  const grouped = useMemo(() => {
    if (!ingredients) return {};
    return ingredients.reduce((acc: Record<string, typeof ingredients>, ing) => {
      const cat = ing.category || "Other";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(ing);
      return acc;
    }, {});
  }, [ingredients]);

  const liveCalc = useMemo(() => {
    if (!watchCostLines || !ingredients) return { totalCogs: 0, byCategory: {} };
    const byCategory: Record<string, number> = {};
    let totalCogs = 0;
    for (const line of watchCostLines) {
      if (!line.ingredientId || !line.quantityPerUnit) continue;
      const ing = ingredients.find(i => i.id === line.ingredientId);
      if (!ing || !ing.currentPrice) continue;
      const lineCost = ing.currentPrice * line.quantityPerUnit;
      totalCogs += lineCost;
      const cat = ing.category || "Other";
      byCategory[cat] = (byCategory[cat] || 0) + lineCost;
    }
    return { totalCogs, byCategory };
  }, [watchCostLines, ingredients]);

  const blockAmortizedCost = useMemo(() => {
    if (!blockSupplierId || !blockNumBlocks || !blockMoq) return 0;
    const supplier = blockSuppliers?.find(s => s.id === parseInt(blockSupplierId, 10));
    if (!supplier) return 0;
    const nb = parseInt(blockNumBlocks, 10);
    const m = parseInt(blockMoq, 10);
    if (!nb || !m || nb < 1 || m < 1) return 0;
    return (nb * supplier.pricePerBlock) / m;
  }, [blockSupplierId, blockNumBlocks, blockMoq, blockSuppliers]);

  const totalCogsWithBlocks = liveCalc.totalCogs + blockAmortizedCost;
  const margin = watchSellPrice > 0 ? (watchSellPrice - totalCogsWithBlocks) / watchSellPrice : 0;
  const marginStatus = margin > 0.25 ? "healthy" : margin > 0.1 ? "review" : "critical";
  const targetPrice30 = totalCogsWithBlocks > 0 ? totalCogsWithBlocks / 0.70 : null;

  const categoryBreakdown = Object.entries(liveCalc.byCategory).map(([name, value]) => ({
    name, value, pct: liveCalc.totalCogs > 0 ? (value / liveCalc.totalCogs) * 100 : 0,
  })).sort((a, b) => b.value - a.value);

  async function onSubmit(data: SkuFormValues) {
    try {
      const res = await createSku.mutateAsync({
        data: {
          skuCode: data.skuCode,
          nameThai: data.nameThai,
          name: data.name || null,
          brandName: data.brandName || null,
          category: data.category || null,
          customerName: data.customerName || null,
          notes: data.notes || null,
          unitSize: data.unitSize || null,
          netWeight: data.netWeight || null,
          netWeightUnit: data.netWeightUnit || null,
          grossWeight: data.grossWeight || null,
          grossWeightUnit: data.grossWeightUnit || null,
          unitsPerCarton: data.unitsPerCarton || null,
          cartonGrossWeight: data.cartonGrossWeight || null,
          cartonGrossWeightUnit: data.cartonGrossWeightUnit || null,
          cartonDimL: data.cartonDimL || null,
          cartonDimW: data.cartonDimW || null,
          cartonDimH: data.cartonDimH || null,
          shelfLife: data.shelfLife || null,
          shelfLifeUnit: data.shelfLifeUnit || null,
          storageCondition: data.storageCondition || null,
          sellPrice: data.sellPrice,
          exFactoryPrice: data.exFactoryPrice || null,
          fobPrice: data.fobPrice || null,
          moq: data.moq || null,
          moqUnit: data.moqUnit || null,
          fdaNumber: data.fdaNumber || null,
          barcodeEan13: data.barcodeEan13 || null,
          halalCertified: data.halalCertified,
          gmpCertified: data.gmpCertified,
          haccpCertified: data.haccpCertified,
          organicCertified: data.organicCertified,
          otherCertifications: data.otherCertifications || null,
          ingredientsListThai: data.ingredientsListThai || null,
          ingredientsListEnglish: data.ingredientsListEnglish || null,
          allergenInfo: data.allergenInfo || null,
          nutritionalInfo: data.nutritionalInfo || null,
          costLines: data.costLines?.map(l => ({ ...l, notes: l.notes || null }))
        }
      });

      if (blockSupplierId && blockNumBlocks && blockMoq) {
        try {
          await setBlockConfig.mutateAsync({ id: res.id, data: { supplierId: parseInt(blockSupplierId, 10), numBlocks: parseInt(blockNumBlocks, 10), moq: parseInt(blockMoq, 10) } });
        } catch {
          toast({ variant: "destructive", title: "SKU created but block config failed", description: "You can set it on the SKU detail page." });
        }
      }

      // Upload files (non-fatal)
      const uploads: Promise<void>[] = [];
      if (pendingPhoto) uploads.push(uploadSingleFile(pendingPhoto.file, res.id, "/skus/:id/photo").catch(() => {}));
      if (pendingLabel) uploads.push(uploadSingleFile(pendingLabel.file, res.id, "/skus/:id/label-file").catch(() => {}));
      if (pendingSpec) uploads.push(uploadSingleFile(pendingSpec.file, res.id, "/skus/:id/spec-sheet").catch(() => {}));
      if (pendingDieline) uploads.push(uploadSingleFile(pendingDieline.file, res.id, "/skus/:id/dieline").catch(() => {}));
      for (const pf of pendingPhotos) uploads.push(uploadFile(pf.file, res.id, "/skus/:id/product-photos").catch(() => {}));
      for (const cf of pendingCerts) uploads.push(uploadFile(cf.file, res.id, "/skus/:id/certificate-files").catch(() => {}));
      if (uploads.length) await Promise.all(uploads);

      toast({ title: "SKU Created", description: `${res.skuCode} was created successfully.` });
      setLocation(`/skus/${res.id}`);
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to create SKU. Check your inputs." });
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Build New SKU</h1>
        <p className="text-muted-foreground">Define your product and its full specification. Product Name (Thai) is required.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1 space-y-4">

              {/* ── Section I — Basic Identity ──────────────────────────────── */}
              <Card>
                <SectionHeader title="I — Basic Identity" open={openSections.I} onToggle={() => toggleSection("I")} badge="Required" />
                {openSections.I && (
                  <CardContent className="pt-2 grid gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="skuCode" render={({ field }) => (
                      <FormItem><FormLabel>SKU Code <span className="text-destructive">*</span></FormLabel>
                        <FormControl><Input placeholder="e.g. FG-1001" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="nameThai" render={({ field }) => (
                      <FormItem><FormLabel>Product Name (Thai) <span className="text-destructive">*</span></FormLabel>
                        <FormControl><Input placeholder="ชื่อสินค้าภาษาไทย" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel>Product Name (English)</FormLabel>
                        <FormControl><Input placeholder="e.g. Organic Almond Butter" {...field} value={field.value || ""} /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="brandName" render={({ field }) => (
                      <FormItem><FormLabel>Brand Name</FormLabel>
                        <FormControl><Input placeholder="e.g. NaWolf" {...field} value={field.value || ""} /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="category" render={({ field }) => (
                      <FormItem><FormLabel>Category</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                          <SelectContent>{SKU_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select></FormItem>
                    )} />
                    <FormField control={form.control} name="customerName" render={({ field }) => (
                      <FormItem><FormLabel>Customer / Buyer</FormLabel>
                        <FormControl><Input placeholder="If specific to a customer" {...field} value={field.value || ""} /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="notes" render={({ field }) => (
                      <FormItem className="md:col-span-2"><FormLabel>Notes</FormLabel>
                        <FormControl><Textarea placeholder="Any additional notes..." {...field} value={field.value || ""} /></FormControl></FormItem>
                    )} />
                    {/* Primary photo */}
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-sm font-medium leading-none">Primary Photo</label>
                      {pendingPhoto ? (
                        <div className="relative group w-full">
                          {pendingPhoto.preview
                            ? <img src={pendingPhoto.preview} alt="Preview" className="w-full h-36 object-cover rounded-lg border bg-muted" />
                            : <div className="flex items-center gap-2 w-full h-16 border rounded-lg bg-muted/30 px-3"><FileText className="w-4 h-4 text-muted-foreground" /><span className="text-sm text-muted-foreground truncate">{pendingPhoto.file.name}</span></div>
                          }
                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button type="button" size="sm" variant="secondary" className="h-7 px-2 text-xs shadow" onClick={() => photoRef.current?.click()}>Replace</Button>
                            <Button type="button" size="sm" variant="secondary" className="h-7 w-7 p-0 shadow" onClick={() => setPendingPhoto(null)}><X className="w-3 h-3" /></Button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" onClick={() => photoRef.current?.click()} className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-muted-foreground/25 rounded-lg hover:border-primary/50 hover:bg-muted/20 transition-colors">
                          <ImagePlus className="w-5 h-5 text-muted-foreground mb-1" /><span className="text-sm text-muted-foreground">Add photo</span>
                          <span className="text-xs text-muted-foreground/60 mt-0.5">JPG · PNG</span>
                        </button>
                      )}
                      <input ref={photoRef} type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" className="hidden" onChange={pickSingle(setPendingPhoto)} />
                    </div>
                  </CardContent>
                )}
              </Card>

              {/* ── Section II — Physical Specifications ────────────────────── */}
              <Card>
                <SectionHeader title="II — Physical Specifications" open={openSections.II} onToggle={() => toggleSection("II")} />
                {openSections.II && (
                  <CardContent className="pt-2 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField control={form.control} name="unitSize" render={({ field }) => (
                        <FormItem><FormLabel>Unit Size Description</FormLabel>
                          <FormControl><Input placeholder="e.g. 40g bag" {...field} value={field.value || ""} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="unitsPerCarton" render={({ field }) => (
                        <FormItem><FormLabel>Units per Carton</FormLabel>
                          <FormControl><Input type="number" min="1" step="1" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                      )} />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormItem><FormLabel>Net Weight</FormLabel>
                        <div className="flex gap-2">
                          <FormField control={form.control} name="netWeight" render={({ field }) => (
                            <FormControl><Input type="number" step="0.01" min="0" placeholder="0" className="flex-1" {...field} value={field.value ?? ""} /></FormControl>
                          )} />
                          <FormField control={form.control} name="netWeightUnit" render={({ field }) => (
                            <UnitSelect value={field.value || "g"} onChange={field.onChange} options={["g", "kg", "ml", "l"]} />
                          )} />
                        </div>
                      </FormItem>
                      <FormItem><FormLabel>Gross Weight</FormLabel>
                        <div className="flex gap-2">
                          <FormField control={form.control} name="grossWeight" render={({ field }) => (
                            <FormControl><Input type="number" step="0.01" min="0" placeholder="0" className="flex-1" {...field} value={field.value ?? ""} /></FormControl>
                          )} />
                          <FormField control={form.control} name="grossWeightUnit" render={({ field }) => (
                            <UnitSelect value={field.value || "g"} onChange={field.onChange} options={["g", "kg", "ml", "l"]} />
                          )} />
                        </div>
                      </FormItem>
                      <FormItem><FormLabel>Carton Gross Weight</FormLabel>
                        <div className="flex gap-2">
                          <FormField control={form.control} name="cartonGrossWeight" render={({ field }) => (
                            <FormControl><Input type="number" step="0.01" min="0" placeholder="0" className="flex-1" {...field} value={field.value ?? ""} /></FormControl>
                          )} />
                          <FormField control={form.control} name="cartonGrossWeightUnit" render={({ field }) => (
                            <UnitSelect value={field.value || "kg"} onChange={field.onChange} options={["g", "kg"]} />
                          )} />
                        </div>
                      </FormItem>
                      <FormItem><FormLabel>Shelf Life</FormLabel>
                        <div className="flex gap-2">
                          <FormField control={form.control} name="shelfLife" render={({ field }) => (
                            <FormControl><Input type="number" step="1" min="1" placeholder="0" className="flex-1" {...field} value={field.value ?? ""} /></FormControl>
                          )} />
                          <FormField control={form.control} name="shelfLifeUnit" render={({ field }) => (
                            <UnitSelect value={field.value || "days"} onChange={field.onChange} options={["days", "months", "years"]} />
                          )} />
                        </div>
                      </FormItem>
                    </div>
                    <FormItem><FormLabel>Carton Dimensions (L × W × H in cm)</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormField control={form.control} name="cartonDimL" render={({ field }) => (
                          <FormControl><Input type="number" step="0.1" min="0" placeholder="L" className="flex-1" {...field} value={field.value ?? ""} /></FormControl>
                        )} />
                        <span className="text-muted-foreground text-sm flex-shrink-0">×</span>
                        <FormField control={form.control} name="cartonDimW" render={({ field }) => (
                          <FormControl><Input type="number" step="0.1" min="0" placeholder="W" className="flex-1" {...field} value={field.value ?? ""} /></FormControl>
                        )} />
                        <span className="text-muted-foreground text-sm flex-shrink-0">×</span>
                        <FormField control={form.control} name="cartonDimH" render={({ field }) => (
                          <FormControl><Input type="number" step="0.1" min="0" placeholder="H" className="flex-1" {...field} value={field.value ?? ""} /></FormControl>
                        )} />
                        <span className="text-muted-foreground text-xs flex-shrink-0">cm</span>
                      </div>
                    </FormItem>
                    <FormField control={form.control} name="storageCondition" render={({ field }) => (
                      <FormItem><FormLabel>Storage Condition</FormLabel>
                        <FormControl><Input placeholder="e.g. Store in cool dry place" {...field} value={field.value || ""} /></FormControl></FormItem>
                    )} />
                  </CardContent>
                )}
              </Card>

              {/* ── Section III — Pricing & Commercial ──────────────────────── */}
              <Card>
                <SectionHeader title="III — Pricing & Commercial" open={openSections.III} onToggle={() => toggleSection("III")} />
                {openSections.III && (
                  <CardContent className="pt-2 grid gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="sellPrice" render={({ field }) => (
                      <FormItem><FormLabel>Sell Price (฿) <span className="text-destructive">*</span></FormLabel>
                        <FormControl><Input type="number" step="0.01" min="0" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="exFactoryPrice" render={({ field }) => (
                      <FormItem><FormLabel>Ex-Factory Price (฿)</FormLabel>
                        <FormControl><Input type="number" step="0.01" min="0" placeholder="Price at factory gate" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="fobPrice" render={({ field }) => (
                      <FormItem><FormLabel>FOB Price (฿)</FormLabel>
                        <FormControl><Input type="number" step="0.01" min="0" placeholder="Free On Board price" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                    )} />
                    <FormItem><FormLabel>MOQ</FormLabel>
                      <div className="flex gap-2">
                        <FormField control={form.control} name="moq" render={({ field }) => (
                          <FormControl><Input type="number" step="1" min="1" placeholder="Minimum order quantity" className="flex-1" {...field} value={field.value ?? ""} /></FormControl>
                        )} />
                        <FormField control={form.control} name="moqUnit" render={({ field }) => (
                          <UnitSelect value={field.value || "units"} onChange={field.onChange} options={["units", "cartons", "kg"]} />
                        )} />
                      </div>
                    </FormItem>
                  </CardContent>
                )}
              </Card>

              {/* ── Section IV — Regulatory & Compliance ────────────────────── */}
              <Card>
                <SectionHeader title="IV — Regulatory & Compliance" open={openSections.IV} onToggle={() => toggleSection("IV")} />
                {openSections.IV && (
                  <CardContent className="pt-2 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField control={form.control} name="fdaNumber" render={({ field }) => (
                        <FormItem><FormLabel>FDA Registration Number</FormLabel>
                          <FormControl><Input placeholder="e.g. 10-3-12345-1-0001" {...field} value={field.value || ""} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="barcodeEan13" render={({ field }) => (
                        <FormItem><FormLabel>Barcode EAN-13</FormLabel>
                          <FormControl><Input placeholder="13-digit barcode" maxLength={13} {...field} value={field.value || ""} /></FormControl></FormItem>
                      )} />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {([
                        { name: "halalCertified", label: "Halal" },
                        { name: "gmpCertified", label: "GMP" },
                        { name: "haccpCertified", label: "HACCP" },
                        { name: "organicCertified", label: "Organic" },
                      ] as const).map(({ name, label }) => (
                        <FormField key={name} control={form.control} name={name} render={({ field }) => (
                          <FormItem className="flex items-center gap-2 rounded-lg border p-3">
                            <FormControl><Switch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                            <FormLabel className="cursor-pointer mb-0">{label}</FormLabel>
                          </FormItem>
                        )} />
                      ))}
                    </div>
                    <FormField control={form.control} name="otherCertifications" render={({ field }) => (
                      <FormItem><FormLabel>Other Certifications</FormLabel>
                        <FormControl><Input placeholder="e.g. ISO 22000, BRC" {...field} value={field.value || ""} /></FormControl></FormItem>
                    )} />
                  </CardContent>
                )}
              </Card>

              {/* ── Section V — Labelling & Files ───────────────────────────── */}
              <Card>
                <SectionHeader title="V — Labelling & Files" open={openSections.V} onToggle={() => toggleSection("V")} />
                {openSections.V && (
                  <CardContent className="pt-2 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField control={form.control} name="ingredientsListThai" render={({ field }) => (
                        <FormItem><FormLabel>Ingredients List (Thai)</FormLabel>
                          <FormControl><Textarea placeholder="ส่วนประกอบ..." rows={3} {...field} value={field.value || ""} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="ingredientsListEnglish" render={({ field }) => (
                        <FormItem><FormLabel>Ingredients List (English)</FormLabel>
                          <FormControl><Textarea placeholder="Ingredients: ..." rows={3} {...field} value={field.value || ""} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="allergenInfo" render={({ field }) => (
                        <FormItem><FormLabel>Allergen Information</FormLabel>
                          <FormControl><Textarea placeholder="Contains: Shellfish, Gluten" rows={2} {...field} value={field.value || ""} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="nutritionalInfo" render={({ field }) => (
                        <FormItem><FormLabel>Nutritional Info</FormLabel>
                          <FormControl><Textarea placeholder="Per 100g: Energy 250kcal..." rows={2} {...field} value={field.value || ""} /></FormControl></FormItem>
                      )} />
                    </div>

                    {/* Single file pickers */}
                    <div className="grid gap-4 md:grid-cols-3">
                      {([
                        { label: "Label File", state: pendingLabel, setter: setPendingLabel, ref: labelRef, accept: ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" },
                        { label: "Spec Sheet", state: pendingSpec, setter: setPendingSpec, ref: specRef, accept: ".pdf,application/pdf" },
                        { label: "Packaging Dieline", state: pendingDieline, setter: setPendingDieline, ref: dielineRef, accept: ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" },
                      ]).map(({ label, state, setter, ref, accept }) => (
                        <div key={label} className="space-y-1">
                          <label className="text-sm font-medium">{label}</label>
                          {state ? (
                            <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2 text-sm">
                              <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                              <span className="flex-1 truncate text-xs">{state.file.name}</span>
                              <Button type="button" size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setter(null)}><X className="w-3 h-3" /></Button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => ref.current?.click()} className="flex items-center gap-2 w-full border-2 border-dashed border-muted-foreground/25 rounded-lg px-3 py-2 hover:border-primary/50 hover:bg-muted/20 transition-colors text-sm text-muted-foreground">
                              <Upload className="w-4 h-4" />Upload file
                            </button>
                          )}
                          <input ref={ref} type="file" accept={accept} className="hidden" onChange={pickSingle(setter)} />
                        </div>
                      ))}
                    </div>

                    {/* Product photos (multi) */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Product Photos</label>
                      <div className="flex flex-wrap gap-2">
                        {pendingPhotos.map((pf, i) => (
                          <div key={i} className="relative group w-20 h-20">
                            <img src={pf.preview!} alt="" className="w-full h-full object-cover rounded-lg border" />
                            <button type="button" onClick={() => setPendingPhotos(ps => ps.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        <button type="button" onClick={() => photosRef.current?.click()} className="flex flex-col items-center justify-center w-20 h-20 border-2 border-dashed border-muted-foreground/25 rounded-lg hover:border-primary/50 hover:bg-muted/20 transition-colors">
                          <ImagePlus className="w-5 h-5 text-muted-foreground" />
                        </button>
                      </div>
                      <input ref={photosRef} type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" multiple className="hidden" onChange={pickMulti(setPendingPhotos)} />
                    </div>

                    {/* Certificate files (multi) */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Certificate Files</label>
                      <div className="space-y-1">
                        {pendingCerts.map((cf, i) => (
                          <div key={i} className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2 text-sm">
                            <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <span className="flex-1 truncate text-xs">{cf.file.name}</span>
                            <Button type="button" size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setPendingCerts(cs => cs.filter((_, j) => j !== i))}><X className="w-3 h-3" /></Button>
                          </div>
                        ))}
                        <button type="button" onClick={() => certsRef.current?.click()} className="flex items-center gap-2 w-full border-2 border-dashed border-muted-foreground/25 rounded-lg px-3 py-2 hover:border-primary/50 hover:bg-muted/20 transition-colors text-sm text-muted-foreground">
                          <Upload className="w-4 h-4" />Add certificate files (PDF)
                        </button>
                      </div>
                      <input ref={certsRef} type="file" accept=".pdf,application/pdf" multiple className="hidden" onChange={pickMulti(setPendingCerts)} />
                    </div>
                  </CardContent>
                )}
              </Card>

              {/* ── Bill of Materials ────────────────────────────────────────── */}
              <Card>
                <SectionHeader title="Bill of Materials" open={openSections.bom} onToggle={() => toggleSection("bom")} badge={fields.length > 0 ? `${fields.length} line${fields.length !== 1 ? "s" : ""}` : undefined} />
                {openSections.bom && (
                  <CardContent className="pt-2 space-y-3">
                    {fields.map((field, index) => {
                      const ingId = form.watch(`costLines.${index}.ingredientId`);
                      const qty = form.watch(`costLines.${index}.quantityPerUnit`);
                      const ing = ingredients?.find(i => i.id === ingId);
                      const lineCost = ing?.currentPrice && qty ? ing.currentPrice * qty : null;
                      return (
                        <div key={field.id} className="border rounded-lg p-4 space-y-3 bg-muted/30">
                          <div className="flex items-center justify-between gap-2">
                            {ing && <span className={`text-xs px-2 py-0.5 rounded font-medium ${CATEGORY_COLORS[ing.category] || "bg-gray-100 text-gray-700"}`}>{ing.category}</span>}
                            <div className="flex-1" />
                            {lineCost != null && <span className="text-sm font-semibold">{formatCurrency(lineCost)}</span>}
                            <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="text-destructive hover:text-destructive h-7 w-7"><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <FormField control={form.control} name={`costLines.${index}.ingredientId`} render={({ field }) => (
                              <FormItem className="sm:col-span-2"><FormLabel className="text-xs">Ingredient / Cost Item</FormLabel>
                                <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value ? field.value.toString() : ""}>
                                  <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                                  <SelectContent>
                                    {Object.entries(grouped).map(([cat, items]) => (
                                      <div key={cat}>
                                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted">{cat}</div>
                                        {items.map(i => <SelectItem key={i.id} value={i.id.toString()}>{i.name} ({formatCurrency(i.currentPrice)}/{i.unit})</SelectItem>)}
                                      </div>
                                    ))}
                                  </SelectContent>
                                </Select><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name={`costLines.${index}.quantityPerUnit`} render={({ field }) => (
                              <FormItem><FormLabel className="text-xs">Qty {ing ? `(${ing.unit})` : ""}</FormLabel>
                                <FormControl><Input type="number" step="0.0001" {...field} /></FormControl>
                                {ing?.category === "Labor" && <FormDescription className="text-xs">Hours per unit</FormDescription>}
                                <FormMessage /></FormItem>
                            )} />
                          </div>
                          <FormField control={form.control} name={`costLines.${index}.notes`} render={({ field }) => (
                            <FormItem><FormLabel className="text-xs">Notes</FormLabel>
                              <FormControl><Input placeholder="e.g. 5% waste factor" {...field} value={field.value || ""} className="h-8 text-sm" /></FormControl></FormItem>
                          )} />
                        </div>
                      );
                    })}
                    <Button type="button" variant="outline" onClick={() => append({ ingredientId: 0, quantityPerUnit: 1, notes: "" })} className="w-full">
                      <Plus className="h-4 w-4 mr-2" /> Add Cost Line
                    </Button>
                  </CardContent>
                )}
              </Card>

              {/* ── Printing Blocks ──────────────────────────────────────────── */}
              <Card className="border-l-4 border-l-purple-500">
                <button type="button" className="w-full px-4 py-3 bg-purple-50 flex items-center justify-between gap-3 rounded-t-xl" onClick={() => toggleSection("blocks")}>
                  <div className="flex items-center gap-3">
                    <Printer className="w-4 h-4 text-purple-600 flex-shrink-0" />
                    <div className="text-left">
                      <div className="text-sm font-bold uppercase tracking-wider text-purple-700">Printing Blocks</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {blockAmortizedCost > 0 ? `Amortized cost: ${formatCurrency(blockAmortizedCost)}/unit` : "Optional — amortized block costs in COGS"}
                      </div>
                    </div>
                  </div>
                  {openSections.blocks ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {openSections.blocks && (
                  <CardContent className="pt-4 space-y-3">
                    {(blockSuppliers?.length ?? 0) === 0 ? (
                      <p className="text-sm text-muted-foreground">No printing block suppliers yet. Add one in the Cost Library first.</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Supplier</label>
                            <Select value={blockSupplierId} onValueChange={setBlockSupplierId}>
                              <SelectTrigger className="h-9"><SelectValue placeholder="Select supplier..." /></SelectTrigger>
                              <SelectContent>{blockSuppliers?.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name} ({formatCurrency(s.pricePerBlock)}/block)</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Number of blocks</label>
                            <Input type="number" min="1" step="1" placeholder="e.g. 4" value={blockNumBlocks} onChange={e => setBlockNumBlocks(e.target.value)} className="h-9" />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">MOQ (units)</label>
                            <Input type="number" min="1" step="1" placeholder="e.g. 5000" value={blockMoq} onChange={e => setBlockMoq(e.target.value)} className="h-9" />
                          </div>
                        </div>
                        {blockAmortizedCost > 0 && (
                          <div className="text-sm text-purple-700 font-medium bg-purple-50 rounded px-3 py-2">
                            Printing Blocks (amortized over {parseInt(blockMoq, 10).toLocaleString()} units): <span className="font-bold">{formatCurrency(blockAmortizedCost)}/unit</span>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                )}
              </Card>
            </div>

            {/* ── Live Margin Sidebar ────────────────────────────────────────── */}
            <div className="lg:w-72 xl:w-80">
              <div className="sticky top-6 space-y-4">
                <Card className="border-2">
                  <CardHeader className="pb-3"><CardTitle className="text-base">Live Margin Preview</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Sell Price</span>
                        <span className="font-medium">{formatCurrency(watchSellPrice || 0)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Ingredients COGS</span>
                        <span className="font-medium">{formatCurrency(liveCalc.totalCogs)}</span>
                      </div>
                      {blockAmortizedCost > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground text-purple-700">Printing Blocks</span>
                          <span className="font-medium text-purple-700">{formatCurrency(blockAmortizedCost)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-semibold border-t pt-1">
                        <span className="text-muted-foreground">Total COGS</span>
                        <span>{formatCurrency(totalCogsWithBlocks)}</span>
                      </div>
                      <div className="border-t pt-2 flex justify-between">
                        <span className="text-sm text-muted-foreground">Margin ฿/unit</span>
                        <span className="font-semibold">{formatCurrency(watchSellPrice - totalCogsWithBlocks)}</span>
                      </div>
                    </div>
                    <div className="bg-muted rounded-lg p-3 text-center">
                      <div className="text-3xl font-bold">{formatPercent(margin)}</div>
                      <div className="mt-1">{watchSellPrice > 0 && liveCalc.totalCogs > 0 && <StatusBadge status={marginStatus} />}</div>
                    </div>
                    {targetPrice30 && (
                      <div className="text-sm border rounded-lg p-3">
                        <div className="text-muted-foreground text-xs">Target price for 30% margin</div>
                        <div className="font-bold text-lg mt-0.5">{formatCurrency(targetPrice30)}</div>
                      </div>
                    )}
                    {categoryBreakdown.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">By Category</div>
                        {categoryBreakdown.map((d) => (
                          <div key={d.name}>
                            <div className="flex justify-between text-xs mb-0.5"><span>{d.name}</span><span className="font-medium">{d.pct.toFixed(0)}%</span></div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${d.pct}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setLocation("/skus")}>Cancel</Button>
                  <Button type="submit" className="flex-1" disabled={createSku.isPending}>
                    {createSku.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create SKU
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
