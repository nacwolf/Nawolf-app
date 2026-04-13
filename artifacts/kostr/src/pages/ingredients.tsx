import { useState, useMemo } from "react";
import { useListIngredients, useCreateIngredient, useUpdateIngredientPrice, getListIngredientsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, TrendingUp, TrendingDown, Minus, Pencil } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/queryClient";

const CATEGORIES = [
  "Raw Materials",
  "Packaging",
  "Labor",
  "Overhead",
  "Quality & Compliance",
  "Delivery",
] as const;
type IngredientCategory = (typeof CATEGORIES)[number];

const CATEGORY_COLORS: Record<string, string> = {
  "Raw Materials": "bg-green-100 text-green-800 border-green-200",
  "Packaging": "bg-purple-100 text-purple-800 border-purple-200",
  "Labor": "bg-orange-100 text-orange-800 border-orange-200",
  "Overhead": "bg-slate-100 text-slate-700 border-slate-200",
  "Quality & Compliance": "bg-blue-100 text-blue-800 border-blue-200",
  "Delivery": "bg-amber-100 text-amber-800 border-amber-200",
};

const CATEGORY_DOT: Record<string, string> = {
  "Raw Materials": "bg-green-500",
  "Packaging": "bg-purple-500",
  "Labor": "bg-orange-500",
  "Overhead": "bg-slate-400",
  "Quality & Compliance": "bg-blue-500",
  "Delivery": "bg-amber-600",
};

const CATEGORY_HEADER_BG: Record<string, string> = {
  "Raw Materials": "bg-green-50 border-b border-green-100",
  "Packaging": "bg-purple-50 border-b border-purple-100",
  "Labor": "bg-orange-50 border-b border-orange-100",
  "Overhead": "bg-slate-50 border-b border-slate-200",
  "Quality & Compliance": "bg-blue-50 border-b border-blue-100",
  "Delivery": "bg-amber-50 border-b border-amber-100",
};

const CATEGORY_BORDER_LEFT: Record<string, string> = {
  "Raw Materials": "border-l-4 border-l-green-500",
  "Packaging": "border-l-4 border-l-purple-500",
  "Labor": "border-l-4 border-l-orange-500",
  "Overhead": "border-l-4 border-l-slate-400",
  "Quality & Compliance": "border-l-4 border-l-blue-500",
  "Delivery": "border-l-4 border-l-amber-600",
};

const CATEGORY_TITLE_COLOR: Record<string, string> = {
  "Raw Materials": "text-green-800",
  "Packaging": "text-purple-800",
  "Labor": "text-orange-800",
  "Overhead": "text-slate-700",
  "Quality & Compliance": "text-blue-800",
  "Delivery": "text-amber-800",
};

const UNITS_BY_CATEGORY: Record<string, string[]> = {
  "Raw Materials": ["kg", "g", "L", "ml", "each"],
  "Packaging": ["each"],
  "Labor": ["hour"],
  "Overhead": ["each"],
  "Quality & Compliance": ["each"],
  "Delivery": ["each"],
};

const ALL_UNITS = ["kg", "g", "L", "ml", "each", "hour"];

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "Raw Materials": "Base ingredients that go into your products",
  "Packaging": "Bags, boxes, labels, and other packaging items",
  "Labor": "Production labor at a fully-loaded hourly rate",
  "Overhead": "Pre-calculated fixed costs per unit (monthly fixed ÷ monthly output)",
  "Quality & Compliance": "Testing, certification, and compliance costs per unit",
  "Delivery": "Outbound delivery and logistics cost per unit",
};

const newItemSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  unit: z.string().min(1, "Unit is required"),
  supplier: z.string().optional(),
  initialPrice: z.coerce.number().min(0).optional(),
});

const editDetailsSchema = z.object({
  name: z.string().min(1, "Name is required"),
  supplier: z.string().optional(),
});

const updatePriceSchema = z.object({
  price: z.coerce.number().min(0, "Price must be >= 0"),
  effectiveDate: z.string(),
  reason: z.string().optional(),
});

function PriceChangeIndicator({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="text-muted-foreground text-xs">—</span>;
  const abs = Math.abs(pct);
  if (abs < 0.1) return <span className="text-muted-foreground text-xs flex items-center gap-0.5"><Minus className="w-3 h-3" /> 0.0%</span>;
  if (pct > 0) return <span className="text-red-600 text-xs flex items-center gap-0.5"><TrendingUp className="w-3 h-3" /> +{pct.toFixed(1)}%</span>;
  return <span className="text-green-600 text-xs flex items-center gap-0.5"><TrendingDown className="w-3 h-3" /> {pct.toFixed(1)}%</span>;
}

export default function CostElements() {
  const { data: ingredients, isLoading } = useListIngredients();
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createIngredient = useCreateIngredient();
  const updatePrice = useUpdateIngredientPrice();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addPrefilledCategory, setAddPrefilledCategory] = useState<string>("");
  const [editPanelId, setEditPanelId] = useState<number | null>(null);
  const [priceUpdating, setPriceUpdating] = useState(false);

  const addForm = useForm<z.infer<typeof newItemSchema>>({
    resolver: zodResolver(newItemSchema),
    defaultValues: { name: "", category: "", unit: "", supplier: "", initialPrice: undefined },
  });

  const editDetailsForm = useForm<z.infer<typeof editDetailsSchema>>({
    resolver: zodResolver(editDetailsSchema),
    defaultValues: { name: "", supplier: "" },
  });

  const priceForm = useForm<z.infer<typeof updatePriceSchema>>({
    resolver: zodResolver(updatePriceSchema),
    defaultValues: { price: 0, effectiveDate: new Date().toISOString().split("T")[0], reason: "" },
  });

  const watchAddCategory = addForm.watch("category");
  const availableUnits = UNITS_BY_CATEGORY[watchAddCategory] || ALL_UNITS;

  const editingIngredient = ingredients?.find((i) => i.id === editPanelId);

  const { data: affectedSkus } = useQuery({
    queryKey: ["ingredient-skus", editPanelId],
    queryFn: async () => {
      if (!editPanelId) return [];
      const res = await fetch(getApiUrl(`/ingredients/${editPanelId}/skus`), { credentials: "include" });
      return res.json() as Promise<{ id: number; name: string; skuCode: string }[]>;
    },
    enabled: !!editPanelId,
  });

  const byCategory = useMemo(() => {
    if (!ingredients) return {} as Record<string, typeof ingredients>;
    const filtered = search
      ? ingredients.filter(
          (i) =>
            i.name.toLowerCase().includes(search.toLowerCase()) ||
            (i.supplier || "").toLowerCase().includes(search.toLowerCase())
        )
      : ingredients;
    const grouped: Record<string, typeof ingredients> = {};
    for (const cat of CATEGORIES) grouped[cat] = [];
    for (const ing of filtered) {
      const cat = ing.category || "Raw Materials";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(ing);
    }
    return grouped;
  }, [ingredients, search]);

  function openAdd(prefilledCategory = "") {
    addForm.reset({
      name: "",
      category: prefilledCategory,
      unit: prefilledCategory ? (UNITS_BY_CATEGORY[prefilledCategory]?.[0] || "") : "",
      supplier: "",
      initialPrice: undefined,
    });
    setAddPrefilledCategory(prefilledCategory);
    setIsAddOpen(true);
  }

  function openEdit(ing: any) {
    setEditPanelId(ing.id);
    editDetailsForm.reset({ name: ing.name, supplier: ing.supplier || "" });
    priceForm.reset({
      price: ing.currentPrice || 0,
      effectiveDate: new Date().toISOString().split("T")[0],
      reason: "",
    });
    setPriceUpdating(false);
  }

  async function onAddSubmit(data: z.infer<typeof newItemSchema>) {
    try {
      await createIngredient.mutateAsync({
        data: { ...data, supplier: data.supplier || null, initialPrice: data.initialPrice ?? null },
      });
      toast({ title: "Cost item added" });
      setIsAddOpen(false);
      addForm.reset();
      queryClient.invalidateQueries({ queryKey: getListIngredientsQueryKey() });
    } catch {
      toast({ variant: "destructive", title: "Error adding item" });
    }
  }

  async function onEditDetailsSubmit(data: z.infer<typeof editDetailsSchema>) {
    if (!editPanelId) return;
    try {
      await fetch(getApiUrl(`/ingredients/${editPanelId}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name, supplier: data.supplier || null }),
      });
      toast({ title: "Details saved" });
      queryClient.invalidateQueries({ queryKey: getListIngredientsQueryKey() });
    } catch {
      toast({ variant: "destructive", title: "Error saving details" });
    }
  }

  async function onPriceSubmit(data: z.infer<typeof updatePriceSchema>) {
    if (!editPanelId) return;
    try {
      const res = await updatePrice.mutateAsync({
        id: editPanelId,
        data: { ...data, reason: data.reason || null },
      });
      toast({
        title: "Price updated",
        description: `${res.affectedSkuCount} SKU${res.affectedSkuCount === 1 ? "" : "s"} recalculated.`,
      });
      setPriceUpdating(false);
      queryClient.invalidateQueries({ queryKey: getListIngredientsQueryKey() });
    } catch {
      toast({ variant: "destructive", title: "Error updating price" });
    }
  }

  const totalItems = ingredients?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cost Elements</h1>
          <p className="text-muted-foreground">
            {totalItems} items across {CATEGORIES.length} cost categories
          </p>
        </div>
        <Button onClick={() => openAdd()}>
          <Plus className="w-4 h-4 mr-2" /> Add Cost Item
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search all cost elements..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <div className="h-14 bg-muted animate-pulse" />
              <CardContent className="pt-4"><Skeleton className="h-24 w-full" /></CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {CATEGORIES.map((cat) => {
            const items = byCategory[cat] || [];
            return (
              <Card key={cat} className={`overflow-hidden shadow-sm ${CATEGORY_BORDER_LEFT[cat]}`}>
                <div className={`px-6 py-4 ${CATEGORY_HEADER_BG[cat]}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <CardTitle className={`text-base font-bold uppercase tracking-wide ${CATEGORY_TITLE_COLOR[cat]}`}>
                        {cat}
                      </CardTitle>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[cat]}`}>
                        {items.length} item{items.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-shrink-0 h-7 text-xs bg-white/70 hover:bg-white"
                      onClick={() => openAdd(cat)}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Add
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{CATEGORY_DESCRIPTIONS[cat]}</p>
                </div>
                <CardContent className="p-0">
                  {items.length === 0 ? (
                    <div className="py-10 text-center text-muted-foreground text-sm">
                      No {cat.toLowerCase()} items yet.{" "}
                      <button
                        className="text-primary hover:underline"
                        onClick={() => openAdd(cat)}
                      >
                        Add one →
                      </button>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableHead className="pl-6">Name</TableHead>
                          <TableHead>Supplier</TableHead>
                          <TableHead className="text-right">Current Price</TableHead>
                          <TableHead className="text-right">Change</TableHead>
                          <TableHead className="text-right">Last Updated</TableHead>
                          <TableHead className="text-right">Used In</TableHead>
                          <TableHead className="w-10 pr-4" />
                        </TableRow>
                      </TableHeader>
                        <TableBody>
                          {items.map((ing) => (
                            <TableRow
                              key={ing.id}
                              className="cursor-pointer hover:bg-muted/50 group"
                              onClick={() => openEdit(ing)}
                            >
                              <TableCell className="pl-6">
                                <span className="font-medium group-hover:text-primary transition-colors">
                                  {ing.name}
                                </span>
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {ing.supplier || "—"}
                              </TableCell>
                              <TableCell className="text-right font-medium tabular-nums">
                                {ing.currentPrice
                                  ? `${formatCurrency(ing.currentPrice)} / ${ing.unit}`
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                <PriceChangeIndicator pct={(ing as any).priceChangePct} />
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground text-sm">
                                {formatDate(ing.priceEffectiveDate)}
                              </TableCell>
                              <TableCell className="text-right text-sm text-muted-foreground">
                                {ing.skuCount} SKU{ing.skuCount !== 1 ? "s" : ""}
                              </TableCell>
                              <TableCell className="text-right">
                                <button
                                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
                                  onClick={(e) => { e.stopPropagation(); openEdit(ing); }}
                                >
                                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                </button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Sheet open={!!editPanelId} onOpenChange={(open) => !open && setEditPanelId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle className="text-lg">{editingIngredient?.name}</SheetTitle>
            <SheetDescription>
              <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded border font-medium ${CATEGORY_COLORS[editingIngredient?.category || ""] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${CATEGORY_DOT[editingIngredient?.category || ""] || "bg-gray-400"}`} />
                {editingIngredient?.category}
              </span>
              <span className="ml-2 text-muted-foreground">· unit: {editingIngredient?.unit}</span>
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6">
            <div className="border rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-semibold">Details</h3>
              <Form {...editDetailsForm}>
                <form onSubmit={editDetailsForm.handleSubmit(onEditDetailsSubmit)} className="space-y-3">
                  <FormField control={editDetailsForm.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Name</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={editDetailsForm.control} name="supplier" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Supplier (Optional)</FormLabel>
                      <FormControl><Input placeholder="e.g. Acme Foods Ltd" {...field} value={field.value || ""} /></FormControl>
                    </FormItem>
                  )} />
                  <Button type="submit" size="sm" variant="secondary" disabled={editDetailsForm.formState.isSubmitting}>
                    Save Details
                  </Button>
                </form>
              </Form>
            </div>

            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Price</h3>
                {!priceUpdating && (
                  <Button variant="outline" size="sm" onClick={() => setPriceUpdating(true)}>
                    Update Price
                  </Button>
                )}
              </div>

              <div className="flex items-center justify-between bg-muted rounded-lg px-3 py-2">
                <span className="text-sm text-muted-foreground">Current</span>
                <span className="font-semibold tabular-nums">
                  {editingIngredient?.currentPrice
                    ? `${formatCurrency(editingIngredient.currentPrice)} / ${editingIngredient.unit}`
                    : "No price set"}
                </span>
              </div>

              {priceUpdating && (
                <Form {...priceForm}>
                  <form onSubmit={priceForm.handleSubmit(onPriceSubmit)} className="space-y-3">
                    <FormField control={priceForm.control} name="price" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">New Price per {editingIngredient?.unit}</FormLabel>
                        <FormControl><Input type="number" step="0.0001" autoFocus {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={priceForm.control} name="effectiveDate" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Effective Date</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={priceForm.control} name="reason" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Reason (Optional)</FormLabel>
                        <FormControl><Input placeholder="e.g. Supplier increase Q3" {...field} value={field.value || ""} /></FormControl>
                      </FormItem>
                    )} />
                    <div className="flex gap-2 pt-1">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setPriceUpdating(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" size="sm" disabled={updatePrice.isPending}>
                        {updatePrice.isPending ? "Saving..." : "Confirm Update"}
                      </Button>
                    </div>
                  </form>
                </Form>
              )}
            </div>

            {affectedSkus !== undefined && (
              <div className="border rounded-lg p-4 space-y-2">
                <h3 className="text-sm font-semibold">
                  Used in {affectedSkus.length} SKU{affectedSkus.length !== 1 ? "s" : ""}
                </h3>
                {affectedSkus.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Not used in any SKU yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {affectedSkus.map((sku) => (
                      <div key={sku.id} className="flex items-center gap-2 text-sm">
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{sku.skuCode}</span>
                        <span className="text-muted-foreground">{sku.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Cost Item</DialogTitle>
          </DialogHeader>
          <Form {...addForm}>
            <form onSubmit={addForm.handleSubmit(onAddSubmit)} className="space-y-4">
              <FormField control={addForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl><Input placeholder="e.g. Wheat Flour" autoFocus {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={addForm.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select
                      onValueChange={(v) => {
                        field.onChange(v);
                        addForm.setValue("unit", UNITS_BY_CATEGORY[v]?.[0] || "");
                      }}
                      value={field.value}
                    >
                      <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={addForm.control} name="unit" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                      <SelectContent>
                        {availableUnits.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {watchAddCategory === "Overhead" && (
                      <FormDescription className="text-xs">Monthly fixed ÷ monthly units</FormDescription>
                    )}
                    {watchAddCategory === "Labor" && (
                      <FormDescription className="text-xs">Fully-loaded hourly rate</FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={addForm.control} name="supplier" render={({ field }) => (
                <FormItem>
                  <FormLabel>Supplier (Optional)</FormLabel>
                  <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                </FormItem>
              )} />
              <FormField control={addForm.control} name="initialPrice" render={({ field }) => (
                <FormItem>
                  <FormLabel>Initial Price (€) — Optional</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.0001" placeholder="0.00" {...field} value={field.value ?? ""} />
                  </FormControl>
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createIngredient.isPending}>Add Item</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
