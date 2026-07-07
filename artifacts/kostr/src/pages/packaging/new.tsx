import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2, X, Image, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { PACKAGING_CATEGORIES } from "../packaging";

const BAG_TYPE_OPTIONS = [
  { value: "pouch_stand_up", label: "Pouch (Stand-Up)" },
  { value: "pillow_bag", label: "Pillow Bag" },
  { value: "flat_bottom_pouch", label: "Flat-Bottom Pouch" },
  { value: "gusseted_bag", label: "Gusseted Bag" },
  { value: "quad_seal_bag", label: "Quad-Seal Bag" },
  { value: "doyen_bag", label: "Doyen Bag" },
  { value: "other", label: "Other" },
];

const formSchema = z.object({
  nameEnglish: z.string().min(1, "Item Name (English) is required"),
  nameThai: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  supplier: z.string().optional(),
  unit: z.enum(["piece", "roll", "kg", "meter"]).default("piece"),
  unitCost: z.coerce.number().min(0).default(0),
  moq: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  leadTimeDays: z.coerce.number().int().min(0).optional().or(z.literal("").transform(() => undefined)),
  notes: z.string().optional(),
  // Category-specific fields (flat, assembled into specs on submit)
  specMaterial: z.string().optional(),
  specWidthMm: z.coerce.number().positive().optional().or(z.literal("").transform(() => undefined)),
  specLengthMm: z.coerce.number().positive().optional().or(z.literal("").transform(() => undefined)),
  specThicknessMicron: z.coerce.number().positive().optional().or(z.literal("").transform(() => undefined)),
  specBagType: z.string().optional(),
  specButtSealMm: z.coerce.number().positive().optional().or(z.literal("").transform(() => undefined)),
  specSideSealMm: z.coerce.number().positive().optional().or(z.literal("").transform(() => undefined)),
  specBoxType: z.string().optional(),
  specLengthCm: z.coerce.number().positive().optional().or(z.literal("").transform(() => undefined)),
  specWidthCm: z.coerce.number().positive().optional().or(z.literal("").transform(() => undefined)),
  specHeightCm: z.coerce.number().positive().optional().or(z.literal("").transform(() => undefined)),
  specFullGrossWeightKg: z.coerce.number().positive().optional().or(z.literal("").transform(() => undefined)),
  specStickerType: z.string().optional(),
  specContainsFdaInfo: z.boolean().optional(),
  specCapacityCc: z.coerce.number().positive().optional().or(z.literal("").transform(() => undefined)),
  specUnitsPerPurchasedPack: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  specCapacityG: z.coerce.number().positive().optional().or(z.literal("").transform(() => undefined)),
  specRollWidthMm: z.coerce.number().positive().optional().or(z.literal("").transform(() => undefined)),
  specHeightMm: z.coerce.number().positive().optional().or(z.literal("").transform(() => undefined)),
  specBlockName: z.string().optional(),
  specTotalBlockCost: z.coerce.number().min(0).optional().or(z.literal("").transform(() => undefined)),
  specExpectedPrintRuns: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  specLinkedPackagingItem: z.string().optional(),
  specDescription: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

function buildSpecs(data: FormData) {
  const cat = data.category;
  const specs: Record<string, unknown> = {};

  const set = (key: string, val: unknown) => { if (val != null && val !== "" && val !== undefined) specs[key] = val; };

  if (["sachet_primary_bag", "inner_bag", "box_carton", "sticker_label", "shrink_wrap", "tray_insert"].includes(cat)) set("material", data.specMaterial);
  if (["sachet_primary_bag", "inner_bag", "sticker_label", "tray_insert"].includes(cat)) { set("widthMm", data.specWidthMm); set("lengthMm", data.specLengthMm); }
  if (["sachet_primary_bag", "inner_bag", "shrink_wrap"].includes(cat)) set("thicknessMicron", data.specThicknessMicron);
  if (cat === "sachet_primary_bag") { set("bagType", data.specBagType); set("buttSealMm", data.specButtSealMm); set("sideSealMm", data.specSideSealMm); }
  if (cat === "box_carton") { set("boxType", data.specBoxType); set("lengthCm", data.specLengthCm); set("widthCm", data.specWidthCm); set("heightCm", data.specHeightCm); set("fullGrossWeightKg", data.specFullGrossWeightKg); }
  if (cat === "sticker_label") { set("stickerType", data.specStickerType); if (data.specContainsFdaInfo !== undefined) specs["containsFdaInfo"] = data.specContainsFdaInfo; }
  if (cat === "oxygen_absorber") { set("capacityCc", data.specCapacityCc); set("unitsPerPurchasedPack", data.specUnitsPerPurchasedPack); }
  if (cat === "desiccant") { set("capacityG", data.specCapacityG); set("unitsPerPurchasedPack", data.specUnitsPerPurchasedPack); }
  if (cat === "shrink_wrap") set("rollWidthMm", data.specRollWidthMm);
  if (cat === "tray_insert") set("heightMm", data.specHeightMm);
  if (cat === "printing_block") { set("blockName", data.specBlockName); set("totalBlockCost", data.specTotalBlockCost); set("expectedPrintRuns", data.specExpectedPrintRuns); set("linkedPackagingItem", data.specLinkedPackagingItem); }
  if (cat === "other") set("specDescription", data.specDescription);

  return Object.keys(specs).length > 0 ? specs : null;
}

async function uploadFileToStorage(file: File): Promise<{ objectPath: string; contentType: string; fileName: string }> {
  const urlRes = await fetch(getApiUrl("/storage/uploads/request-url"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  const { uploadURL, objectPath } = await urlRes.json();
  await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  return { objectPath, contentType: file.type, fileName: file.name };
}

export default function NewPackagingItem() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [quotationFile, setQuotationFile] = useState<File | null>(null);
  const [specDocFile, setSpecDocFile] = useState<File | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nameEnglish: "", nameThai: "", category: "", supplier: "",
      unit: "piece", unitCost: 0, notes: "",
      specContainsFdaInfo: false,
    },
  });

  const category = form.watch("category");
  const totalBlockCost = form.watch("specTotalBlockCost");
  const expectedPrintRuns = form.watch("specExpectedPrintRuns");
  const costPerRun = (totalBlockCost && expectedPrintRuns && Number(expectedPrintRuns) > 0)
    ? (Number(totalBlockCost) / Number(expectedPrintRuns)).toFixed(4)
    : null;

  function handlePhotoChange(file: File | null) {
    setPhotoFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setPhotoPreview(url);
    } else {
      setPhotoPreview(null);
    }
  }

  async function onSubmit(data: FormData) {
    setIsSaving(true);
    try {
      const body = {
        nameEnglish: data.nameEnglish,
        nameThai: data.nameThai || null,
        category: data.category,
        supplier: data.supplier || null,
        unit: data.unit,
        unitCost: data.unitCost,
        moq: data.moq ?? null,
        leadTimeDays: data.leadTimeDays ?? null,
        notes: data.notes || null,
        specs: buildSpecs(data),
      };

      const r = await fetch(getApiUrl("/packaging"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        const detail = (err as any).detail ? ` — ${(err as any).detail}` : "";
        throw new Error(((err as any).error || "Failed to create item") + detail);
      }
      const created = await r.json();

      if (photoFile) {
        try {
          const ref = await uploadFileToStorage(photoFile);
          await fetch(getApiUrl(`/packaging/${created.id}/photo`), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(ref),
          });
        } catch {
          toast({ variant: "destructive", title: "Item saved but photo upload failed" });
        }
      }

      if (quotationFile) {
        try {
          const ref = await uploadFileToStorage(quotationFile);
          await fetch(getApiUrl(`/packaging/${created.id}/quotation`), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(ref),
          });
        } catch {
          toast({ variant: "destructive", title: "Item saved but quotation upload failed" });
        }
      }

      if (specDocFile) {
        try {
          const ref = await uploadFileToStorage(specDocFile);
          await fetch(getApiUrl(`/packaging/${created.id}/spec-doc`), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(ref),
          });
        } catch {
          toast({ variant: "destructive", title: "Item saved but spec doc upload failed" });
        }
      }

      qc.invalidateQueries({ queryKey: ["/api/packaging"] });
      toast({ title: "Packaging item created" });
      setLocation(`/packaging/${created.id}`);
    } catch (err) {
      toast({ variant: "destructive", title: String(err instanceof Error ? err.message : err) });
    } finally {
      setIsSaving(false);
    }
  }

  const showDocuments = !!category;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/packaging")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Packaging Item</h1>
          <p className="text-muted-foreground text-sm">Add a packaging material or component to the catalog</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

          {/* Base Fields */}
          <Card>
            <CardHeader><CardTitle className="text-base">Basic Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField control={form.control} name="nameEnglish" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Item Name (English) <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input placeholder="e.g. 40g Stand-Up Pouch" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="nameThai" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Item Name (Thai)</FormLabel>
                    <FormControl><Input placeholder="ชื่อบรรจุภัณฑ์" {...field} value={field.value || ""} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category <span className="text-destructive">*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger></FormControl>
                      <SelectContent>
                        {PACKAGING_CATEGORIES.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="supplier" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier</FormLabel>
                    <FormControl><Input placeholder="Supplier name" {...field} value={field.value || ""} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <FormField control={form.control} name="unit" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {["piece", "roll", "kg", "meter"].map(u => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="unitCost" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit Cost (฿)</FormLabel>
                    <FormControl><Input type="number" step="0.0001" min="0" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="moq" render={({ field }) => (
                  <FormItem>
                    <FormLabel>MOQ</FormLabel>
                    <FormControl><Input type="number" step="1" min="1" placeholder="Min. order qty" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField control={form.control} name="leadTimeDays" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lead Time (days)</FormLabel>
                    <FormControl><Input type="number" step="1" min="0" placeholder="e.g. 14" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea placeholder="Any additional notes..." rows={2} {...field} value={field.value || ""} /></FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* Category-Specific Fields */}
          {category && category !== "" && (
            <Card>
              <CardHeader><CardTitle className="text-base">Specifications</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <CategorySpecFields form={form} category={category} costPerRun={costPerRun} />
              </CardContent>
            </Card>
          )}

          {/* Documents & Media */}
          {showDocuments && (
            <Card>
              <CardHeader><CardTitle className="text-base">Documents & Media</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                {/* Product Photo */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Product Photo</p>
                  {photoPreview ? (
                    <div className="relative inline-block">
                      <img src={photoPreview} alt="Preview" className="w-40 h-40 object-cover rounded-lg border" />
                      <Button
                        type="button" variant="destructive" size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                        onClick={() => handlePhotoChange(null)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-40 h-40 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors">
                      <Image className="w-6 h-6 text-muted-foreground mb-2" />
                      <span className="text-xs text-muted-foreground text-center">Upload photo<br/>JPG or PNG</span>
                      <input
                        type="file" accept="image/jpeg,image/jpg,image/png" className="hidden"
                        onChange={e => handlePhotoChange(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  )}
                </div>

                {/* Supplier Quotation */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Supplier Quotation</p>
                  {quotationFile ? (
                    <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/40">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate flex-1">{quotationFile.name}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setQuotationFile(null)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-3 p-3 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Upload PDF or document</span>
                      <input
                        type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden"
                        onChange={e => setQuotationFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  )}
                </div>

                {/* Spec Document */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Spec Document</p>
                  {specDocFile ? (
                    <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/40">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate flex-1">{specDocFile.name}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setSpecDocFile(null)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-3 p-3 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Upload PDF or document</span>
                      <input
                        type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden"
                        onChange={e => setSpecDocFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Item
            </Button>
            <Button type="button" variant="outline" onClick={() => setLocation("/packaging")}>Cancel</Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

function CategorySpecFields({ form, category, costPerRun }: { form: ReturnType<typeof useForm<FormData>>; category: string; costPerRun: string | null }) {
  const numField = (name: keyof FormData, label: string, placeholder = "") => (
    <FormField control={form.control} name={name} render={({ field }) => (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        <FormControl><Input type="number" step="any" min="0" placeholder={placeholder} {...field} value={(field.value as string | number | undefined) ?? ""} /></FormControl>
        <FormMessage />
      </FormItem>
    )} />
  );

  const txtField = (name: keyof FormData, label: string, placeholder = "") => (
    <FormField control={form.control} name={name} render={({ field }) => (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        <FormControl><Input placeholder={placeholder} {...field} value={(field.value as string) || ""} /></FormControl>
      </FormItem>
    )} />
  );

  const selectField = (name: keyof FormData, label: string, options: { value: string; label: string }[]) => (
    <FormField control={form.control} name={name} render={({ field }) => (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        <Select onValueChange={field.onChange} value={(field.value as string) || ""}>
          <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
          <SelectContent>
            {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </FormItem>
    )} />
  );

  if (category === "sachet_primary_bag") return (
    <div className="grid gap-4 md:grid-cols-2">
      {selectField("specBagType", "Bag Type", BAG_TYPE_OPTIONS)}
      {txtField("specMaterial", "Material", "e.g. BOPP, PET, Kraft")}
      {numField("specWidthMm", "Width (mm)")}
      {numField("specLengthMm", "Length (mm)")}
      {numField("specButtSealMm", "Butt Seal (mm)")}
      {numField("specSideSealMm", "Side Seal (mm)")}
      {numField("specThicknessMicron", "Thickness (micron)")}
    </div>
  );

  if (category === "inner_bag") return (
    <div className="grid gap-4 md:grid-cols-2">
      {txtField("specMaterial", "Material", "e.g. PE, PP")}
      {numField("specWidthMm", "Width (mm)")}
      {numField("specLengthMm", "Length (mm)")}
      {numField("specThicknessMicron", "Thickness (micron)")}
    </div>
  );

  if (category === "box_carton") return (
    <div className="grid gap-4 md:grid-cols-2">
      {selectField("specBoxType", "Type", [
        { value: "retail_box", label: "Retail Box" },
        { value: "shipper_carton", label: "Shipper Carton" },
        { value: "both", label: "Both" },
      ])}
      {txtField("specMaterial", "Material", "e.g. E-flute corrugated")}
      {numField("specLengthCm", "Length (cm)")}
      {numField("specWidthCm", "Width (cm)")}
      {numField("specHeightCm", "Height (cm)")}
      {numField("specFullGrossWeightKg", "Gross Weight when full (kg)")}
    </div>
  );

  if (category === "sticker_label") return (
    <div className="grid gap-4 md:grid-cols-2">
      {selectField("specStickerType", "Type", [
        { value: "front_label", label: "Front Label" },
        { value: "back_label", label: "Back Label" },
        { value: "seal_sticker", label: "Seal Sticker" },
        { value: "barcode_sticker", label: "Barcode Sticker" },
      ])}
      {txtField("specMaterial", "Material", "e.g. BOPP, paper")}
      {numField("specWidthMm", "Width (mm)")}
      {numField("specLengthMm", "Length (mm)")}
      <FormField control={form.control} name="specContainsFdaInfo" render={({ field }) => (
        <FormItem className="flex items-center gap-3 rounded-lg border p-3 col-span-full">
          <FormControl><Switch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
          <FormLabel className="cursor-pointer mb-0">Contains FDA Information</FormLabel>
        </FormItem>
      )} />
    </div>
  );

  if (category === "oxygen_absorber") return (
    <div className="grid gap-4 md:grid-cols-2">
      {numField("specCapacityCc", "Capacity (cc)")}
      {numField("specUnitsPerPurchasedPack", "Units per purchased pack")}
    </div>
  );

  if (category === "desiccant") return (
    <div className="grid gap-4 md:grid-cols-2">
      {numField("specCapacityG", "Capacity (g)")}
      {numField("specUnitsPerPurchasedPack", "Units per purchased pack")}
    </div>
  );

  if (category === "shrink_wrap") return (
    <div className="grid gap-4 md:grid-cols-2">
      {txtField("specMaterial", "Material", "e.g. PVC, POF")}
      {numField("specRollWidthMm", "Roll Width (mm)")}
      {numField("specThicknessMicron", "Thickness (micron)")}
    </div>
  );

  if (category === "tray_insert") return (
    <div className="grid gap-4 md:grid-cols-2">
      {txtField("specMaterial", "Material", "e.g. cardboard, foam")}
      {numField("specLengthMm", "Length (mm)")}
      {numField("specWidthMm", "Width (mm)")}
      {numField("specHeightMm", "Height (mm)")}
    </div>
  );

  if (category === "printing_block") return (
    <div className="grid gap-4 md:grid-cols-2">
      {txtField("specBlockName", "Block Name", "e.g. Main label block")}
      {numField("specTotalBlockCost", "Total Block Cost (฿)")}
      {numField("specExpectedPrintRuns", "Expected Print Runs")}
      <div className="space-y-2">
        <label className="text-sm font-medium leading-none">Cost per Run (฿) — auto</label>
        <Input readOnly value={costPerRun != null ? `฿${parseFloat(costPerRun).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : "—"} className="bg-muted" />
      </div>
      {txtField("specLinkedPackagingItem", "Linked Packaging Item", "Which packaging this block is used for")}
    </div>
  );

  if (category === "other") return (
    <FormField control={form.control} name="specDescription" render={({ field }) => (
      <FormItem>
        <FormLabel>Description</FormLabel>
        <FormControl><Textarea placeholder="Describe this packaging item..." rows={3} {...field} value={field.value || ""} /></FormControl>
      </FormItem>
    )} />
  );

  return null;
}
