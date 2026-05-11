import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetIngredient,
  useGetIngredientPriceHistory,
  useListIngredientAttachments,
  useUpdateIngredient,
  useUpdateIngredientPrice,
  getGetIngredientQueryKey,
  getListIngredientAttachmentsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Save, Upload, X, FileText, Loader2, Download, ExternalLink } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@/lib/queryClient";

const UNITS = ["g", "kg", "liter", "ml", "piece", "box", "bag", "roll", "unit", "hr"] as const;

const INGREDIENT_CATEGORIES = ["Raw Materials", "Packaging", "Quality & Compliance", "Delivery"] as const;

const editSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.enum(INGREDIENT_CATEGORIES),
  unit: z.enum(UNITS),
  subCategory: z.string().optional(),
  description: z.string().optional(),
  supplier: z.string().optional(),
  priceTier1: z.coerce.number().min(0).optional(),
  priceTier1Description: z.string().optional(),
  priceTier2: z.coerce.number().min(0).optional(),
  priceTier2Description: z.string().optional(),
  notes: z.string().optional(),
});

const priceSchema = z.object({
  price: z.coerce.number().min(0.0001, "Price must be > 0"),
  effectiveDate: z.string().min(1, "Date required"),
  reason: z.string().optional(),
});

interface PendingFile { file: File; id: string; }

export default function IngredientDetail({ id }: { id: string }) {
  const ingredientId = parseInt(id, 10);
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);

  const { data: ingredient, isLoading: loadingIng } = useGetIngredient(ingredientId, {
    query: { enabled: !isNaN(ingredientId) }
  });

  const { data: history, isLoading: loadingHist } = useGetIngredientPriceHistory(ingredientId, {
    query: { enabled: !isNaN(ingredientId) }
  });

  const { data: attachments, isLoading: loadingAttachments } = useListIngredientAttachments(ingredientId, {
    query: { enabled: !isNaN(ingredientId) }
  });

  const updateIngredient = useUpdateIngredient();
  const updatePrice = useUpdateIngredientPrice();

  const editForm = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: "",
      category: "Raw Materials",
      unit: "kg",
      subCategory: "",
      description: "",
      supplier: "",
      priceTier1: undefined,
      priceTier1Description: "",
      priceTier2: undefined,
      priceTier2Description: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (ingredient) {
      editForm.reset({
        name: ingredient.name,
        category: (INGREDIENT_CATEGORIES as readonly string[]).includes(ingredient.category)
          ? (ingredient.category as typeof INGREDIENT_CATEGORIES[number])
          : "Raw Materials",
        unit: (UNITS as readonly string[]).includes(ingredient.unit)
          ? (ingredient.unit as typeof UNITS[number])
          : "kg",
        subCategory: ingredient.subCategory ?? "",
        description: ingredient.description ?? "",
        supplier: ingredient.supplier ?? "",
        priceTier1: ingredient.priceTier1 ?? undefined,
        priceTier1Description: ingredient.priceTier1Description ?? "",
        priceTier2: ingredient.priceTier2 ?? undefined,
        priceTier2Description: ingredient.priceTier2Description ?? "",
        notes: ingredient.notes ?? "",
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingredient?.id]);

  const priceForm = useForm<z.infer<typeof priceSchema>>({
    resolver: zodResolver(priceSchema),
    defaultValues: {
      price: 0,
      effectiveDate: new Date().toISOString().split("T")[0],
      reason: "",
    },
  });

  async function handleSaveDetails(data: z.infer<typeof editSchema>) {
    await updateIngredient.mutateAsync({
      id: ingredientId,
      data: {
        name: data.name,
        category: data.category,
        unit: data.unit,
        subCategory: data.subCategory || null,
        description: data.description || null,
        supplier: data.supplier || null,
        priceTier1: data.priceTier1 ?? null,
        priceTier1Description: data.priceTier1Description || null,
        priceTier2: data.priceTier2 ?? null,
        priceTier2Description: data.priceTier2Description || null,
        notes: data.notes || null,
      },
    });
    qc.invalidateQueries({ queryKey: getGetIngredientQueryKey(ingredientId) });
    toast({ title: "Details saved" });
  }

  async function handleUpdatePrice(data: z.infer<typeof priceSchema>) {
    const result = await updatePrice.mutateAsync({ id: ingredientId, data });
    qc.invalidateQueries({ queryKey: getGetIngredientQueryKey(ingredientId) });
    priceForm.reset({ price: 0, effectiveDate: new Date().toISOString().split("T")[0], reason: "" });
    toast({
      title: "Price updated",
      description: result.affectedSkuCount > 0
        ? `${result.affectedSkuCount} SKU${result.affectedSkuCount > 1 ? "s" : ""} recalculated`
        : undefined,
    });
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const allowed = Array.from(files).filter(
      f => f.type === "application/pdf" || f.type === "image/jpeg" || f.type === "image/jpg"
    );
    if (allowed.length < files.length) {
      toast({ variant: "destructive", title: "Only PDF and JPEG files are accepted" });
    }
    setPendingFiles(prev => [...prev, ...allowed.map(f => ({ file: f, id: crypto.randomUUID() }))]);
  }

  function removeFile(id: string) {
    setPendingFiles(prev => prev.filter(f => f.id !== id));
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

  async function handleUploadFiles() {
    if (pendingFiles.length === 0) return;
    setIsUploading(true);
    let successCount = 0;
    for (const pf of pendingFiles) {
      try {
        const objectPath = await uploadFile(pf.file);
        const attachRes = await fetch(getApiUrl(`/ingredients/${ingredientId}/attachments`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: pf.file.name,
            objectPath,
            fileType: pf.file.type,
            uploadedBy: user?.fullName || user?.username || user?.id || null,
          }),
        });
        if (!attachRes.ok) {
          const body = await attachRes.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error || "Failed to register attachment");
        }
        successCount++;
      } catch {
        toast({ variant: "destructive", title: `Failed to upload ${pf.file.name}` });
      }
    }
    if (successCount > 0) {
      setPendingFiles([]);
      qc.invalidateQueries({ queryKey: getListIngredientAttachmentsQueryKey(ingredientId) });
      toast({ title: `${successCount} file${successCount > 1 ? "s" : ""} uploaded` });
    }
    setIsUploading(false);
  }

  if (loadingIng) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!ingredient) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Item not found.</p>
        <Button variant="link" onClick={() => setLocation("/ingredients")}>Back to Cost Library</Button>
      </div>
    );
  }

  const chartData = history ? [...history].reverse().map(h => ({
    date: formatDate(h.effectiveDate),
    price: h.price,
  })) : [];

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/ingredients")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{ingredient.name}</h1>
          <p className="text-sm text-muted-foreground">
            {ingredient.category}{ingredient.subCategory ? ` · ${ingredient.subCategory}` : ""} · {ingredient.unit}
            {ingredient.createdBy && <span className="ml-2">· Added by {ingredient.createdBy}</span>}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Current Price</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {ingredient.currentPrice != null ? formatCurrency(ingredient.currentPrice) : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">per {ingredient.unit} · effective {formatDate(ingredient.priceEffectiveDate)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">SKU Exposure</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ingredient.skuCount}</div>
            <p className="text-xs text-muted-foreground mt-0.5">SKUs using this item</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleSaveDetails)} className="space-y-4">
              <FormField control={editForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {INGREDIENT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="subCategory" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sub-category</FormLabel>
                    <FormControl><Input placeholder="e.g. chips, sauce mix" {...field} value={field.value || ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={editForm.control} name="unit" render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={editForm.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Product Description</FormLabel>
                  <FormControl><Textarea rows={3} placeholder="Grade, specification, etc." {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={editForm.control} name="supplier" render={({ field }) => (
                <FormItem>
                  <FormLabel>Supplier</FormLabel>
                  <FormControl><Input placeholder="Supplier name" {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <Separator />

              <p className="text-sm font-medium text-muted-foreground">Price Tiers (THB / {ingredient.unit})</p>

              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="priceTier1" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tier 1 Amount (฿)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">฿</span>
                        <Input type="number" step="0.0001" min="0" className="pl-7" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="priceTier1Description" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tier 1 Description</FormLabel>
                    <FormControl><Input placeholder="e.g. ≥ 100 kg" {...field} value={field.value || ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="priceTier2" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tier 2 Amount (฿)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">฿</span>
                        <Input type="number" step="0.0001" min="0" className="pl-7" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="priceTier2Description" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tier 2 Description</FormLabel>
                    <FormControl><Input placeholder="e.g. ≥ 500 kg" {...field} value={field.value || ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <Separator />

              <FormField control={editForm.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea rows={3} placeholder="Any notes about this item..." {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <Button type="submit" disabled={updateIngredient.isPending} size="sm">
                {updateIngredient.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Save className="w-4 h-4 mr-2" />
                Save details
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Update Price</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...priceForm}>
            <form onSubmit={priceForm.handleSubmit(handleUpdatePrice)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={priceForm.control} name="price" render={({ field }) => (
                  <FormItem>
                    <FormLabel>New price (THB / {ingredient.unit})</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">฿</span>
                        <Input type="number" step="0.0001" className="pl-7" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={priceForm.control} name="effectiveDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Effective date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={priceForm.control} name="reason" render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl><Input placeholder="e.g. Supplier price increase" {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" size="sm" variant="secondary" disabled={updatePrice.isPending}>
                {updatePrice.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Record price change
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Price History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[240px] mb-6">
            {loadingHist ? <Skeleton className="h-full w-full" /> : (
              chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={v => `฿${v}`} fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(value: number) => [formatCurrency(value), 'Price']} />
                    <Line type="stepAfter" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No price history recorded yet</div>
              )
            )}
          </div>

          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>Effective Date</TableHead>
                  <TableHead className="text-right">Price (THB)</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Logged by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingHist ? (
                  <TableRow><TableCell colSpan={4}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                ) : history?.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-4 text-muted-foreground text-sm">No history yet.</TableCell></TableRow>
                ) : (
                  history?.map(h => (
                    <TableRow key={h.id}>
                      <TableCell>{formatDate(h.effectiveDate)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatCurrency(h.price)}</TableCell>
                      <TableCell className="text-muted-foreground">{h.reason || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{h.loggedBy || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Receipts & Quotations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingAttachments ? (
            <Skeleton className="h-16 w-full" />
          ) : (attachments?.length ?? 0) > 0 ? (
            <div className="space-y-2">
              {attachments?.map(att => (
                <div key={att.id} className="flex items-center gap-3 bg-muted/30 rounded-lg px-3 py-2.5">
                  <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{att.fileName}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(att.uploadedAt)}</p>
                  </div>
                  <a
                    href={getApiUrl(`/storage${att.objectPath}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:underline flex-shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No files attached yet.</p>
          )}

          <label
            className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-muted-foreground/30 rounded-lg cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
          >
            <Upload className="w-5 h-5 text-muted-foreground mb-1" />
            <p className="text-sm text-muted-foreground">Click or drag to add files (PDF, JPEG)</p>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg"
              multiple
              className="hidden"
              onChange={e => addFiles(e.target.files)}
            />
          </label>

          {pendingFiles.length > 0 && (
            <>
              <div className="space-y-2">
                {pendingFiles.map(pf => (
                  <div key={pf.id} className="flex items-center gap-2 bg-muted/20 rounded-lg px-3 py-2 border border-dashed">
                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm flex-1 truncate">{pf.file.name}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{(pf.file.size / 1024).toFixed(0)} KB</span>
                    <button type="button" onClick={() => removeFile(pf.id)} className="text-muted-foreground hover:text-destructive">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <Button size="sm" onClick={handleUploadFiles} disabled={isUploading}>
                {isUploading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Upload {pendingFiles.length} file{pendingFiles.length > 1 ? "s" : ""}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
