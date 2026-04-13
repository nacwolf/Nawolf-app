import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateSku, useListIngredients } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatPercent } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";

const CATEGORY_COLORS: Record<string, string> = {
  "Raw Material": "bg-green-100 text-green-800",
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
  const createSku = useCreateSku();

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

  const margin = watchSellPrice > 0 ? (watchSellPrice - liveCalc.totalCogs) / watchSellPrice : 0;
  const marginStatus = margin > 0.25 ? "healthy" : margin > 0.1 ? "review" : "critical";
  const targetPrice30 = liveCalc.totalCogs > 0 ? liveCalc.totalCogs / 0.70 : null;

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
                      <FormLabel>Sell Price (€)</FormLabel>
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
                </CardContent>
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
                        <span className="text-muted-foreground">Total COGS</span>
                        <span className="font-medium">{formatCurrency(liveCalc.totalCogs)}</span>
                      </div>
                      <div className="border-t pt-2 flex justify-between">
                        <span className="text-sm text-muted-foreground">Margin €/unit</span>
                        <span className="font-semibold">{formatCurrency(watchSellPrice - liveCalc.totalCogs)}</span>
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
