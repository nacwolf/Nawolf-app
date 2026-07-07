import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2, Trash2, X, Image, Save, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@/lib/queryClient";
import { formatDate } from "@/lib/format";
import type { PackagingItem, PackagingSpecs } from "@workspace/api-client-react";
import { PACKAGING_CATEGORIES, categoryLabel, bagTypeLabel } from "../packaging";

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

function specsToFormData(specs: PackagingSpecs | null | undefined): Partial<FormData> {
  if (!specs) return {};
  return {
    specMaterial: (specs.material as string) ?? undefined,
    specWidthMm: specs.widthMm ?? undefined,
    specLengthMm: specs.lengthMm ?? undefined,
    specThicknessMicron: specs.thicknessMicron ?? undefined,
    specBagType: (specs.bagType as string) ?? undefined,
    specButtSealMm: (specs.buttSealMm as number) ?? undefined,
    specSideSealMm: (specs.sideSealMm as number) ?? undefined,
    specBoxType: (specs.boxType as string) ?? undefined,
    specLengthCm: specs.lengthCm ?? undefined,
    specWidthCm: specs.widthCm ?? undefined,
    specHeightCm: specs.heightCm ?? undefined,
    specFullGrossWeightKg: specs.fullGrossWeightKg ?? undefined,
    specStickerType: (specs.stickerType as string) ?? undefined,
    specContainsFdaInfo: specs.containsFdaInfo ?? false,
    specCapacityCc: specs.capacityCc ?? undefined,
    specUnitsPerPurchasedPack: specs.unitsPerPurchasedPack ?? undefined,
    specCapacityG: specs.capacityG ?? undefined,
    specRollWidthMm: specs.rollWidthMm ?? undefined,
    specHeightMm: specs.heightMm ?? undefined,
    specBlockName: (specs.blockName as string) ?? undefined,
    specTotalBlockCost: specs.totalBlockCost ?? undefined,
    specExpectedPrintRuns: specs.expectedPrintRuns ?? undefined,
    specLinkedPackagingItem: (specs.linkedPackagingItem as string) ?? undefined,
    specDescription: (specs.specDescription as string) ?? undefined,
  };
}

function buildSpecs(data: FormData, category: string): Record<string, unknown> | null {
  const specs: Record<string, unknown> = {};
  const set = (key: string, val: unknown) => { if (val != null && val !== "" && val !== undefined) specs[key] = val; };

  if (["sachet_primary_bag", "inner_bag", "box_carton", "sticker_label", "shrink_wrap", "tray_insert"].includes(category)) set("material", data.specMaterial);
  if (["sachet_primary_bag", "inner_bag", "sticker_label", "tray_insert"].includes(category)) { set("widthMm", data.specWidthMm); set("lengthMm", data.specLengthMm); }
  if (["sachet_primary_bag", "inner_bag", "shrink_wrap"].includes(category)) set("thicknessMicron", data.specThicknessMicron);
  if (category === "sachet_primary_bag") { set("bagType", data.specBagType); set("buttSealMm", data.specButtSealMm); set("sideSealMm", data.specSideSealMm); }
  if (category === "box_carton") { set("boxType", data.specBoxType); set("lengthCm", data.specLengthCm); set("widthCm", data.specWidthCm); set("heightCm", data.specHeightCm); set("fullGrossWeightKg", data.specFullGrossWeightKg); }
  if (category === "sticker_label") { set("stickerType", data.specStickerType); if (data.specContainsFdaInfo !== undefined) specs["containsFdaInfo"] = data.specContainsFdaInfo; }
  if (category === "oxygen_absorber") { set("capacityCc", data.specCapacityCc); set("unitsPerPurchasedPack", data.specUnitsPerPurchasedPack); }
  if (category === "desiccant") { set("capacityG", data.specCapacityG); set("unitsPerPurchasedPack", data.specUnitsPerPurchasedPack); }
  if (category === "shrink_wrap") set("rollWidthMm", data.specRollWidthMm);
  if (category === "tray_insert") set("heightMm", data.specHeightMm);
  if (category === "printing_block") { set("blockName", data.specBlockName); set("totalBlockCost", data.specTotalBlockCost); set("expectedPrintRuns", data.specExpectedPrintRuns); set("linkedPackagingItem", data.specLinkedPackagingItem); }
  if (category === "other") set("specDescription", data.specDescription);

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

export default function PackagingDetail({ id }: { id: string }) {
  const [, setLocation] = useLocation();
  const itemId = parseInt(id, 10);

  const { data: item, isLoading } = useQuery<PackagingItem>({
    queryKey: ["/api/packaging", itemId],
    queryFn: async () => {
      const r = await fetch(getApiUrl(`/packaging/${itemId}`));
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
    enabled: !isNaN(itemId),
  });

  if (isNaN(itemId)) return <div className="text-destructive">Invalid ID</div>;

  if (isLoading) return (
    <div className="space-y-4 max-w-3xl">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (!item) return (
    <div className="text-center py-16">
      <p className="text-muted-foreground">Packaging item not found.</p>
      <Button variant="outline" className="mt-4" onClick={() => setLocation("/packaging")}>Back to Packaging</Button>
    </div>
  );

  return <PackagingDetailForm item={item} />;
}

function PackagingDetailForm({ item }: { item: PackagingItem }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const itemId = item.id;

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const [quotationFile, setQuotationFile] = useState<File | null>(null);
  const [removingQuotation, setRemovingQuotation] = useState(false);
  const [specDocFile, setSpecDocFile] = useState<File | null>(null);
  const [removingSpecDoc, setRemovingSpecDoc] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nameEnglish: item.nameEnglish,
      nameThai: item.nameThai ?? "",
      category: item.category,
      supplier: item.supplier ?? "",
      unit: item.unit as "piece" | "roll" | "kg" | "meter",
      unitCost: item.unitCost,
      moq: item.moq ?? undefined,
      leadTimeDays: item.leadTimeDays ?? undefined,
      notes: item.notes ?? "",
      specContainsFdaInfo: false,
      ...specsToFormData(item.specs),
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
    if (file) setPhotoPreview(URL.createObjectURL(file));
    else setPhotoPreview(null);
  }

  async function uploadPhoto(id: number, file: File) {
    const ref = await uploadFileToStorage(file);
    await fetch(getApiUrl(`/packaging/${id}/photo`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ref),
    });
  }

  async function handleRemovePhoto() {
    setRemovingPhoto(true);
    try {
      await fetch(getApiUrl(`/packaging/${itemId}/photo`), { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["/api/packaging", itemId] });
      qc.invalidateQueries({ queryKey: ["/api/packaging"] });
      toast({ title: "Photo removed" });
    } catch {
      toast({ variant: "destructive", title: "Failed to remove photo" });
    } finally {
      setRemovingPhoto(false);
    }
  }

  async function handleRemoveQuotation() {
    setRemovingQuotation(true);
    try {
      await fetch(getApiUrl(`/packaging/${itemId}/quotation`), { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["/api/packaging", itemId] });
      toast({ title: "Quotation removed" });
    } catch {
      toast({ variant: "destructive", title: "Failed to remove quotation" });
    } finally {
      setRemovingQuotation(false);
    }
  }

  async function handleRemoveSpecDoc() {
    setRemovingSpecDoc(true);
    try {
      await fetch(getApiUrl(`/packaging/${itemId}/spec-doc`), { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["/api/packaging", itemId] });
      toast({ title: "Spec document removed" });
    } catch {
      toast({ variant: "destructive", title: "Failed to remove spec document" });
    } finally {
      setRemovingSpecDoc(false);
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
        specs: buildSpecs(data, data.category),
      };

      const r = await fetch(getApiUrl(`/packaging/${itemId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Failed to save");

      if (photoFile) {
        try {
          await uploadPhoto(itemId, photoFile);
          setPhotoFile(null);
          setPhotoPreview(null);
        } catch {
          toast({ variant: "destructive", title: "Saved but photo upload failed" });
        }
      }

      if (quotationFile) {
        try {
          const ref = await uploadFileToStorage(quotationFile);
          await fetch(getApiUrl(`/packaging/${itemId}/quotation`), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(ref),
          });
          setQuotationFile(null);
        } catch {
          toast({ variant: "destructive", title: "Saved but quotation upload failed" });
        }
      }

      if (specDocFile) {
        try {
          const ref = await uploadFileToStorage(specDocFile);
          await fetch(getApiUrl(`/packaging/${itemId}/spec-doc`), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(ref),
          });
          setSpecDocFile(null);
        } catch {
          toast({ variant: "destructive", title: "Saved but spec doc upload failed" });
        }
      }

      qc.invalidateQueries({ queryKey: ["/api/packaging", itemId] });
      qc.invalidateQueries({ queryKey: ["/api/packaging"] });
      toast({ title: "Changes saved" });
    } catch (err) {
      toast({ variant: "destructive", title: String(err instanceof Error ? err.message : err) });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await fetch(getApiUrl(`/packaging/${itemId}`), { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["/api/packaging"] });
      toast({ title: "Item deleted" });
      setLocation("/packaging");
    } catch {
      toast({ variant: "destructive", title: "Failed to delete" });
      setIsDeleting(false);
    }
  }

  const currentPhotoUrl = item.photoObjectPath ? getApiUrl(`/storage/objects${item.photoObjectPath.replace(/^\/objects/, "")}`) : null;
  const currentQuotationUrl = (item as any).quotationObjectPath ? getApiUrl(`/storage/objects${(item as any).quotationObjectPath.replace(/^\/objects/, "")}`) : null;
  const currentSpecDocUrl = (item as any).specDocObjectPath ? getApiUrl(`/storage/objects${(item as any).specDocObjectPath.replace(/^\/objects/, "")}`) : null;
  const isSachet = item.category === "sachet_primary_bag";

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/packaging")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{item.nameEnglish}</h1>
            <p className="text-muted-foreground text-sm">{categoryLabel(item.category)} · Added {formatDate(item.createdAt)}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowDeleteDialog(true)} className="text-destructive border-destructive hover:bg-destructive/10">
          <Trash2 className="w-4 h-4 mr-1" /> Delete
        </Button>
      </div>

      {isSachet && item.specs && ((item.specs as any).bagType || (item.specs as any).buttSealMm != null || (item.specs as any).sideSealMm != null) && (
        <div className="flex flex-wrap gap-2">
          {(item.specs as any).bagType && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 border border-purple-100">
              <span className="text-xs text-muted-foreground">Bag Type</span>
              <span className="text-sm font-medium text-purple-800">{bagTypeLabel((item.specs as any).bagType)}</span>
            </div>
          )}
          {(item.specs as any).buttSealMm != null && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/60 border">
              <span className="text-xs text-muted-foreground">Butt Seal</span>
              <span className="text-sm font-medium">{(item.specs as any).buttSealMm} mm</span>
            </div>
          )}
          {(item.specs as any).sideSealMm != null && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/60 border">
              <span className="text-xs text-muted-foreground">Side Seal</span>
              <span className="text-sm font-medium">{(item.specs as any).sideSealMm} mm</span>
            </div>
          )}
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Basic Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField control={form.control} name="nameEnglish" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Item Name (English) <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="nameThai" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Item Name (Thai)</FormLabel>
                    <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category <span className="text-destructive">*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
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
                    <FormControl><Input {...field} value={field.value || ""} /></FormControl>
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
                    <FormControl><Input type="number" step="1" min="1" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField control={form.control} name="leadTimeDays" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lead Time (days)</FormLabel>
                    <FormControl><Input type="number" step="1" min="0" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea rows={2} {...field} value={field.value || ""} /></FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {category && (
            <Card>
              <CardHeader><CardTitle className="text-base">Specifications</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <CategorySpecFields form={form} category={category} costPerRun={costPerRun} />
              </CardContent>
            </Card>
          )}

          {/* Documents & Media */}
          <Card>
              <CardHeader><CardTitle className="text-base">Documents & Media</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                {/* Product Photo */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Product Photo</p>
                  <div className="flex gap-4 flex-wrap">
                    {currentPhotoUrl && !photoPreview && (
                      <div className="relative inline-block">
                        <img src={currentPhotoUrl} alt="Product" className="w-40 h-40 object-cover rounded-lg border" />
                        <Button
                          type="button" variant="destructive" size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                          onClick={handleRemovePhoto} disabled={removingPhoto}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                    {photoPreview && (
                      <div className="relative inline-block">
                        <img src={photoPreview} alt="New photo preview" className="w-40 h-40 object-cover rounded-lg border border-primary" />
                        <Button
                          type="button" variant="destructive" size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                          onClick={() => handlePhotoChange(null)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                    {!photoPreview && (
                      <label className="flex flex-col items-center justify-center w-40 h-40 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors">
                        <Image className="w-6 h-6 text-muted-foreground mb-2" />
                        <span className="text-xs text-muted-foreground text-center">{currentPhotoUrl ? "Replace photo" : "Upload photo"}<br/>JPG or PNG</span>
                        <input
                          type="file" accept="image/jpeg,image/jpg,image/png" className="hidden"
                          onChange={e => handlePhotoChange(e.target.files?.[0] ?? null)}
                        />
                      </label>
                    )}
                  </div>
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
                  ) : currentQuotationUrl ? (
                    <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/40">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate flex-1">{(item as any).quotationFileName ?? "Quotation"}</span>
                      <a href={currentQuotationUrl} target="_blank" rel="noopener noreferrer">
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                          <Download className="w-3 h-3" />
                        </Button>
                      </a>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-destructive hover:text-destructive" onClick={handleRemoveQuotation} disabled={removingQuotation}>
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
                  {currentQuotationUrl && !quotationFile && (
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <input
                        type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden"
                        onChange={e => setQuotationFile(e.target.files?.[0] ?? null)}
                      />
                      Replace file
                    </label>
                  )}
                  {quotationFile && currentQuotationUrl && (
                    <p className="text-xs text-muted-foreground">Will replace existing file on save</p>
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
                  ) : currentSpecDocUrl ? (
                    <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/40">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate flex-1">{(item as any).specDocFileName ?? "Spec Document"}</span>
                      <a href={currentSpecDocUrl} target="_blank" rel="noopener noreferrer">
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                          <Download className="w-3 h-3" />
                        </Button>
                      </a>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-destructive hover:text-destructive" onClick={handleRemoveSpecDoc} disabled={removingSpecDoc}>
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
                  {currentSpecDocUrl && !specDocFile && (
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <input
                        type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden"
                        onChange={e => setSpecDocFile(e.target.files?.[0] ?? null)}
                      />
                      Replace file
                    </label>
                  )}
                  {specDocFile && currentSpecDocUrl && (
                    <p className="text-xs text-muted-foreground">Will replace existing file on save</p>
                  )}
                </div>
              </CardContent>
            </Card>

          <div className="flex gap-3">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
            <Button type="button" variant="outline" onClick={() => setLocation("/packaging")}>Cancel</Button>
          </div>
        </form>
      </Form>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete packaging item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{item.nameEnglish}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CategorySpecFields({ form, category, costPerRun }: { form: ReturnType<typeof useForm<FormData>>; category: string; costPerRun: string | null }) {
  const numField = (name: keyof FormData, label: string) => (
    <FormField control={form.control} name={name} render={({ field }) => (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        <FormControl><Input type="number" step="any" min="0" {...field} value={(field.value as string | number | undefined) ?? ""} /></FormControl>
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
      {txtField("specMaterial", "Material")}
      {numField("specWidthMm", "Width (mm)")}
      {numField("specLengthMm", "Length (mm)")}
      {numField("specButtSealMm", "Butt Seal (mm)")}
      {numField("specSideSealMm", "Side Seal (mm)")}
      {numField("specThicknessMicron", "Thickness (micron)")}
    </div>
  );

  if (category === "inner_bag") return (
    <div className="grid gap-4 md:grid-cols-2">
      {txtField("specMaterial", "Material")}
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
      {txtField("specMaterial", "Material")}
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
      {txtField("specMaterial", "Material")}
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
      {txtField("specMaterial", "Material")}
      {numField("specRollWidthMm", "Roll Width (mm)")}
      {numField("specThicknessMicron", "Thickness (micron)")}
    </div>
  );

  if (category === "tray_insert") return (
    <div className="grid gap-4 md:grid-cols-2">
      {txtField("specMaterial", "Material")}
      {numField("specLengthMm", "Length (mm)")}
      {numField("specWidthMm", "Width (mm)")}
      {numField("specHeightMm", "Height (mm)")}
    </div>
  );

  if (category === "printing_block") return (
    <div className="grid gap-4 md:grid-cols-2">
      {txtField("specBlockName", "Block Name")}
      {numField("specTotalBlockCost", "Total Block Cost (฿)")}
      {numField("specExpectedPrintRuns", "Expected Print Runs")}
      <div className="space-y-2">
        <label className="text-sm font-medium leading-none">Cost per Run (฿) — auto</label>
        <Input readOnly value={costPerRun != null ? `฿${parseFloat(costPerRun).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : "—"} className="bg-muted" />
      </div>
      {txtField("specLinkedPackagingItem", "Linked Packaging Item")}
    </div>
  );

  if (category === "other") return (
    <FormField control={form.control} name="specDescription" render={({ field }) => (
      <FormItem>
        <FormLabel>Description</FormLabel>
        <FormControl><Textarea rows={3} {...field} value={field.value || ""} /></FormControl>
      </FormItem>
    )} />
  );

  return null;
}
