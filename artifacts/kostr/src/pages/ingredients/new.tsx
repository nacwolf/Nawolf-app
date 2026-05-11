import { useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Upload, X, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@/lib/queryClient";

const INGREDIENT_CATEGORIES = ["Raw Materials", "Packaging", "Quality & Compliance", "Delivery"] as const;
const UNITS = ["g", "kg", "liter", "ml", "piece", "box", "bag", "roll", "unit", "hr"] as const;

const newIngredientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  subCategory: z.string().optional(),
  description: z.string().optional(),
  supplier: z.string().optional(),
  unit: z.string().min(1, "Unit is required"),
  initialPrice: z.coerce.number().min(0, "Must be ≥ 0").optional(),
  priceTier1: z.coerce.number().min(0).optional(),
  priceTier1Description: z.string().optional(),
  priceTier2: z.coerce.number().min(0).optional(),
  priceTier2Description: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof newIngredientSchema>;

interface PendingFile {
  file: File;
  id: string;
}

export default function NewIngredient({ initialCategory }: { initialCategory?: string }) {
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(newIngredientSchema),
    defaultValues: {
      name: "",
      category: initialCategory ?? "Raw Materials",
      subCategory: "",
      description: "",
      supplier: "",
      unit: "kg",
      initialPrice: undefined,
      priceTier1: undefined,
      priceTier1Description: "",
      priceTier2: undefined,
      priceTier2Description: "",
      notes: "",
    },
  });

  function addFiles(files: FileList | null) {
    if (!files) return;
    const allowed = Array.from(files).filter(
      (f) => f.type === "application/pdf" || f.type === "image/jpeg" || f.type === "image/jpg"
    );
    if (allowed.length < files.length) {
      toast({ variant: "destructive", title: "Only PDF and JPEG files are accepted" });
    }
    setPendingFiles((prev) => [
      ...prev,
      ...allowed.map((f) => ({ file: f, id: crypto.randomUUID() })),
    ]);
  }

  function removeFile(id: string) {
    setPendingFiles((prev) => prev.filter((f) => f.id !== id));
  }

  async function uploadFile(file: File): Promise<string> {
    const urlRes = await fetch(getApiUrl("/storage/uploads/request-url"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
    });
    if (!urlRes.ok) throw new Error("Failed to get upload URL");
    const { uploadURL, objectPath } = await urlRes.json();
    const putRes = await fetch(uploadURL, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });
    if (!putRes.ok) throw new Error("Failed to upload file");
    return objectPath;
  }

  async function onSubmit(data: FormData) {
    setIsSaving(true);
    try {
      const payload = {
        name: data.name,
        category: data.category,
        subCategory: data.subCategory || null,
        description: data.description || null,
        unit: data.unit,
        supplier: data.supplier || null,
        initialPrice: data.initialPrice ?? null,
        priceTier1: data.priceTier1 ?? null,
        priceTier1Description: data.priceTier1Description || null,
        priceTier2: data.priceTier2 ?? null,
        priceTier2Description: data.priceTier2Description || null,
        notes: data.notes || null,
      };

      const res = await fetch(getApiUrl("/ingredients"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create");
      }

      const ingredient = await res.json();

      if (pendingFiles.length > 0) {
        setIsUploading(true);
        for (const pf of pendingFiles) {
          try {
            const objectPath = await uploadFile(pf.file);
            await fetch(getApiUrl(`/ingredients/${ingredient.id}/attachments`), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fileName: pf.file.name,
                objectPath,
                fileType: pf.file.type,
              }),
            });
          } catch {
            toast({ variant: "destructive", title: `Failed to upload ${pf.file.name}` });
          }
        }
      }

      toast({ title: "Item added successfully" });
      setLocation(`/ingredients/${ingredient.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save";
      toast({ variant: "destructive", title: message });
    } finally {
      setIsSaving(false);
      setIsUploading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/ingredients")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Add item</h1>
          <p className="text-sm text-muted-foreground">Raw material or packaging element</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Basic Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name <span className="text-destructive">*</span></FormLabel>
                  <FormControl><Input placeholder="e.g. Tapioca Starch" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category <span className="text-destructive">*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {INGREDIENT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="subCategory" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sub-category <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl><Input placeholder="e.g. chips, sauce mix, seeds" {...field} value={field.value || ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Product Description <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl><Textarea placeholder="Describe the item, grade, specification, etc." rows={3} {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="supplier" render={({ field }) => (
                <FormItem>
                  <FormLabel>Supplier <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl><Input placeholder="Supplier name" {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Pricing (THB)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="initialPrice" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Price (THB)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">฿</span>
                        <Input type="number" step="0.0001" min="0" placeholder="0.00" className="pl-7" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="unit" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Per Unit <span className="text-destructive">*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <Separator />

              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Price Tier 1 <span className="font-normal">(optional)</span></p>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="priceTier1" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount (THB / unit)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">฿</span>
                          <Input type="number" step="0.0001" min="0" placeholder="0.00" className="pl-7" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="priceTier1Description" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl><Input placeholder="e.g. ≥ 100 kg" {...field} value={field.value || ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Price Tier 2 <span className="font-normal">(optional)</span></p>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="priceTier2" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount (THB / unit)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">฿</span>
                          <Input type="number" step="0.0001" min="0" placeholder="0.00" className="pl-7" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="priceTier2Description" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl><Input placeholder="e.g. ≥ 500 kg" {...field} value={field.value || ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Additional Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/30 px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
                  {(user?.fullName || user?.username || "?")[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium">Created by</p>
                  <p className="text-xs text-muted-foreground">{user?.fullName || user?.username || "Current user"}</p>
                </div>
              </div>

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl><Textarea placeholder="Any additional notes about this item..." rows={3} {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Receipts & Quotations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Upload PDF or JPEG files (receipts, quotations, invoices).</p>

              <label
                className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-muted-foreground/30 rounded-lg cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
              >
                <Upload className="w-6 h-6 text-muted-foreground mb-1" />
                <p className="text-sm text-muted-foreground">Click to browse or drag & drop</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">PDF, JPEG only</p>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg"
                  multiple
                  className="hidden"
                  onChange={e => addFiles(e.target.files)}
                />
              </label>

              {pendingFiles.length > 0 && (
                <div className="space-y-2">
                  {pendingFiles.map(pf => (
                    <div key={pf.id} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2">
                      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm flex-1 truncate">{pf.file.name}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">{(pf.file.size / 1024).toFixed(0)} KB</span>
                      <button type="button" onClick={() => removeFile(pf.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setLocation("/ingredients")}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isSaving || isUploading}>
              {(isSaving || isUploading) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isUploading ? "Uploading files..." : isSaving ? "Saving..." : "Save item"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
