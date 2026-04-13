import { useState, useMemo, useRef } from "react";
import { useGetSku, useUpdateSku, useAddSkuCostLine, useDeleteSkuCostLine, useListIngredients, getGetSkuQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency, formatPercent, formatDate, formatDateShort } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, ReferenceLine, Legend } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Pencil, AlertTriangle, ArrowDown, ArrowUp } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";

const CATEGORY_COLORS: Record<string, string> = {
  "Raw Material": "#22c55e",
  "Packaging": "#a855f7",
  "Labor": "#f97316",
  "Overhead": "#94a3b8",
  "Quality & Compliance": "#3b82f6",
  "Delivery": "#92400e",
};

const CATEGORY_BG: Record<string, string> = {
  "Raw Material": "bg-green-100 text-green-800",
  "Packaging": "bg-purple-100 text-purple-800",
  "Labor": "bg-orange-100 text-orange-800",
  "Overhead": "bg-slate-100 text-slate-700",
  "Quality & Compliance": "bg-blue-100 text-blue-800",
  "Delivery": "bg-amber-100 text-amber-800",
};

const editPriceSchema = z.object({
  sellPrice: z.coerce.number().min(0.01, "Price must be > 0"),
});

const addLineSchema = z.object({
  ingredientId: z.coerce.number().min(1, "Required"),
  quantityPerUnit: z.coerce.number().min(0.0001, "Required"),
  notes: z.string().optional()
});

type TimePeriod = "3M" | "6M" | "12M" | "All";

function triggerLabel(triggeredBy: string | null): { label: string; className: string } {
  if (!triggeredBy) return { label: "Unknown", className: "bg-gray-100 text-gray-700" };
  if (triggeredBy.startsWith("price_update")) return { label: "Ingredient Cost", className: "bg-orange-100 text-orange-800" };
  if (triggeredBy === "sell_price_updated") return { label: "Sell Price", className: "bg-purple-100 text-purple-800" };
  if (triggeredBy.startsWith("cost_line")) return { label: "BOM Change", className: "bg-blue-100 text-blue-800" };
  if (triggeredBy === "sku_created") return { label: "SKU Created", className: "bg-green-100 text-green-800" };
  return { label: triggeredBy, className: "bg-gray-100 text-gray-700" };
}

export default function SkuDetail({ id }: { id: string }) {
  const skuId = parseInt(id, 10);
  const qc = useQueryClient();
  const { toast } = useToast();
  const bomRef = useRef<HTMLDivElement>(null);

  const { data: sku, isLoading } = useGetSku(skuId, { query: { enabled: !isNaN(skuId) } });
  const { data: ingredients } = useListIngredients();

  const updateSku = useUpdateSku();
  const addLine = useAddSkuCostLine();
  const deleteLine = useDeleteSkuCostLine();

  const [isEditPriceOpen, setIsEditPriceOpen] = useState(false);
  const [isAddLineOpen, setIsAddLineOpen] = useState(false);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("All");

  const priceForm = useForm<z.infer<typeof editPriceSchema>>({
    resolver: zodResolver(editPriceSchema),
    values: { sellPrice: sku?.sellPrice || 0 }
  });

  const addLineForm = useForm<z.infer<typeof addLineSchema>>({
    resolver: zodResolver(addLineSchema),
    defaultValues: { ingredientId: 0, quantityPerUnit: 1, notes: "" }
  });

  const selectedIngredientId = addLineForm.watch("ingredientId");
  const selectedIngredient = ingredients?.find(i => i.id === selectedIngredientId);

  const groupedIngredients = useMemo(() => {
    if (!ingredients) return {};
    return ingredients.reduce((acc: Record<string, typeof ingredients>, ing) => {
      const cat = ing.category || "Other";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(ing);
      return acc;
    }, {});
  }, [ingredients]);

  const snapshotData = useMemo(() => {
    const all = [...(sku?.snapshots || [])].reverse();
    if (timePeriod === "All") return all;
    const now = new Date();
    const months = timePeriod === "3M" ? 3 : timePeriod === "6M" ? 6 : 12;
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    return all.filter(s => s.snapshotDate >= cutoffStr);
  }, [sku?.snapshots, timePeriod]);

  const chartData = snapshotData.map(s => ({
    date: formatDateShort(s.snapshotDate),
    rawDate: s.snapshotDate,
    margin: s.grossMargin,
    marginPct: Math.round(s.grossMargin * 1000) / 10,
    sellPrice: s.sellPrice,
    cogs: s.totalCogs,
  }));

  const categoryBreakdown = useMemo(() => {
    if (!sku?.costLines) return [];
    const totals: Record<string, number> = {};
    for (const line of sku.costLines) {
      const cat = (line as any).ingredientCategory || "Other";
      totals[cat] = (totals[cat] || 0) + (line.lineCost || 0);
    }
    return Object.entries(totals).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [sku?.costLines]);

  const totalCategoryValue = categoryBreakdown.reduce((s, d) => s + d.value, 0);

  const eventLog = useMemo(() => {
    const snaps = [...(sku?.snapshots || [])];
    return snaps.map((s, idx) => {
      const prev = snaps[idx + 1];
      return {
        ...s,
        prevCogs: prev?.totalCogs ?? null,
        prevMargin: prev?.grossMargin ?? null,
        cogsChange: prev ? s.totalCogs - prev.totalCogs : null,
        marginChange: prev ? s.grossMargin - prev.grossMargin : null,
      };
    });
  }, [sku?.snapshots]);

  if (isLoading) return <div className="p-8 space-y-6"><Skeleton className="h-12 w-1/3" /><Skeleton className="h-64 w-full" /></div>;
  if (!sku) return <div className="p-8">SKU not found</div>;

  const marginEuro = (sku.sellPrice || 0) - (sku.totalCogs || 0);
  const targetPrice30 = sku.totalCogs ? sku.totalCogs / 0.70 : null;

  async function onEditPriceSubmit(data: z.infer<typeof editPriceSchema>) {
    try {
      await updateSku.mutateAsync({ id: skuId, data: { sellPrice: data.sellPrice } });
      setIsEditPriceOpen(false);
      qc.invalidateQueries({ queryKey: getGetSkuQueryKey(skuId) });
      toast({ title: "Sell price updated" });
    } catch {
      toast({ variant: "destructive", title: "Error updating price" });
    }
  }

  async function onAddLineSubmit(data: z.infer<typeof addLineSchema>) {
    try {
      await addLine.mutateAsync({ id: skuId, data: { ...data, notes: data.notes || null } });
      setIsAddLineOpen(false);
      addLineForm.reset();
      qc.invalidateQueries({ queryKey: getGetSkuQueryKey(skuId) });
      toast({ title: "Cost line added" });
    } catch {
      toast({ variant: "destructive", title: "Error adding cost line" });
    }
  }

  async function handleDeleteLine(lineId: number) {
    if (!confirm("Remove this cost line?")) return;
    try {
      await deleteLine.mutateAsync({ id: skuId, costLineId: lineId } as any);
      qc.invalidateQueries({ queryKey: getGetSkuQueryKey(skuId) });
      toast({ title: "Cost line removed" });
    } catch {
      toast({ variant: "destructive", title: "Error removing line" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">{sku.name}</h1>
            <StatusBadge status={sku.status} />
          </div>
          <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
            <span className="font-mono bg-muted px-2 py-0.5 rounded text-xs">{sku.skuCode}</span>
            <span>Category: <strong className="text-foreground">{sku.category}</strong></span>
            <span>Unit: <strong className="text-foreground">{sku.unitSize}</strong></span>
            {sku.customerName && <span>Customer: <strong className="text-foreground">{sku.customerName}</strong></span>}
          </div>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total COGS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(sku.totalCogs)}</div>
            {sku.status === "unknown" && (
              <div className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> No cost data</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-primary text-primary-foreground border-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-primary-foreground/70 uppercase tracking-wide">Sell Price</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{formatCurrency(sku.sellPrice)}</div>
              <Dialog open={isEditPriceOpen} onOpenChange={setIsEditPriceOpen}>
                <DialogTrigger asChild>
                  <button className="text-primary-foreground/60 hover:text-primary-foreground transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Edit Sell Price</DialogTitle></DialogHeader>
                  <Form {...priceForm}>
                    <form onSubmit={priceForm.handleSubmit(onEditPriceSubmit)} className="space-y-4">
                      <FormField control={priceForm.control} name="sellPrice" render={({ field }) => (
                        <FormItem>
                          <FormLabel>New Sell Price (€)</FormLabel>
                          <FormControl><Input type="number" step="0.01" autoFocus {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => setIsEditPriceOpen(false)}>Cancel</Button>
                        <Button type="submit" disabled={updateSku.isPending}>Save</Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gross Margin %</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercent(sku.grossMargin)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Margin €/unit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(marginEuro > 0 ? marginEuro : null)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Target (30%)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(targetPrice30)}</div>
            <p className="text-xs text-muted-foreground mt-1">min sell price</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1 border rounded-lg p-1">
          {(["3M", "6M", "12M", "All"] as TimePeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setTimePeriod(p)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${timePeriod === p ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gross Margin % Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[240px]">
              {chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis
                      tickFormatter={(v) => `${v}%`}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      domain={[0, "auto"]}
                    />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, "Margin"]} labelFormatter={(l) => l} />
                    <ReferenceLine y={25} stroke="#22c55e" strokeDasharray="4 4" label={{ value: "25%", position: "insideTopRight", fontSize: 10, fill: "#22c55e" }} />
                    <ReferenceLine y={10} stroke="#f97316" strokeDasharray="4 4" label={{ value: "10%", position: "insideTopRight", fontSize: 10, fill: "#f97316" }} />
                    <Line type="monotone" dataKey="marginPct" name="Margin %" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Not enough data to chart</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">COGS vs Sell Price</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[240px]">
              {chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradMarginBand" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gradCogs" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(v) => `€${v.toFixed(2)}`} fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v: number) => [formatCurrency(v)]} />
                    <Area type="monotone" dataKey="sellPrice" name="Sell Price" stroke="hsl(var(--primary))" fill="url(#gradMarginBand)" strokeWidth={2} />
                    <Area type="monotone" dataKey="cogs" name="COGS" stroke="#ef4444" fill="url(#gradCogs)" strokeWidth={2} />
                    <Legend />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Not enough data to chart</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Cost Breakdown by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryBreakdown.length > 0 ? (
              <>
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryBreakdown} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                        {categoryBreakdown.map((entry, index) => (
                          <Cell key={index} fill={CATEGORY_COLORS[entry.name] || "#94a3b8"} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => [formatCurrency(v)]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 space-y-2">
                  {categoryBreakdown.map((d) => (
                    <div key={d.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[d.name] || "#94a3b8" }} />
                        <span className="truncate">{d.name}</span>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <span className="text-muted-foreground">{totalCategoryValue > 0 ? Math.round((d.value / totalCategoryValue) * 100) : 0}%</span>
                        <span className="font-medium">{formatCurrency(d.value)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">No cost lines yet</div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2" ref={bomRef}>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Bill of Materials</CardTitle>
              <CardDescription>Cost lines for this SKU</CardDescription>
            </div>
            <Dialog open={isAddLineOpen} onOpenChange={setIsAddLineOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Add Cost Line</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Cost Line</DialogTitle></DialogHeader>
                <Form {...addLineForm}>
                  <form onSubmit={addLineForm.handleSubmit(onAddLineSubmit)} className="space-y-4">
                    <FormField control={addLineForm.control} name="ingredientId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ingredient / Cost Item</FormLabel>
                        <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value ? field.value.toString() : ""}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                          <SelectContent>
                            {Object.entries(groupedIngredients).map(([cat, items]) => (
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
                    <FormField control={addLineForm.control} name="quantityPerUnit" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quantity per unit {selectedIngredient ? `(${selectedIngredient.unit})` : ""}</FormLabel>
                        <FormControl><Input type="number" step="0.0001" {...field} /></FormControl>
                        {selectedIngredient?.category === "Labor" && (
                          <FormDescription>Enter hours per unit — e.g. 0.083 = 5 minutes</FormDescription>
                        )}
                        {(selectedIngredient?.category === "Overhead" || selectedIngredient?.category === "Quality & Compliance" || selectedIngredient?.category === "Delivery") && (
                          <FormDescription>Quantity is typically 1 (pre-calculated per-unit cost)</FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={addLineForm.control} name="notes" render={({ field }) => (
                      <FormItem><FormLabel>Notes (Optional)</FormLabel><FormControl><Input placeholder="e.g. 5% waste factor" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <DialogFooter>
                      <Button type="button" variant="ghost" onClick={() => setIsAddLineOpen(false)}>Cancel</Button>
                      <Button type="submit" disabled={addLine.isPending}>Add</Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Line Cost</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sku.costLines?.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No cost lines. Add one above.</TableCell></TableRow>
                ) : sku.costLines?.map(line => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <Link href={`/ingredients/${line.ingredientId}`} className="font-medium text-primary hover:underline">{line.ingredientName}</Link>
                      {line.notes && <div className="text-xs text-muted-foreground">{line.notes}</div>}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${CATEGORY_BG[(line as any).ingredientCategory] || "bg-gray-100 text-gray-700"}`}>
                        {(line as any).ingredientCategory || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatCurrency(line.currentPrice)}/{line.ingredientUnit}</TableCell>
                    <TableCell className="text-right">{line.quantityPerUnit}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(line.lineCost)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteLine(line.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {sku.costLines && sku.costLines.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="font-bold">Total COGS</TableCell>
                    <TableCell className="text-right font-bold text-lg">{formatCurrency(sku.totalCogs)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Event Log</CardTitle>
          <CardDescription>All cost and price changes for this SKU</CardDescription>
        </CardHeader>
        <CardContent>
          {eventLog.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">No events recorded.</div>
          ) : (
            <div className="space-y-0 divide-y">
              {eventLog.map((s, i) => {
                const trigger = triggerLabel(s.triggeredBy ?? null);
                const cogsIncrease = s.cogsChange !== null && s.cogsChange > 0;
                const cogsDecrease = s.cogsChange !== null && s.cogsChange < 0;
                return (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 text-muted-foreground text-sm whitespace-nowrap">{formatDate(s.snapshotDate)}</div>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${trigger.className}`}>{trigger.label}</span>
                    </div>
                    <div className="flex items-center gap-6 ml-0 sm:ml-auto text-sm">
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">COGS</div>
                        <div className="font-medium flex items-center gap-1">
                          {formatCurrency(s.totalCogs)}
                          {cogsIncrease && <ArrowUp className="w-3 h-3 text-destructive" />}
                          {cogsDecrease && <ArrowDown className="w-3 h-3 text-green-600" />}
                        </div>
                        {s.cogsChange !== null && (
                          <div className={`text-xs ${s.cogsChange > 0 ? "text-destructive" : "text-green-600"}`}>
                            {s.cogsChange > 0 ? "+" : ""}{formatCurrency(s.cogsChange)}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Margin</div>
                        <div className="font-medium">{formatPercent(s.grossMargin)}</div>
                        {s.marginChange !== null && (
                          <div className={`text-xs ${s.marginChange > 0 ? "text-green-600" : "text-destructive"}`}>
                            {s.marginChange > 0 ? "+" : ""}{(s.marginChange * 100).toFixed(1)}pp
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
