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
import { Loader2, Plus, Trash2, ChevronDown, ChevronUp, Printer, ImagePlus, X } from "lucide-react";
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
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  unitSize: z.string().min(1, "Unit size is required"),
  sellPrice: z.coerce.number().min(0.01, "Sell price must be > 0"),
  customerName: z.string().optional(),
  notes: z.string().optional(),
  costLines: z.array(z.object({
    ingredientId: z.coerce.number().min(1, "Select an ingredient"),
    quantityPerUnit: z.coerce.number().min(0.0001, "Quantity must be > 0"),
    notes: z.string().optional()
  })).optional()
});

type SkuFormValues = z.infer<typeof skuFormSchema>;

export default function SkuNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: ingredients } = useListIngredients();
  const { data: blockSuppliers } = useListPrintingBlockSuppliers();
  const createSku = useCreateSku();
  const setBlockConfig = useSetSkuPrintingBlockConfig();

  const [blockSectionOpen, setBlockSectionOpen] = useState(false);
  const [blockSupplierId, setBlockSupplierId] = useState<string>("");
  const [blockNumBlocks, setBlockNumBlocks] = useState<string>("");
  const [blockMoq, setBlockMoq] = useState<string>("");

  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPendingPhoto(file);
    if (file.type.startsWith("image/")) {
      setPhotoPreview(URL.createObjectURL(file));
    } else {
      setPhotoPreview(null);
    }
  }

  function clearPhoto() {
    setPendingPhoto(null);
    setPhotoPreview(null);
  }

  const form = useForm<SkuFormValues>({
    resolver: zodResolver(skuFormSchema),
    defaultValues: {
      skuCode: "",
      name: "",
      category: "",
      unitSize: "",
      sellPrice: 0,
      customerName: "",
      notes: "",
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
    name,
    value,
    pct: liveCalc.totalCogs > 0 ? (value / liveCalc.totalCogs) * 100 : 0,
  })).sort((a, b) => b.value - a.value);

  async function onSubmit(data: SkuFormValues) {
    try {
      const res = await createSku.mutateAsync({
        data: {
          ...data,
          customerName: data.customerName || null,
          costLines: data.costLines?.map(l => ({ ...l, notes: l.notes || null }))
        }
      });
      if (blockSupplierId && blockNumBlocks && blockMoq) {
        try {
          await setBlockConfig.mutateAsync({
            id: res.id,
            data: {
              supplierId: parseInt(blockSupplierId, 10),
              numBlocks: parseInt(blockNumBlocks, 10),
              moq: parseInt(blockMoq, 10),
            }
          });
        } catch {
          toast({ variant: "destructive", title: "SKU created but block config failed", description: "You can set it on the SKU detail page." });
        }
      }
      if (pendingPhoto) {
        try {
          const urlRes = await fetch(getApiUrl("/storage/uploads/request-url"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: pendingPhoto.name, size: pendingPhoto.size, contentType: pendingPhoto.type || "application/octet-stream" }),
          });
          if (urlRes.ok) {
            const { uploadURL, objectPath } = await urlRes.json();
            const putRes = await fetch(uploadURL, { method: "PUT", body: pendingPhoto, headers: { "Content-Type": pendingPhoto.type || "application/octet-stream" } });
            if (putRes.ok) {
              await fetch(getApiUrl(`/skus/${res.id}/photo`), {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ objectPath, contentType: pendingPhoto.type }),
              });
            }
          }
        } catch {
          // photo upload failure is non-fatal — SKU was created, photo can be added from detail page
        }
      }
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
        <p className="text-muted-foreground">Define your product and its full cost structure.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1 space-y-6">
              <Card>
                <CardHeader><CardTitle className="text-base">Basic Information</CardTitle></CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <FormField control={form.control} name="skuCode" render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU Code</FormLabel>
                      <FormControl><Input placeholder="e.g. FG-1001" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product Name</FormLabel>
                      <FormControl><Input placeholder="e.g. Organic Almond Butter 250g" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="category" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                        <SelectContent>
                          {SKU_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="unitSize" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit Size</FormLabel>
                      <FormControl><Input placeholder="e.g. 250g bag" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="sellPrice" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sell Price (฿)</FormLabel>
                      <FormControl><Input type="number" step="0.01" min="0" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="customerName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer (Optional)</FormLabel>
                      <FormControl><Input placeholder="If specific to a customer" {...field} value={field.value || ""} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="notes" render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Notes (Optional)</FormLabel>
                      <FormControl><Textarea placeholder="Any additional notes..." {...field} value={field.value || ""} /></FormControl>
                    </FormItem>
                  )} />
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-sm font-medium leading-none">Product Photo (Optional)</label>
                    {pendingPhoto ? (
                      <div className="relative group w-full">
                        {photoPreview ? (
                          <img src={photoPreview} alt="Preview" className="w-full h-40 object-cover rounded-lg border bg-muted" />
                        ) : (
                          <div className="flex flex-col items-center justify-center w-full h-40 border-2 rounded-lg bg-muted/30 gap-2">
                            <ImagePlus className="w-6 h-6 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{pendingPhoto.name}</span>
                          </div>
                        )}
                        <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button type="button" size="sm" variant="secondary" className="h-7 px-2 text-xs shadow" onClick={() => photoInputRef.current?.click()}>Replace</Button>
                          <Button type="button" size="sm" variant="secondary" className="h-7 w-7 p-0 shadow" onClick={clearPhoto} title="Remove photo"><X className="w-3 h-3" /></Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-muted-foreground/25 rounded-lg hover:border-primary/50 hover:bg-muted/20 transition-colors"
                      >
                        <ImagePlus className="w-5 h-5 text-muted-foreground mb-1" />
                        <span className="text-sm text-muted-foreground">Add photo</span>
                        <span className="text-xs text-muted-foreground/60 mt-0.5">JPG · PNG · PDF</span>
                      </button>
                    )}
                    <input ref={photoInputRef} type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" className="hidden" onChange={handlePhotoSelect} />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-purple-500">
                <button
                  type="button"
                  className="w-full px-6 py-4 bg-purple-50 flex items-center justify-between gap-3 rounded-t-xl"
                  onClick={() => setBlockSectionOpen(o => !o)}
                >
                  <div className="flex items-center gap-3">
                    <Printer className="w-4 h-4 text-purple-600 flex-shrink-0" />
                    <div className="text-left">
                      <div className="text-sm font-bold uppercase tracking-wider text-purple-700">Printing Blocks</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {blockAmortizedCost > 0
                          ? `Amortized cost: ${formatCurrency(blockAmortizedCost)}/unit`
                          : "Optional — include amortized block costs in COGS"}
                      </div>
                    </div>
                  </div>
                  {blockSectionOpen
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {blockSectionOpen && (
                  <CardContent className="pt-4 space-y-3">
                    {(blockSuppliers?.length ?? 0) === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No printing block suppliers yet. Add one in the Cost Library first.
                      </p>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Supplier</label>
                            <Select value={blockSupplierId} onValueChange={setBlockSupplierId}>
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select supplier..." />
                              </SelectTrigger>
                              <SelectContent>
                                {blockSuppliers?.map(s => (
                                  <SelectItem key={s.id} value={String(s.id)}>
                                    {s.name} ({formatCurrency(s.pricePerBlock)}/block)
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Number of blocks</label>
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              placeholder="e.g. 4"
                              value={blockNumBlocks}
                              onChange={e => setBlockNumBlocks(e.target.value)}
                              className="h-9"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">MOQ (units)</label>
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              placeholder="e.g. 5000"
                              value={blockMoq}
                              onChange={e => setBlockMoq(e.target.value)}
                              className="h-9"
                            />
                          </div>
                        </div>
                        {blockAmortizedCost > 0 && (
                          <div className="text-sm text-purple-700 font-medium bg-purple-50 rounded px-3 py-2">
                            Printing Blocks (amortized over {parseInt(blockMoq, 10).toLocaleString()} units):{" "}
                            <span className="font-bold">{formatCurrency(blockAmortizedCost)}/unit</span>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                )}
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Bill of Materials</CardTitle>
                  <span className="text-sm text-muted-foreground">{fields.length} cost line{fields.length !== 1 ? "s" : ""}</span>
                </CardHeader>
                <CardContent className="space-y-3">
                  {fields.map((field, index) => {
                    const ingId = form.watch(`costLines.${index}.ingredientId`);
                    const qty = form.watch(`costLines.${index}.quantityPerUnit`);
                    const ing = ingredients?.find(i => i.id === ingId);
                    const lineCost = ing?.currentPrice && qty ? ing.currentPrice * qty : null;
                    return (
                      <div key={field.id} className="border rounded-lg p-4 space-y-3 bg-muted/30">
                        <div className="flex items-center justify-between gap-2">
                          {ing && (
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${CATEGORY_COLORS[ing.category] || "bg-gray-100 text-gray-700"}`}>
                              {ing.category}
                            </span>
                          )}
                          <div className="flex-1" />
                          {lineCost != null && (
                            <span className="text-sm font-semibold text-right">{formatCurrency(lineCost)}</span>
                          )}
                          <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="text-destructive hover:text-destructive h-7 w-7">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <FormField control={form.control} name={`costLines.${index}.ingredientId`} render={({ field }) => (
                            <FormItem className="sm:col-span-2">
                              <FormLabel className="text-xs">Ingredient / Cost Item</FormLabel>
                              <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value ? field.value.toString() : ""}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                                <SelectContent>
                                  {Object.entries(grouped).map(([cat, items]) => (
                                    <div key={cat}>
                                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted">{cat}</div>
                                      {items.map(i => (
                                        <SelectItem key={i.id} value={i.id.toString()}>
                                          {i.name} ({formatCurrency(i.currentPrice)}/{i.unit})
                                        </SelectItem>
                                      ))}
                                    </div>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name={`costLines.${index}.quantityPerUnit`} render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Qty {ing ? `(${ing.unit})` : ""}</FormLabel>
                              <FormControl><Input type="number" step="0.0001" {...field} /></FormControl>
                              {ing?.category === "Labor" && (
                                <FormDescription className="text-xs">Hours per unit — e.g. 0.083 = 5 min</FormDescription>
                              )}
                              {(ing?.category === "Overhead" || ing?.category === "Quality & Compliance" || ing?.category === "Delivery") && (
                                <FormDescription className="text-xs">Typically 1 (pre-calc per-unit cost)</FormDescription>
                              )}
                              <FormMessage />
                            </FormItem>
                          )} />
                        </div>
                        <FormField control={form.control} name={`costLines.${index}.notes`} render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Notes (Optional)</FormLabel>
                            <FormControl><Input placeholder="e.g. 5% waste factor" {...field} value={field.value || ""} className="h-8 text-sm" /></FormControl>
                          </FormItem>
                        )} />
                      </div>
                    );
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => append({ ingredientId: 0, quantityPerUnit: 1, notes: "" })}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" /> Add Cost Line
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="lg:w-72 xl:w-80">
              <div className="sticky top-6 space-y-4">
                <Card className="border-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Live Margin Preview</CardTitle>
                  </CardHeader>
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
                      <div className="mt-1">
                        {watchSellPrice > 0 && liveCalc.totalCogs > 0 && (
                          <StatusBadge status={marginStatus} />
                        )}
                      </div>
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
                            <div className="flex justify-between text-xs mb-0.5">
                              <span>{d.name}</span>
                              <span className="font-medium">{d.pct.toFixed(0)}%</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary transition-all"
                                style={{ width: `${d.pct}%` }}
                              />
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
                    {createSku.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create SKU
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
