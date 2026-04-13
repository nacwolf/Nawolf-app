import { useState, useMemo } from "react";
import { useListIngredients, useCreateIngredient, useUpdateIngredientPrice, getListIngredientsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, TrendingUp, TrendingDown, Minus, Pencil, Users, Calculator, Info, Check, Loader2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/queryClient";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const INGREDIENT_CATEGORIES = [
  "Raw Materials",
  "Packaging",
  "Quality & Compliance",
  "Delivery",
] as const;

const CATEGORY_BORDER: Record<string, string> = {
  "Raw Materials": "border-l-green-500",
  "Packaging": "border-l-purple-500",
  "Quality & Compliance": "border-l-blue-500",
  "Delivery": "border-l-amber-500",
};

const CATEGORY_HEADER_BG: Record<string, string> = {
  "Raw Materials": "bg-green-50",
  "Packaging": "bg-purple-50",
  "Quality & Compliance": "bg-blue-50",
  "Delivery": "bg-amber-50",
};

const CATEGORY_TEXT: Record<string, string> = {
  "Raw Materials": "text-green-700",
  "Packaging": "text-purple-700",
  "Quality & Compliance": "text-blue-700",
  "Delivery": "text-amber-700",
};

const addIngredientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  unit: z.string().min(1, "Unit is required"),
  supplier: z.string().optional(),
  initialPrice: z.coerce.number().min(0, "Must be ≥ 0"),
});

const addPriceSchema = z.object({
  price: z.coerce.number().min(0.0001, "Price must be > 0"),
  effectiveDate: z.string().min(1, "Date required"),
  reason: z.string().optional(),
});

const editNameSchema = z.object({
  name: z.string().min(1, "Name is required"),
  supplier: z.string().optional(),
});

const teamMemberSchema = z.object({
  name: z.string().min(1, "Name is required"),
  roleDescription: z.string().optional(),
  hourlyWage: z.coerce.number().min(0.01, "Must be > 0"),
  oncostPercent: z.coerce.number().min(0).max(100).default(25),
});

interface TeamMember { id: number; name: string; roleDescription: string | null; hourlyWage: number; oncostPercent: number; loadedRate: number; isActive: boolean; }
interface OverheadItem { id: number; name: string; monthlyAmount: number; sortOrder: number; isActive: boolean; }

export default function CostLibrary() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: ingredients, isLoading: ingLoading } = useListIngredients();

  const [search, setSearch] = useState("");
  const [editPanelId, setEditPanelId] = useState<number | null>(null);
  const [addIngOpen, setAddIngOpen] = useState(false);
  const [addIngCategory, setAddIngCategory] = useState<string>("Raw Materials");
  const [editTeamMember, setEditTeamMember] = useState<TeamMember | null>(null);
  const [addTeamOpen, setAddTeamOpen] = useState(false);

  const createIngredient = useCreateIngredient();
  const updatePrice = useUpdateIngredientPrice();

  const addIngForm = useForm<z.infer<typeof addIngredientSchema>>({
    resolver: zodResolver(addIngredientSchema),
    defaultValues: { name: "", category: "Raw Materials", unit: "kg", supplier: "", initialPrice: 0 },
  });

  const editNameForm = useForm<z.infer<typeof editNameSchema>>({
    resolver: zodResolver(editNameSchema),
    defaultValues: { name: "", supplier: "" },
  });

  const addPriceForm = useForm<z.infer<typeof addPriceSchema>>({
    resolver: zodResolver(addPriceSchema),
    defaultValues: { price: 0, effectiveDate: new Date().toISOString().split("T")[0], reason: "" },
  });

  const teamMemberForm = useForm<z.infer<typeof teamMemberSchema>>({
    resolver: zodResolver(teamMemberSchema),
    defaultValues: { name: "", roleDescription: "", hourlyWage: 15, oncostPercent: 25 },
  });

  const editingIngredient = ingredients?.find(i => i.id === editPanelId);

  const { data: ingredientSkus } = useQuery({
    queryKey: ["ingredient-skus", editPanelId],
    queryFn: async () => {
      if (!editPanelId) return [];
      const r = await fetch(getApiUrl(`/ingredients/${editPanelId}/skus`));
      return r.json();
    },
    enabled: !!editPanelId,
  });

  const { data: teamData, isLoading: teamLoading } = useQuery({
    queryKey: ["team-members"],
    queryFn: async () => { const r = await fetch(getApiUrl("/team-members")); return r.json() as Promise<TeamMember[]>; },
  });

  const { data: overheadData, isLoading: overheadLoading } = useQuery({
    queryKey: ["overhead"],
    queryFn: async () => {
      const r = await fetch(getApiUrl("/overhead"));
      return r.json() as Promise<{ items: OverheadItem[]; totalUnitsPerMonth: number | null; totalMonthly: number; overheadPerUnit: number | null }>;
    },
  });

  const [overheadEdits, setOverheadEdits] = useState<Record<number, string>>({});
  const [totalUnitsInput, setTotalUnitsInput] = useState<string>("");
  const [isSavingOverhead, setIsSavingOverhead] = useState(false);

  const overheadWatchedTotal = useMemo(() => {
    if (!overheadData) return null;
    let total = 0;
    for (const item of overheadData.items) {
      const edited = overheadEdits[item.id];
      total += parseFloat(edited ?? String(item.monthlyAmount)) || 0;
    }
    return total;
  }, [overheadData, overheadEdits]);

  const totalUnitsDisplay = totalUnitsInput !== "" ? parseInt(totalUnitsInput) || 0 : (overheadData?.totalUnitsPerMonth ?? 0);
  const liveOverheadPerUnit = overheadWatchedTotal && totalUnitsDisplay > 0 ? overheadWatchedTotal / totalUnitsDisplay : null;

  const watchedWage = teamMemberForm.watch("hourlyWage");
  const watchedOncost = teamMemberForm.watch("oncostPercent");
  const previewLoadedRate = (parseFloat(String(watchedWage)) || 0) * (1 + (parseFloat(String(watchedOncost)) || 0) / 100);

  const filteredIngredients = useMemo(() => {
    if (!search || !ingredients) return ingredients;
    const q = search.toLowerCase();
    return ingredients.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.supplier || "").toLowerCase().includes(q)
    );
  }, [ingredients, search]);

  function openEdit(id: number) {
    const ing = ingredients?.find(i => i.id === id);
    if (!ing) return;
    setEditPanelId(id);
    editNameForm.reset({ name: ing.name, supplier: ing.supplier || "" });
    addPriceForm.reset({ price: 0, effectiveDate: new Date().toISOString().split("T")[0], reason: "" });
  }

  async function handleSaveName(data: z.infer<typeof editNameSchema>) {
    if (!editPanelId) return;
    await fetch(getApiUrl(`/ingredients/${editPanelId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: data.name, supplier: data.supplier || null }),
    });
    qc.invalidateQueries({ queryKey: getListIngredientsQueryKey() });
    toast({ title: "Updated" });
  }

  async function handleAddPrice(data: z.infer<typeof addPriceSchema>) {
    if (!editPanelId) return;
    await updatePrice.mutateAsync({ id: editPanelId, data });
    qc.invalidateQueries({ queryKey: getListIngredientsQueryKey() });
    addPriceForm.reset({ price: 0, effectiveDate: new Date().toISOString().split("T")[0], reason: "" });
    toast({ title: "Price updated" });
  }

  async function handleAddIngredient(data: z.infer<typeof addIngredientSchema>) {
    await createIngredient.mutateAsync({
      data: { name: data.name, category: data.category, unit: data.unit, supplier: data.supplier || undefined, initialPrice: data.initialPrice },
    });
    setAddIngOpen(false);
    addIngForm.reset();
    toast({ title: "Cost element added" });
  }

  async function handleSaveTeamMember(data: z.infer<typeof teamMemberSchema>) {
    if (editTeamMember) {
      const r = await fetch(getApiUrl(`/team-members/${editTeamMember.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await r.json();
      qc.invalidateQueries({ queryKey: ["team-members"] });
      toast({ title: result.affectedSkuCount > 0 ? `Wage updated — ${result.affectedSkuCount} SKU${result.affectedSkuCount > 1 ? "s" : ""} recalculated` : "Team member updated" });
    } else {
      await fetch(getApiUrl("/team-members"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      qc.invalidateQueries({ queryKey: ["team-members"] });
      toast({ title: "Team member added" });
    }
    setEditTeamMember(null);
    setAddTeamOpen(false);
    teamMemberForm.reset();
  }

  async function handleApplyOverhead() {
    setIsSavingOverhead(true);
    try {
      for (const [idStr, val] of Object.entries(overheadEdits)) {
        await fetch(getApiUrl(`/overhead/items/${idStr}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ monthlyAmount: parseFloat(val) }),
        });
      }
      if (totalUnitsInput !== "") {
        await fetch(getApiUrl("/overhead/settings"), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ totalUnitsPerMonth: parseInt(totalUnitsInput) }),
        });
      }
      const r = await fetch(getApiUrl("/overhead/apply"), { method: "POST" });
      const result = await r.json();
      setOverheadEdits({});
      setTotalUnitsInput("");
      qc.invalidateQueries({ queryKey: ["overhead"] });
      qc.invalidateQueries({ queryKey: getListIngredientsQueryKey() });
      toast({
        title: `Overhead applied — €${result.overheadPerUnit?.toFixed(4)}/unit`,
        description: result.affectedSkuCount > 0 ? `${result.affectedSkuCount} SKU${result.affectedSkuCount > 1 ? "s" : ""} recalculated` : "No SKUs using overhead yet",
      });
    } catch {
      toast({ variant: "destructive", title: "Error applying overhead" });
    } finally {
      setIsSavingOverhead(false);
    }
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Cost Library</h1>
            <p className="text-muted-foreground mt-1">Set up once — every SKU stays up to date automatically</p>
          </div>
        </div>

        {/* ── SECTION 1: YOUR TEAM ── */}
        <Card className="border-l-4 border-l-orange-500 overflow-hidden">
          <div className="px-6 py-4 bg-orange-50 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Users className="w-4 h-4 text-orange-600 flex-shrink-0" />
              <div>
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-orange-700">Your Team</CardTitle>
                <CardDescription className="text-xs mt-0.5">Set wages once — labor costs update automatically for every SKU</CardDescription>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => { setAddTeamOpen(true); setEditTeamMember(null); teamMemberForm.reset({ name: "", roleDescription: "", hourlyWage: 15, oncostPercent: 25 }); }}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add person
            </Button>
          </div>
          <CardContent className="p-0">
            {teamLoading ? (
              <div className="p-6 space-y-2">
                {[1,2].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (teamData?.length ?? 0) === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">
                No team members yet. Add the people who work in production.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="pl-6 text-xs font-medium">Name / Role</TableHead>
                    <TableHead className="text-right text-xs font-medium">Hourly wage</TableHead>
                    <TableHead className="text-right text-xs font-medium">
                      <div className="flex items-center justify-end gap-1">
                        Employer charges on top
                        <Tooltip>
                          <TooltipTrigger><Info className="w-3 h-3 text-muted-foreground" /></TooltipTrigger>
                          <TooltipContent className="max-w-52 text-xs">National insurance, pension, and holiday pay on top of their wage. Use 25% if unsure.</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableHead>
                    <TableHead className="text-right text-xs font-medium text-orange-700">What they cost you / hr</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamData?.filter(m => m.isActive).map(member => (
                    <TableRow key={member.id} className="cursor-pointer group" onClick={() => { setEditTeamMember(member); setAddTeamOpen(true); teamMemberForm.reset({ name: member.name, roleDescription: member.roleDescription || "", hourlyWage: member.hourlyWage, oncostPercent: member.oncostPercent }); }}>
                      <TableCell className="pl-6">
                        <div className="font-medium">{member.name}</div>
                        {member.roleDescription && <div className="text-xs text-muted-foreground">{member.roleDescription}</div>}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(member.hourlyWage)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{member.oncostPercent}%</TableCell>
                      <TableCell className="text-right font-semibold text-orange-700">{formatCurrency(member.loadedRate)}</TableCell>
                      <TableCell className="pr-4">
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto transition-opacity" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* ── SECTION 2: MONTHLY OVERHEAD ── */}
        <Card className="border-l-4 border-l-slate-400 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Calculator className="w-4 h-4 text-slate-500 flex-shrink-0" />
              <div>
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-600">Monthly Overhead</CardTitle>
                <CardDescription className="text-xs mt-0.5">Fixed costs shared across all products — divided by total units made</CardDescription>
              </div>
            </div>
          </div>
          <CardContent className="p-0">
            {overheadLoading ? (
              <div className="p-6"><Skeleton className="h-40 w-full" /></div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="pl-6 text-xs font-medium">Cost item</TableHead>
                      <TableHead className="text-right text-xs font-medium w-44 pr-6">Monthly amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overheadData?.items.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="pl-6 text-sm">{item.name}</TableCell>
                        <TableCell className="pr-6">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-muted-foreground text-xs">€</span>
                            <Input
                              type="number"
                              step="0.01"
                              className="w-28 h-8 text-right text-sm"
                              value={overheadEdits[item.id] ?? String(item.monthlyAmount)}
                              onChange={e => setOverheadEdits(prev => ({ ...prev, [item.id]: e.target.value }))}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="px-6 py-4 bg-slate-50 border-t space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1">
                      <label className="text-sm font-medium">Total units you make per month (all products)</label>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Input
                          type="number"
                          className="w-36 h-9"
                          placeholder={String(overheadData?.totalUnitsPerMonth ?? "")}
                          value={totalUnitsInput}
                          onChange={e => setTotalUnitsInput(e.target.value)}
                        />
                        <span className="text-sm text-muted-foreground">units / month</span>
                      </div>
                    </div>

                    {liveOverheadPerUnit !== null && (
                      <div className="bg-white border rounded-lg px-4 py-3 text-center">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Overhead per unit</div>
                        <div className="text-2xl font-bold text-slate-700 mt-0.5">{formatCurrency(liveOverheadPerUnit)}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          €{overheadWatchedTotal?.toFixed(0)} ÷ {totalUnitsDisplay.toLocaleString()} units
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs text-muted-foreground">Clicking "Save &amp; apply" updates the overhead cost and recalculates margins for all your SKUs.</p>
                    <Button onClick={handleApplyOverhead} disabled={isSavingOverhead || !totalUnitsDisplay} size="sm" className="flex-shrink-0">
                      {isSavingOverhead ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                      Save &amp; apply
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── INGREDIENT SECTIONS (Raw Materials, Packaging, Q&C, Delivery) ── */}
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Materials &amp; Cost Elements</h2>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
        </div>

        {ingLoading ? (
          <div className="space-y-4">
            {[1,2].map(i => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
        ) : (
          <div className="space-y-4">
            {INGREDIENT_CATEGORIES.map(cat => {
              const items = (filteredIngredients || []).filter(i => i.category === cat);
              return (
                <Card key={cat} className={`border-l-4 ${CATEGORY_BORDER[cat]} overflow-hidden`}>
                  <div className={`px-6 py-3 ${CATEGORY_HEADER_BG[cat]} flex items-center justify-between gap-3`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold uppercase tracking-wider ${CATEGORY_TEXT[cat]}`}>{cat}</span>
                      {items.length > 0 && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{items.length}</Badge>}
                    </div>
                    <button
                      onClick={() => { setAddIngCategory(cat); setAddIngOpen(true); addIngForm.reset({ name: "", category: cat, unit: cat === "Labor" ? "hr" : cat === "Delivery" ? "unit" : "kg", supplier: "", initialPrice: 0 }); }}
                      className={`text-xs ${CATEGORY_TEXT[cat]} hover:underline flex items-center gap-0.5`}
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>

                  {items.length === 0 ? (
                    <div className="py-6 text-center text-muted-foreground text-sm">
                      No {cat.toLowerCase()} items yet.{" "}
                      <button onClick={() => { setAddIngCategory(cat); setAddIngOpen(true); addIngForm.reset({ name: "", category: cat, unit: "kg", supplier: "", initialPrice: 0 }); }} className="text-primary hover:underline">Add one →</button>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableHead className="pl-6 text-xs font-medium">Name</TableHead>
                          <TableHead className="text-xs font-medium">Supplier</TableHead>
                          <TableHead className="text-right text-xs font-medium">Current price</TableHead>
                          <TableHead className="text-right text-xs font-medium">Change</TableHead>
                          <TableHead className="text-right text-xs font-medium">SKUs</TableHead>
                          <TableHead className="w-8" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map(ing => {
                          const hasChange = ing.priceChangePct !== null && ing.priceChangePct !== undefined;
                          const up = hasChange && (ing.priceChangePct as number) > 0;
                          const down = hasChange && (ing.priceChangePct as number) < 0;
                          return (
                            <TableRow key={ing.id} className="cursor-pointer hover:bg-muted/50 group" onClick={() => openEdit(ing.id)}>
                              <TableCell className="pl-6">
                                <span className="font-medium group-hover:text-primary transition-colors">{ing.name}</span>
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">{ing.supplier || "—"}</TableCell>
                              <TableCell className="text-right font-medium tabular-nums">
                                {ing.currentPrice != null ? `${formatCurrency(ing.currentPrice)}/${ing.unit}` : <span className="text-muted-foreground text-xs">No price set</span>}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {hasChange ? (
                                  <span className={`text-xs font-medium flex items-center justify-end gap-0.5 ${up ? "text-destructive" : down ? "text-green-600" : "text-muted-foreground"}`}>
                                    {up ? <TrendingUp className="w-3 h-3" /> : down ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                                    {(ing.priceChangePct as number) > 0 ? "+" : ""}{(ing.priceChangePct as number).toFixed(1)}%
                                  </span>
                                ) : <span className="text-xs text-muted-foreground">—</span>}
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge variant="secondary" className="text-xs">{ing.skuCount}</Badge>
                              </TableCell>
                              <TableCell>
                                <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1">
                                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                </button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* ── TEAM MEMBER ADD/EDIT SHEET ── */}
        <Sheet open={addTeamOpen} onOpenChange={(o) => { if (!o) { setAddTeamOpen(false); setEditTeamMember(null); } }}>
          <SheetContent className="sm:max-w-md overflow-y-auto">
            <SheetHeader className="pb-4">
              <SheetTitle>{editTeamMember ? "Edit team member" : "Add team member"}</SheetTitle>
              <SheetDescription>Set their wage once — labor costs update across all products automatically.</SheetDescription>
            </SheetHeader>
            <Form {...teamMemberForm}>
              <form onSubmit={teamMemberForm.handleSubmit(handleSaveTeamMember)} className="space-y-4">
                <FormField control={teamMemberForm.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl><Input placeholder='e.g. "Marco" or "Ana — baker"' {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={teamMemberForm.control} name="roleDescription" render={({ field }) => (
                  <FormItem>
                    <FormLabel>What they do <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl><Input placeholder="e.g. Production + packing" {...field} value={field.value || ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={teamMemberForm.control} name="hourlyWage" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hourly wage (€)</FormLabel>
                    <FormControl><Input type="number" step="0.01" min="0" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={teamMemberForm.control} name="oncostPercent" render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <div className="flex items-center gap-1.5">
                        Employer charges on top of wages
                        <Tooltip>
                          <TooltipTrigger type="button"><Info className="w-3.5 h-3.5 text-muted-foreground" /></TooltipTrigger>
                          <TooltipContent className="max-w-60 text-xs">National insurance, pension, and holiday pay on top of their wage. Use 25% if unsure.</TooltipContent>
                        </Tooltip>
                      </div>
                    </FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.5" min="0" max="100" className="w-24" {...field} /></FormControl>
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />

                {previewLoadedRate > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-sm">
                    <span className="text-muted-foreground">This person costs you </span>
                    <span className="font-bold text-orange-700">{formatCurrency(previewLoadedRate)}/hr</span>
                    <span className="text-muted-foreground"> including all charges</span>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="ghost" className="flex-1" onClick={() => { setAddTeamOpen(false); setEditTeamMember(null); }}>Cancel</Button>
                  <Button type="submit" className="flex-1">Save</Button>
                </div>
              </form>
            </Form>
          </SheetContent>
        </Sheet>

        {/* ── INGREDIENT EDIT PANEL ── */}
        <Sheet open={!!editPanelId} onOpenChange={(open) => !open && setEditPanelId(null)}>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader className="pb-4">
              <SheetTitle className="text-lg">{editingIngredient?.name}</SheetTitle>
              <SheetDescription>{editingIngredient?.category} · {editingIngredient?.unit}</SheetDescription>
            </SheetHeader>

            <div className="space-y-6">
              <div className="border rounded-lg p-4 space-y-4">
                <p className="text-sm font-medium">Details</p>
                <Form {...editNameForm}>
                  <form onSubmit={editNameForm.handleSubmit(handleSaveName)} className="space-y-3">
                    <FormField control={editNameForm.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={editNameForm.control} name="supplier" render={({ field }) => (
                      <FormItem><FormLabel>Supplier</FormLabel><FormControl><Input placeholder="Optional" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <Button type="submit" size="sm">Save details</Button>
                  </form>
                </Form>
              </div>

              <div className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Update price</p>
                  {editingIngredient?.currentPrice != null && (
                    <span className="text-sm text-muted-foreground">Current: {formatCurrency(editingIngredient.currentPrice)}/{editingIngredient.unit}</span>
                  )}
                </div>
                <Form {...addPriceForm}>
                  <form onSubmit={addPriceForm.handleSubmit(handleAddPrice)} className="space-y-3">
                    <div className="flex gap-2">
                      <FormField control={addPriceForm.control} name="price" render={({ field }) => (
                        <FormItem className="flex-1"><FormLabel>New price (€/{editingIngredient?.unit})</FormLabel><FormControl><Input type="number" step="0.0001" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={addPriceForm.control} name="effectiveDate" render={({ field }) => (
                        <FormItem className="flex-1"><FormLabel>Effective date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                    <FormField control={addPriceForm.control} name="reason" render={({ field }) => (
                      <FormItem><FormLabel>Reason (optional)</FormLabel><FormControl><Input placeholder="e.g. Supplier increase" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="flex items-center justify-between bg-muted rounded-lg px-3 py-2 text-sm">
                      <span className="text-muted-foreground">SKUs affected</span>
                      <span className="font-medium">{editingIngredient?.skuCount ?? 0}</span>
                    </div>
                    <Button type="submit" size="sm" disabled={updatePrice.isPending}>Update price</Button>
                  </form>
                </Form>
              </div>

              {ingredientSkus && ingredientSkus.length > 0 && (
                <div className="border rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium">Used in {ingredientSkus.length} SKU{ingredientSkus.length !== 1 ? "s" : ""}</p>
                  <div className="space-y-1.5">
                    {ingredientSkus.map((sku: any) => (
                      <div key={sku.id} className="flex items-center gap-2 text-sm">
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{sku.skuCode}</span>
                        <span>{sku.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* ── ADD INGREDIENT DIALOG ── */}
        <Dialog open={addIngOpen} onOpenChange={(o) => { if (!o) setAddIngOpen(false); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add cost element</DialogTitle></DialogHeader>
            <Form {...addIngForm}>
              <form onSubmit={addIngForm.handleSubmit(handleAddIngredient)} className="space-y-4">
                <FormField control={addIngForm.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="e.g. Whey Protein Concentrate" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={addIngForm.control} name="category" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {INGREDIENT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={addIngForm.control} name="unit" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {["kg", "g", "L", "ml", "each", "unit", "hr", "box"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={addIngForm.control} name="supplier" render={({ field }) => (
                  <FormItem><FormLabel>Supplier <span className="text-muted-foreground font-normal">(optional)</span></FormLabel><FormControl><Input placeholder="Supplier name" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={addIngForm.control} name="initialPrice" render={({ field }) => (
                  <FormItem><FormLabel>Starting price (€/unit)</FormLabel><FormControl><Input type="number" step="0.0001" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setAddIngOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createIngredient.isPending}>Add</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
