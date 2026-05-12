import { useState, useMemo } from "react";
import { useGetSku, useUpdateSku, useAddSkuCostLine, useDeleteSkuCostLine, useListIngredients, getGetSkuQueryKey, useGetSkuPrintingBlockConfig } from "@workspace/api-client-react";
import { PrintingBlockPanel } from "@/components/printing-block-panel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency, formatPercent, formatDate, formatDateShort } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, ReferenceLine, Legend } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Pencil, AlertTriangle, ArrowDown, ArrowUp, Search, Check, Users, Calculator, Loader2, Info, ChevronDown, ChevronUp } from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { getApiUrl } from "@/lib/queryClient";
import { PhotoUpload } from "@/components/photo-upload";

const CATEGORIES = [
  "Raw Materials",
  "Packaging",
  "Labor",
  "Overhead",
  "Quality & Compliance",
  "Delivery",
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  "Raw Materials": "#22c55e",
  "Packaging": "#a855f7",
  "Labor": "#f97316",
  "Overhead": "#94a3b8",
  "Quality & Compliance": "#3b82f6",
  "Delivery": "#f59e0b",
  "Printing Blocks": "#7c3aed",
};

const CATEGORY_BORDER: Record<string, string> = {
  "Raw Materials": "border-l-green-500",
  "Packaging": "border-l-purple-500",
  "Labor": "border-l-orange-500",
  "Overhead": "border-l-slate-400",
  "Quality & Compliance": "border-l-blue-500",
  "Delivery": "border-l-amber-500",
};

const CATEGORY_HEADER_BG: Record<string, string> = {
  "Raw Materials": "bg-green-50",
  "Packaging": "bg-purple-50",
  "Labor": "bg-orange-50",
  "Overhead": "bg-slate-50",
  "Quality & Compliance": "bg-blue-50",
  "Delivery": "bg-amber-50",
};

const CATEGORY_TEXT: Record<string, string> = {
  "Raw Materials": "text-green-700",
  "Packaging": "text-purple-700",
  "Labor": "text-orange-700",
  "Overhead": "text-slate-600",
  "Quality & Compliance": "text-blue-700",
  "Delivery": "text-amber-700",
};

const CATEGORY_BG: Record<string, string> = {
  "Raw Materials": "bg-green-100 text-green-800",
  "Packaging": "bg-purple-100 text-purple-800",
  "Labor": "bg-orange-100 text-orange-800",
  "Overhead": "bg-slate-100 text-slate-700",
  "Quality & Compliance": "bg-blue-100 text-blue-800",
  "Delivery": "bg-amber-100 text-amber-800",
};

const editPriceSchema = z.object({
  sellPrice: z.coerce.number().min(0.01, "Price must be > 0"),
});

const lineSchema = z.object({
  ingredientId: z.coerce.number().min(1, "Select an ingredient"),
  displayQty: z.coerce.number().min(0.000001, "Must be > 0"),
  notes: z.string().optional(),
});

type TimePeriod = "3M" | "6M" | "12M" | "All";
type DisplayUnit = "kg" | "g";

interface EditingLine {
  id: number;
  ingredientId: number;
  quantityPerUnit: number;
  notes: string | null;
  ingredientUnit: string;
}

function triggerLabel(triggeredBy: string | null): { label: string; className: string } {
  if (!triggeredBy) return { label: "Unknown", className: "bg-gray-100 text-gray-700" };
  if (triggeredBy.startsWith("price_update")) return { label: "Ingredient Cost", className: "bg-orange-100 text-orange-800" };
  if (triggeredBy === "sell_price_updated") return { label: "Sell Price", className: "bg-purple-100 text-purple-800" };
  if (triggeredBy.startsWith("cost_line")) return { label: "BOM Change", className: "bg-blue-100 text-blue-800" };
  if (triggeredBy === "sku_created") return { label: "SKU Created", className: "bg-green-100 text-green-800" };
  return { label: triggeredBy, className: "bg-gray-100 text-gray-700" };
}

function formatQty(qty: number, unit: string): string {
  if (unit === "kg" && qty < 1) {
    const g = qty * 1000;
    return `${g % 1 === 0 ? g : g.toFixed(1)} g`;
  }
  const rounded = parseFloat(qty.toFixed(4));
  return `${rounded} ${unit}`;
}

function initDisplayUnit(qty: number, unit: string): DisplayUnit {
  return unit === "kg" && qty < 1 ? "g" : "kg";
}

function toDisplayQty(storedQty: number, unit: string, displayUnit: DisplayUnit): number {
  if (unit === "kg" && displayUnit === "g") return parseFloat((storedQty * 1000).toFixed(4));
  return storedQty;
}

function toStoredQty(displayQty: number, unit: string, displayUnit: DisplayUnit): number {
  if (unit === "kg" && displayUnit === "g") return displayQty / 1000;
  return displayQty;
}

interface IngredientPickerProps {
  ingredients: any[];
  selectedId: number;
  onSelect: (ing: any) => void;
}

function IngredientPicker({ ingredients, selectedId, onSelect }: IngredientPickerProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return ingredients;
    return ingredients.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.supplier || "").toLowerCase().includes(q) ||
      (i.category || "").toLowerCase().includes(q)
    );
  }, [ingredients, search]);

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const cat of CATEGORIES) {
      const items = filtered.filter((i: any) => i.category === cat);
      if (items.length) map[cat] = items;
    }
    const other = filtered.filter((i: any) => !CATEGORIES.includes(i.category));
    if (other.length) map["Other"] = other;
    return map;
  }, [filtered]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-8 h-9"
          placeholder="Search ingredients..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus={false}
        />
      </div>
      <div className="h-56 overflow-y-auto border rounded-md">
        {Object.entries(grouped).length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No results</div>
        ) : Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <div className="sticky top-0 z-10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted border-b">
              {cat}
            </div>
            {items.map((ing: any) => (
              <button
                key={ing.id}
                type="button"
                onClick={() => onSelect(ing)}
                className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 hover:bg-accent transition-colors ${selectedId === ing.id ? "bg-primary/8" : ""}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {selectedId === ing.id && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                    <span className={`text-sm font-medium truncate ${selectedId === ing.id ? "text-primary" : ""}`}>{ing.name}</span>
                  </div>
                  {ing.supplier && (
                    <div className="text-xs text-muted-foreground truncate pl-5">{ing.supplier}</div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                  {ing.currentPrice != null ? formatCurrency(ing.currentPrice) : "—"}/{ing.unit}
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SkuDetail({ id }: { id: string }) {
  const skuId = parseInt(id, 10);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: sku, isLoading } = useGetSku(skuId, { query: { enabled: !isNaN(skuId) } });
  const { data: blockConfig } = useGetSkuPrintingBlockConfig(skuId);
  const { data: ingredients } = useListIngredients();

  const updateSku = useUpdateSku();
  const addLine = useAddSkuCostLine();
  const deleteLine = useDeleteSkuCostLine();

  const [isEditPriceOpen, setIsEditPriceOpen] = useState(false);
  const [isAddLineOpen, setIsAddLineOpen] = useState(false);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("All");
  const [editingLine, setEditingLine] = useState<EditingLine | null>(null);
  const [addDisplayUnit, setAddDisplayUnit] = useState<DisplayUnit>("kg");
  const [editDisplayUnit, setEditDisplayUnit] = useState<DisplayUnit>("kg");
  const [isSavingLine, setIsSavingLine] = useState(false);
  const [isSavingProd, setIsSavingProd] = useState(false);
  const [prodUnitsPerDay, setProdUnitsPerDay] = useState<string>("");
  const [prodCartonSize, setProdCartonSize] = useState<string>("1");
  const [prodShiftHours, setProdShiftHours] = useState<string>("8");
  const [prodDaysPerMonth, setProdDaysPerMonth] = useState<string>("20");
  const [prodMemberIds, setProdMemberIds] = useState<number[]>([]);
  const [prodSectionOpen, setProdSectionOpen] = useState(false);
  const [prodInitialized, setProdInitialized] = useState(false);
  const [prodDirty, setProdDirty] = useState(false);
  const [changeReason, setChangeReason] = useState<string>("");
  const [changeNote, setChangeNote] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const ingMap = useMemo(() => {
    if (!ingredients) return {} as Record<number, any>;
    return Object.fromEntries(ingredients.map((i: any) => [i.id, i])) as Record<number, any>;
  }, [ingredients]);

  const priceForm = useForm<z.infer<typeof editPriceSchema>>({
    resolver: zodResolver(editPriceSchema),
    values: { sellPrice: sku?.sellPrice || 0 }
  });

  const addLineForm = useForm<z.infer<typeof lineSchema>>({
    resolver: zodResolver(lineSchema),
    defaultValues: { ingredientId: 0, displayQty: 1, notes: "" }
  });

  const editLineForm = useForm<z.infer<typeof lineSchema>>({
    resolver: zodResolver(lineSchema),
    defaultValues: { ingredientId: 0, displayQty: 1, notes: "" }
  });

  const addIngId = addLineForm.watch("ingredientId");
  const addIng = ingMap[addIngId];
  const editIngId = editLineForm.watch("ingredientId");
  const editIng = ingMap[editIngId];

  const { data: teamMembers } = useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      const r = await fetch(getApiUrl("/team-members"));
      return r.json() as Promise<{ id: number; name: string; roleDescription: string | null; hourlyWage: number; oncostPercent: number; loadedRate: number; isActive: boolean }[]>;
    },
  });

  const { data: prodConfig, refetch: refetchProdConfig } = useQuery({
    queryKey: ["production-config", skuId],
    queryFn: async () => {
      const r = await fetch(getApiUrl(`/skus/${skuId}/production-config`));
      return r.json() as Promise<{
        config: any;
        teamMemberIds: number[];
        operatingDaysPerYear: number;
        daysPerMonth: number;
      }>;
    },
    enabled: !isNaN(skuId),
  });

  useMemo(() => {
    if (!prodInitialized && prodConfig) {
      setProdInitialized(true);
      setProdMemberIds(prodConfig.teamMemberIds ?? []);
      if (prodConfig.config) {
        setProdUnitsPerDay(String(prodConfig.config.unitsPerDay ?? ""));
        setProdCartonSize(String(prodConfig.config.cartonSize ?? "1"));
        setProdShiftHours(String(prodConfig.config.shiftHours ?? "8"));
        setProdDaysPerMonth(String(prodConfig.config.productionDaysPerMonth ?? "20"));
      }
    }
  }, [prodConfig, prodInitialized]);

  const isFirstSave = !prodConfig?.config;
  const hasLaborSetup = prodConfig?.config?.laborCostPerUnit !== null && prodConfig?.config?.laborCostPerUnit !== undefined;
  const hasOverheadSetup = prodConfig?.config?.overheadCostPerUnit !== null && prodConfig?.config?.overheadCostPerUnit !== undefined;

  async function handleSaveProdConfig() {
    setIsSavingProd(true);
    try {
      const reason = isFirstSave ? "initial" : (changeReason || "");
      if (!isFirstSave && !reason) {
        toast({ variant: "destructive", title: "Please select a change reason" });
        setIsSavingProd(false);
        return;
      }
      await fetch(getApiUrl(`/skus/${skuId}/production-config`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitsPerDay: parseInt(prodUnitsPerDay) || null,
          cartonSize: parseInt(prodCartonSize) || 1,
          shiftHours: parseFloat(prodShiftHours) || 8,
          productionDaysPerMonth: parseInt(prodDaysPerMonth) || 20,
          teamMemberIds: prodMemberIds,
          changeReason: reason,
          changeNote: changeNote || null,
        }),
      });
      await refetchProdConfig();
      qc.invalidateQueries({ queryKey: getGetSkuQueryKey(skuId) });
      setProdDirty(false);
      setChangeReason("");
      setChangeNote("");
      toast({ title: "Production setup saved — COGS updated" });
    } catch {
      toast({ variant: "destructive", title: "Error saving production setup" });
    } finally {
      setIsSavingProd(false);
    }
  }

  const previewLaborCost = useMemo(() => {
    const upd = parseInt(prodUnitsPerDay) || 0;
    const cs = parseInt(prodCartonSize) || 1;
    const sh = parseFloat(prodShiftHours) || 8;
    const totalUnits = upd * cs;
    if (!teamMembers || prodMemberIds.length === 0 || totalUnits === 0) return null;
    const selected = teamMembers.filter(m => prodMemberIds.includes(m.id));
    const totalRate = selected.reduce((s, m) => s + m.hourlyWage * (1 + m.oncostPercent / 100), 0);
    return (totalRate * sh) / totalUnits;
  }, [teamMembers, prodMemberIds, prodUnitsPerDay, prodCartonSize, prodShiftHours]);

  const previewMonthlyUnits = useMemo(() => {
    const upd = parseInt(prodUnitsPerDay) || 0;
    const cs = parseInt(prodCartonSize) || 1;
    const dpm = parseInt(prodDaysPerMonth) || 20;
    return upd * cs * dpm;
  }, [prodUnitsPerDay, prodCartonSize, prodDaysPerMonth]);

  const daysPerMonthFactory = prodConfig?.daysPerMonth ?? 20.8;
  const daysPerMonthWarning = parseInt(prodDaysPerMonth) > daysPerMonthFactory;

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
    const result = Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    if (blockConfig && blockConfig.amortizedCostPerUnit > 0) {
      result.push({ name: "Printing Blocks", value: blockConfig.amortizedCostPerUnit });
      result.sort((a, b) => b.value - a.value);
    }
    return result;
  }, [sku?.costLines, blockConfig]);

  const totalCategoryValue = categoryBreakdown.reduce((s, d) => s + d.value, 0);

  const costLinesByCategory = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const cat of CATEGORIES) map[cat] = [];
    for (const line of sku?.costLines ?? []) {
      const cat = (line as any).ingredientCategory || "Other";
      if (!map[cat]) map[cat] = [];
      map[cat].push(line);
    }
    return map;
  }, [sku?.costLines]);

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

  async function onAddLineSubmit(data: z.infer<typeof lineSchema>) {
    const storedQty = toStoredQty(data.displayQty, addIng?.unit ?? "kg", addDisplayUnit);
    try {
      await addLine.mutateAsync({ id: skuId, data: { ingredientId: data.ingredientId, quantityPerUnit: storedQty, notes: data.notes || null } });
      setIsAddLineOpen(false);
      addLineForm.reset();
      setAddDisplayUnit("kg");
      qc.invalidateQueries({ queryKey: getGetSkuQueryKey(skuId) });
      toast({ title: "Cost line added" });
    } catch {
      toast({ variant: "destructive", title: "Error adding cost line" });
    }
  }

  async function onEditLineSubmit(data: z.infer<typeof lineSchema>) {
    if (!editingLine) return;
    const storedQty = toStoredQty(data.displayQty, editIng?.unit ?? editingLine.ingredientUnit, editDisplayUnit);
    setIsSavingLine(true);
    try {
      const res = await fetch(getApiUrl(`/skus/${skuId}/cost-lines/${editingLine.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredientId: data.ingredientId, quantityPerUnit: storedQty, notes: data.notes || null }),
      });
      if (!res.ok) throw new Error();
      setEditingLine(null);
      qc.invalidateQueries({ queryKey: getGetSkuQueryKey(skuId) });
      toast({ title: "Cost line updated" });
    } catch {
      toast({ variant: "destructive", title: "Error updating cost line" });
    } finally {
      setIsSavingLine(false);
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

  function openEditLine(line: any) {
    const ingUnit = line.ingredientUnit ?? "kg";
    const du = initDisplayUnit(line.quantityPerUnit, ingUnit);
    const dq = toDisplayQty(line.quantityPerUnit, ingUnit, du);
    setEditDisplayUnit(du);
    setEditingLine({ id: line.id, ingredientId: line.ingredientId, quantityPerUnit: line.quantityPerUnit, notes: line.notes ?? null, ingredientUnit: ingUnit });
    editLineForm.reset({ ingredientId: line.ingredientId, displayQty: dq, notes: line.notes ?? "" });
  }

  function openAddLineFromCategory() {
    addLineForm.reset({ ingredientId: 0, displayQty: 1, notes: "" });
    setAddDisplayUnit("kg");
    setIsAddLineOpen(true);
  }

  const currentEditIngUnit = editIng?.unit ?? editingLine?.ingredientUnit ?? "kg";
  const currentAddIngUnit = addIng?.unit ?? "kg";

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
        <div className="w-full md:w-44 flex-shrink-0">
          <PhotoUpload
            entityType="sku"
            entityId={skuId}
            currentPhotoUrl={(sku as any).photoUrl ?? null}
            currentPhotoContentType={(sku as any).photoContentType ?? null}
            onUpdate={() => qc.invalidateQueries({ queryKey: getGetSkuQueryKey(skuId) })}
          />
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
                    <YAxis tickFormatter={(v) => `${v}%`} fontSize={11} tickLine={false} axisLine={false} domain={[0, "auto"]} />
                    <RechartsTooltip formatter={(v: number) => [`${v.toFixed(1)}%`, "Margin"]} labelFormatter={(l) => l} />
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
                    <RechartsTooltip formatter={(v: number) => [formatCurrency(v)]} />
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
                      <RechartsTooltip formatter={(v: number) => [formatCurrency(v)]} />
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

        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Bill of Materials</CardTitle>
              <CardDescription>Cost lines per category</CardDescription>
            </div>
            <Button size="sm" onClick={openAddLineFromCategory}>
              <Plus className="w-4 h-4 mr-1.5" /> Add Cost Line
            </Button>
          </CardHeader>

          <CardContent className="p-0 pb-1">
            {CATEGORIES.map(cat => {
              const lines = costLinesByCategory[cat] ?? [];
              const catTotal = lines.reduce((s: number, l: any) => s + (l.lineCost || 0), 0);
              return (
                <div key={cat} className={`border-l-4 ${CATEGORY_BORDER[cat]} border-b last:border-b-0`}>
                  <div className={`px-4 py-2 flex items-center justify-between ${CATEGORY_HEADER_BG[cat]}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-bold uppercase tracking-wider ${CATEGORY_TEXT[cat]}`}>{cat}</span>
                      {lines.length > 0 && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{lines.length}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {lines.length > 0 && (
                        <span className="text-xs font-medium text-muted-foreground">{formatCurrency(catTotal)}</span>
                      )}
                      <button
                        onClick={openAddLineFromCategory}
                        className="text-xs text-primary hover:underline flex items-center gap-0.5"
                      >
                        <Plus className="w-3 h-3" /> Add
                      </button>
                    </div>
                  </div>

                  {lines.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="pl-4 text-xs h-8 text-muted-foreground font-medium">Item</TableHead>
                          <TableHead className="text-right text-xs h-8 text-muted-foreground font-medium">Unit Cost</TableHead>
                          <TableHead className="text-right text-xs h-8 text-muted-foreground font-medium">Qty</TableHead>
                          <TableHead className="text-right text-xs h-8 text-muted-foreground font-medium">Line Cost</TableHead>
                          <TableHead className="w-16 h-8" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lines.map((line: any) => {
                          const ing = ingMap[line.ingredientId];
                          return (
                            <TableRow key={line.id} className="group">
                              <TableCell className="pl-4 py-2">
                                <div className="text-sm font-medium">{line.ingredientName}</div>
                                {ing?.supplier && (
                                  <div className="text-xs text-muted-foreground">{ing.supplier}</div>
                                )}
                                {line.notes && (
                                  <div className="text-xs text-muted-foreground italic">{line.notes}</div>
                                )}
                              </TableCell>
                              <TableCell className="text-right text-sm text-muted-foreground py-2">
                                {formatCurrency(line.currentPrice)}/{line.ingredientUnit}
                              </TableCell>
                              <TableCell className="text-right text-sm py-2">
                                {formatQty(line.quantityPerUnit, line.ingredientUnit)}
                              </TableCell>
                              <TableCell className="text-right text-sm font-medium py-2">
                                {formatCurrency(line.lineCost)}
                              </TableCell>
                              <TableCell className="py-2 pr-3">
                                <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => openEditLine(line)}
                                    className="p-1 rounded hover:bg-muted transition-colors"
                                    title="Edit"
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteLine(line.id)}
                                    className="p-1 rounded hover:bg-destructive/10 transition-colors"
                                    title="Remove"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                  </button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="px-4 py-2.5 text-xs text-muted-foreground italic">No items in this category</div>
                  )}
                </div>
              );
            })}

            {blockConfig && blockConfig.amortizedCostPerUnit > 0 && (
              <div className="border-l-4 border-l-purple-500 border-b">
                <div className="px-4 py-2 bg-purple-50 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">Printing Blocks</span>
                  <span className="text-xs font-semibold text-purple-700">{formatCurrency(blockConfig.amortizedCostPerUnit)}</span>
                </div>
                <div className="px-4 py-2 text-xs text-muted-foreground italic">
                  Printing Blocks (amortized over {blockConfig.moq.toLocaleString()} units) — {blockConfig.numBlocks} blocks × {formatCurrency(blockConfig.pricePerBlock)} ÷ {blockConfig.moq.toLocaleString()}
                </div>
              </div>
            )}

            {(sku.costLines?.length ?? 0) > 0 && (
              <div className="px-4 py-3 flex items-center justify-between bg-muted/40 border-t mt-0">
                <span className="text-sm font-bold">Total COGS</span>
                <span className="text-lg font-bold">{formatCurrency(sku.totalCogs)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <PrintingBlockPanel skuId={skuId} />

      {/* ── Production Setup ── */}
      <TooltipProvider>
      <Card className="border-l-4 border-l-orange-500">
        <button
          className="w-full px-6 py-4 bg-orange-50 flex items-center justify-between gap-3 rounded-t-xl"
          onClick={() => setProdSectionOpen(o => !o)}
        >
          <div className="flex items-center gap-3">
            <Users className="w-4 h-4 text-orange-600 flex-shrink-0" />
            <div className="text-left">
              <div className="text-sm font-bold uppercase tracking-wider text-orange-700">Production Setup</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {hasLaborSetup || hasOverheadSetup
                  ? [
                      hasLaborSetup ? `Labor ${formatCurrency(prodConfig?.config?.laborCostPerUnit ?? null)}/unit` : null,
                      hasOverheadSetup ? `Overhead ${formatCurrency(prodConfig?.config?.overheadCostPerUnit ?? null)}/unit` : null,
                    ].filter(Boolean).join(" · ")
                  : "Set up team and production days to calculate labor & overhead cost"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(hasLaborSetup || hasOverheadSetup) && (
              <Badge className="bg-orange-100 text-orange-800 border-0 text-xs">
                {formatCurrency((prodConfig?.config?.laborCostPerUnit ?? 0) + (prodConfig?.config?.overheadCostPerUnit ?? 0))}/unit
              </Badge>
            )}
            {prodSectionOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </button>

        {prodSectionOpen && (
          <CardContent className="pt-5 space-y-5">
            {/* 1. Team Members */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold">1. Who works on this product?</span>
                <Tooltip>
                  <TooltipTrigger type="button"><Info className="w-3.5 h-3.5 text-muted-foreground" /></TooltipTrigger>
                  <TooltipContent className="max-w-60 text-xs">Select everyone who touches this product during production. Their loaded hourly rates will be added together.</TooltipContent>
                </Tooltip>
              </div>
              {(teamMembers?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">No team members yet. Add them in the <Link href="/ingredients" className="text-primary hover:underline">Cost Library</Link>.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {teamMembers?.filter(m => m.isActive).map(m => (
                    <label key={m.id} className={`flex items-center gap-3 border rounded-lg px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors ${prodMemberIds.includes(m.id) ? "border-orange-300 bg-orange-50" : ""}`}>
                      <Checkbox
                        checked={prodMemberIds.includes(m.id)}
                        onCheckedChange={(checked) => {
                          setProdMemberIds(prev => checked ? [...prev, m.id] : prev.filter(id => id !== m.id));
                          setProdDirty(true);
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{m.name}</div>
                        {m.roleDescription && <div className="text-xs text-muted-foreground truncate">{m.roleDescription}</div>}
                      </div>
                      <div className="text-xs text-orange-700 font-medium flex-shrink-0">{formatCurrency(m.loadedRate)}/hr</div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Units per day + carton size */}
            <div>
              <p className="text-sm font-semibold mb-3">2. Output</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                    Units made per production day
                    <Tooltip>
                      <TooltipTrigger type="button"><Info className="w-3.5 h-3.5 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent className="text-xs max-w-52">How many individual units your team makes in one shift for this product.</TooltipContent>
                    </Tooltip>
                  </label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="e.g. 200"
                    value={prodUnitsPerDay}
                    onChange={e => { setProdUnitsPerDay(e.target.value); setProdDirty(true); }}
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                    Units per carton
                    <Tooltip>
                      <TooltipTrigger type="button"><Info className="w-3.5 h-3.5 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent className="text-xs max-w-52">If you sell in cartons of 12, set this to 12. Leave as 1 if you sell individual units.</TooltipContent>
                    </Tooltip>
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={prodCartonSize}
                    onChange={e => { setProdCartonSize(e.target.value); setProdDirty(true); }}
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            {/* 3. Production days per month */}
            <div>
              <p className="text-sm font-semibold mb-3">3. Production days per month for this product</p>
              <div className="flex items-center gap-3 flex-wrap">
                <Input
                  type="number"
                  min="1"
                  max="31"
                  placeholder="20"
                  value={prodDaysPerMonth}
                  onChange={e => { setProdDaysPerMonth(e.target.value); setProdDirty(true); }}
                  className="h-9 w-24"
                />
                <span className="text-sm text-muted-foreground">days / month</span>
                {daysPerMonthWarning && (
                  <div className="flex items-center gap-1.5 text-amber-600 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Exceeds factory average ({daysPerMonthFactory} days/month)
                  </div>
                )}
              </div>
            </div>

            {/* Advanced: Shift hours */}
            <div>
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowAdvanced(a => !a)}
              >
                {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Advanced settings
              </button>
              {showAdvanced && (
                <div className="mt-3 max-w-xs">
                  <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                    Shift hours
                    <Tooltip>
                      <TooltipTrigger type="button"><Info className="w-3.5 h-3.5 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent className="text-xs max-w-52">How many hours the team works on this product in one production run.</TooltipContent>
                    </Tooltip>
                  </label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={prodShiftHours}
                    onChange={e => { setProdShiftHours(e.target.value); setProdDirty(true); }}
                    className="h-9"
                  />
                </div>
              )}
            </div>

            {/* Live confirmation panel */}
            {(previewMonthlyUnits > 0 || previewLaborCost !== null) && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-orange-700">Live preview</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Monthly units</div>
                    <div className="text-base font-bold text-foreground">{previewMonthlyUnits > 0 ? previewMonthlyUnits.toLocaleString() : "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Annual units</div>
                    <div className="text-base font-bold text-foreground">{previewMonthlyUnits > 0 ? (previewMonthlyUnits * 12).toLocaleString() : "—"}</div>
                  </div>
                  <div className="sm:col-start-1">
                    <div className="text-xs text-muted-foreground">Labor / unit</div>
                    <div className="text-base font-bold text-orange-700">{previewLaborCost !== null ? formatCurrency(previewLaborCost) : "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Overhead / unit</div>
                    <div className="text-base font-bold text-slate-600">{prodConfig?.config?.overheadCostPerUnit != null ? formatCurrency(prodConfig.config.overheadCostPerUnit) : "—"}</div>
                    <div className="text-[10px] text-muted-foreground">from saved config</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Combined pre-ingredient</div>
                    <div className="text-base font-bold text-slate-700">
                      {previewLaborCost !== null ? formatCurrency(previewLaborCost + (prodConfig?.config?.overheadCostPerUnit ?? 0)) : "—"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">labor + overhead</div>
                  </div>
                </div>
                {previewLaborCost !== null && (
                  <div className="text-xs text-muted-foreground border-t border-orange-200 pt-2">
                    {(() => {
                      const selected = teamMembers?.filter(m => prodMemberIds.includes(m.id)) ?? [];
                      const totalRate = selected.reduce((s, m) => s + m.hourlyWage * (1 + m.oncostPercent / 100), 0);
                      const totalUnits = (parseInt(prodUnitsPerDay) || 0) * (parseInt(prodCartonSize) || 1);
                      return `${selected.map(m => m.name).join(", ")} · €${totalRate.toFixed(2)}/hr × ${parseFloat(prodShiftHours) || 8} hrs ÷ ${totalUnits} units`;
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Change reason tiles — only shown on subsequent saves */}
            {!isFirstSave && prodDirty && (
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm font-semibold">Why are you changing this?</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { key: "efficiency", label: "Efficiency", desc: "Output changed" },
                    { key: "team_changed", label: "Team changed", desc: "People added/removed" },
                    { key: "shift_changed", label: "Shift changed", desc: "Hours adjusted" },
                    { key: "wages_changed", label: "Wages changed", desc: "Rates updated" },
                  ].map(r => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => setChangeReason(r.key)}
                      className={`border rounded-lg px-3 py-2.5 text-left transition-colors ${changeReason === r.key ? "border-orange-400 bg-orange-50" : "hover:border-orange-300 hover:bg-orange-50/50"}`}
                    >
                      <div className="text-xs font-semibold">{r.label}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{r.desc}</div>
                    </button>
                  ))}
                </div>
                {changeReason && (
                  <Input
                    placeholder="Optional note (e.g. new hire, line speed improvement…)"
                    value={changeNote}
                    onChange={e => setChangeNote(e.target.value)}
                    className="h-9 text-sm"
                  />
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-1 border-t">
              <Button
                onClick={handleSaveProdConfig}
                disabled={isSavingProd || (!isFirstSave && prodDirty && !changeReason)}
                size="sm"
              >
                {isSavingProd ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                Save &amp; apply
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
      </TooltipProvider>

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

      {/* ── Add Cost Line Dialog ── */}
      <Dialog open={isAddLineOpen} onOpenChange={(open) => { if (!open) { setIsAddLineOpen(false); addLineForm.reset(); setAddDisplayUnit("kg"); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Cost Line</DialogTitle></DialogHeader>
          <Form {...addLineForm}>
            <form onSubmit={addLineForm.handleSubmit(onAddLineSubmit)} className="space-y-4">
              <FormField control={addLineForm.control} name="ingredientId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Ingredient / Cost Item</FormLabel>
                  <IngredientPicker
                    ingredients={ingredients ?? []}
                    selectedId={field.value}
                    onSelect={(ing) => {
                      field.onChange(ing.id);
                      const du = initDisplayUnit(1, ing.unit);
                      setAddDisplayUnit(du);
                      addLineForm.setValue("displayQty", 1);
                    }}
                  />
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={addLineForm.control} name="displayQty" render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity per unit</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input type="number" step="any" placeholder="0" {...field} className="flex-1" />
                    </FormControl>
                    {currentAddIngUnit === "kg" && (
                      <div className="flex border rounded-md overflow-hidden">
                        {(["g", "kg"] as DisplayUnit[]).map(u => (
                          <button
                            key={u}
                            type="button"
                            onClick={() => {
                              const current = parseFloat(String(field.value)) || 0;
                              if (u === "g" && addDisplayUnit === "kg") {
                                addLineForm.setValue("displayQty", parseFloat((current * 1000).toFixed(4)));
                              } else if (u === "kg" && addDisplayUnit === "g") {
                                addLineForm.setValue("displayQty", parseFloat((current / 1000).toFixed(6)));
                              }
                              setAddDisplayUnit(u);
                            }}
                            className={`px-3 py-2 text-sm font-medium transition-colors ${addDisplayUnit === u ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                          >
                            {u}
                          </button>
                        ))}
                      </div>
                    )}
                    {currentAddIngUnit !== "kg" && (
                      <div className="flex items-center px-3 border rounded-md bg-muted text-sm text-muted-foreground">{currentAddIngUnit || "unit"}</div>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={addLineForm.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl><Input placeholder="e.g. 5% waste factor" {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => { setIsAddLineOpen(false); addLineForm.reset(); }}>Cancel</Button>
                <Button type="submit" disabled={addLine.isPending}>Add</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Cost Line Sheet ── */}
      <Sheet open={!!editingLine} onOpenChange={(open) => { if (!open) setEditingLine(null); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle>Edit Cost Line</SheetTitle>
          </SheetHeader>
          <Form {...editLineForm}>
            <form onSubmit={editLineForm.handleSubmit(onEditLineSubmit)} className="space-y-5">
              <FormField control={editLineForm.control} name="ingredientId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Ingredient / Cost Item</FormLabel>
                  <IngredientPicker
                    ingredients={ingredients ?? []}
                    selectedId={field.value}
                    onSelect={(ing) => {
                      field.onChange(ing.id);
                      const du = initDisplayUnit(parseFloat(String(editLineForm.getValues("displayQty"))) || 1, ing.unit);
                      setEditDisplayUnit(du);
                    }}
                  />
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={editLineForm.control} name="displayQty" render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity per unit</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input type="number" step="any" placeholder="0" {...field} className="flex-1" />
                    </FormControl>
                    {currentEditIngUnit === "kg" && (
                      <div className="flex border rounded-md overflow-hidden">
                        {(["g", "kg"] as DisplayUnit[]).map(u => (
                          <button
                            key={u}
                            type="button"
                            onClick={() => {
                              const current = parseFloat(String(field.value)) || 0;
                              if (u === "g" && editDisplayUnit === "kg") {
                                editLineForm.setValue("displayQty", parseFloat((current * 1000).toFixed(4)));
                              } else if (u === "kg" && editDisplayUnit === "g") {
                                editLineForm.setValue("displayQty", parseFloat((current / 1000).toFixed(6)));
                              }
                              setEditDisplayUnit(u);
                            }}
                            className={`px-3 py-2 text-sm font-medium transition-colors ${editDisplayUnit === u ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                          >
                            {u}
                          </button>
                        ))}
                      </div>
                    )}
                    {currentEditIngUnit !== "kg" && (
                      <div className="flex items-center px-3 border rounded-md bg-muted text-sm text-muted-foreground">{currentEditIngUnit || "unit"}</div>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={editLineForm.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl><Input placeholder="e.g. 5% waste factor" {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <SheetFooter className="flex gap-2 pt-2">
                <Button type="button" variant="ghost" className="flex-1" onClick={() => setEditingLine(null)}>Cancel</Button>
                <Button type="submit" className="flex-1" disabled={isSavingLine}>Save Changes</Button>
              </SheetFooter>
            </form>
          </Form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
