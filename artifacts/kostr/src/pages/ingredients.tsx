import { useState, useMemo } from "react";
import { useListIngredients, useCreateIngredient, useUpdateIngredientPrice, getListIngredientsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { getApiUrl } from "@/lib/queryClient";

const CATEGORIES = ["Raw Material", "Packaging", "Labor", "Overhead", "Quality & Compliance", "Delivery"] as const;
type IngredientCategory = (typeof CATEGORIES)[number];

const UNITS_BY_CATEGORY: Record<string, string[]> = {
  "Raw Material": ["kg", "g", "L", "ml", "each"],
  "Packaging": ["each"],
  "Labor": ["hour"],
  "Overhead": ["each"],
  "Quality & Compliance": ["each"],
  "Delivery": ["each"],
};

const ALL_UNITS = ["kg", "g", "L", "ml", "each", "hour"];

const newIngredientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  unit: z.string().min(1, "Unit is required"),
  supplier: z.string().optional(),
  initialPrice: z.coerce.number().min(0).optional(),
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

export default function IngredientsList() {
  const { data: ingredients, isLoading } = useListIngredients();
  const [search, setSearch] = useState("");
  const [categoryTab, setCategoryTab] = useState<string>("All");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createIngredient = useCreateIngredient();
  const updatePrice = useUpdateIngredientPrice();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [pricePanel, setPricePanel] = useState<number | null>(null);
  const [detailPanel, setDetailPanel] = useState<number | null>(null);

  const createForm = useForm<z.infer<typeof newIngredientSchema>>({
    resolver: zodResolver(newIngredientSchema),
    defaultValues: { name: "", category: "", unit: "", supplier: "", initialPrice: undefined }
  });

  const priceForm = useForm<z.infer<typeof updatePriceSchema>>({
    resolver: zodResolver(updatePriceSchema),
    defaultValues: { price: 0, effectiveDate: new Date().toISOString().split("T")[0], reason: "" }
  });

  const watchCategory = createForm.watch("category");
  const availableUnits = UNITS_BY_CATEGORY[watchCategory] || ALL_UNITS;

  const filteredIngredients = useMemo(() => {
    if (!ingredients) return [];
    return ingredients.filter((ing) => {
      const matchesSearch = !search || ing.name.toLowerCase().includes(search.toLowerCase()) || (ing.supplier || "").toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryTab === "All" || ing.category === categoryTab;
      return matchesSearch && matchesCategory;
    });
  }, [ingredients, search, categoryTab]);

  const updatingIngredient = ingredients?.find((i) => i.id === pricePanel);
  const detailIngredient = ingredients?.find((i) => i.id === detailPanel);

  const { data: affectedSkus } = useQuery({
    queryKey: ["ingredient-skus", pricePanel],
    queryFn: async () => {
      if (!pricePanel) return [];
      const res = await fetch(getApiUrl(`/ingredients/${pricePanel}/skus`), { credentials: "include" });
      return res.json() as Promise<{ id: number; name: string; skuCode: string }[]>;
    },
    enabled: !!pricePanel,
  });

  async function onCreateSubmit(data: z.infer<typeof newIngredientSchema>) {
    try {
      await createIngredient.mutateAsync({
        data: { ...data, supplier: data.supplier || null, initialPrice: data.initialPrice ?? null }
      });
      toast({ title: "Ingredient created" });
      setIsCreateOpen(false);
      createForm.reset();
      queryClient.invalidateQueries({ queryKey: getListIngredientsQueryKey() });
    } catch {
      toast({ variant: "destructive", title: "Error creating ingredient" });
    }
  }

  async function onPriceSubmit(data: z.infer<typeof updatePriceSchema>) {
    if (!pricePanel) return;
    try {
      const res = await updatePrice.mutateAsync({
        id: pricePanel,
        data: { ...data, reason: data.reason || null }
      });
      toast({ title: "Price updated", description: `${res.affectedSkuCount} SKU${res.affectedSkuCount === 1 ? "" : "s"} recalculated.` });
      setPricePanel(null);
      queryClient.invalidateQueries({ queryKey: getListIngredientsQueryKey() });
    } catch {
      toast({ variant: "destructive", title: "Error updating price" });
    }
  }

  function openPricePanel(ing: any) {
    setPricePanel(ing.id);
    priceForm.reset({
      price: ing.currentPrice || 0,
      effectiveDate: new Date().toISOString().split("T")[0],
      reason: ""
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ingredients Library</h1>
          <p className="text-muted-foreground">Track costs across all 6 cost types</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Add Ingredient</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Cost Item</DialogTitle>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                <FormField control={createForm.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="e.g. Wheat Flour" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={createForm.control} name="category" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={(v) => { field.onChange(v); createForm.setValue("unit", ""); }} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                        <SelectContent>
                          {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={createForm.control} name="unit" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                        <SelectContent>
                          {availableUnits.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {watchCategory === "Overhead" && (
                        <FormDescription className="text-xs">Monthly fixed costs ÷ monthly units produced</FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={createForm.control} name="supplier" render={({ field }) => (
                  <FormItem><FormLabel>Supplier (Optional)</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                )} />
                <FormField control={createForm.control} name="initialPrice" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Initial Price (€) — optional</FormLabel>
                    <FormControl><Input type="number" step="0.0001" placeholder="0.00" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createIngredient.isPending}>Save</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search ingredients..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 max-w-sm"
              />
            </div>
          </div>

          <Tabs value={categoryTab} onValueChange={setCategoryTab}>
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="All">All</TabsTrigger>
              {CATEGORIES.map((c) => <TabsTrigger key={c} value={c}>{c}</TabsTrigger>)}
            </TabsList>
          </Tabs>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Current Price</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">Last Updated</TableHead>
                  <TableHead className="text-right">Used In</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredIngredients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                      No ingredients found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredIngredients.map((ing) => (
                    <TableRow key={ing.id}>
                      <TableCell>
                        <button
                          className="font-medium text-primary hover:underline text-left"
                          onClick={() => setDetailPanel(ing.id)}
                        >
                          {ing.name}
                        </button>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{ing.category}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{ing.supplier || "—"}</TableCell>
                      <TableCell className="text-right font-medium">
                        {ing.currentPrice ? `${formatCurrency(ing.currentPrice)} / ${ing.unit}` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <PriceChangeIndicator pct={(ing as any).priceChangePct} />
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm">{formatDate(ing.priceEffectiveDate)}</TableCell>
                      <TableCell className="text-right text-sm">{ing.skuCount} SKU{ing.skuCount !== 1 ? "s" : ""}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => openPricePanel(ing)}>
                          <RefreshCw className="h-3 w-3 mr-1.5" /> Update Price
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Sheet open={!!pricePanel} onOpenChange={(open) => !open && setPricePanel(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Update Price</SheetTitle>
            <SheetDescription>
              {updatingIngredient?.name} · {updatingIngredient?.unit}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            <div className="flex items-center justify-between bg-muted p-3 rounded-lg">
              <span className="text-sm text-muted-foreground">Current price</span>
              <span className="font-semibold">{formatCurrency(updatingIngredient?.currentPrice)} / {updatingIngredient?.unit}</span>
            </div>

            {affectedSkus && affectedSkus.length > 0 && (
              <div className="border rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium">This will affect {affectedSkus.length} SKU{affectedSkus.length !== 1 ? "s" : ""}:</p>
                <div className="space-y-1">
                  {affectedSkus.map((sku) => (
                    <div key={sku.id} className="text-sm text-muted-foreground flex items-center gap-2">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{sku.skuCode}</span>
                      {sku.name}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {affectedSkus && affectedSkus.length === 0 && (
              <div className="border rounded-lg p-3 text-sm text-muted-foreground">This ingredient is not currently used in any SKU.</div>
            )}

            <Form {...priceForm}>
              <form onSubmit={priceForm.handleSubmit(onPriceSubmit)} className="space-y-4">
                <FormField control={priceForm.control} name="price" render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Price per {updatingIngredient?.unit}</FormLabel>
                    <FormControl><Input type="number" step="0.0001" autoFocus {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={priceForm.control} name="effectiveDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Effective Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={priceForm.control} name="reason" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason (Optional)</FormLabel>
                    <FormControl><Input placeholder="e.g. Supplier increase Q3" {...field} value={field.value || ""} /></FormControl>
                  </FormItem>
                )} />
                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setPricePanel(null)}>Cancel</Button>
                  <Button type="submit" className="flex-1" disabled={updatePrice.isPending}>
                    {updatePrice.isPending ? "Saving..." : "Confirm Update"}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={!!detailPanel} onOpenChange={(open) => !open && setDetailPanel(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{detailIngredient?.name}</SheetTitle>
            <SheetDescription>
              {detailIngredient?.category} · {detailIngredient?.unit}
              {detailIngredient?.supplier ? ` · ${detailIngredient.supplier}` : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted p-3 rounded-lg">
                <div className="text-xs text-muted-foreground">Current Price</div>
                <div className="text-xl font-bold mt-1">{formatCurrency(detailIngredient?.currentPrice)}</div>
                <div className="text-xs text-muted-foreground">/ {detailIngredient?.unit}</div>
              </div>
              <div className="bg-muted p-3 rounded-lg">
                <div className="text-xs text-muted-foreground">SKUs Using</div>
                <div className="text-xl font-bold mt-1">{detailIngredient?.skuCount}</div>
                <div className="text-xs text-muted-foreground">products</div>
              </div>
            </div>
            <div className="pt-2">
              <Link
                href={`/ingredients/${detailPanel}`}
                className="text-sm text-primary hover:underline"
                onClick={() => setDetailPanel(null)}
              >
                View full history & details →
              </Link>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
