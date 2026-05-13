import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  useListIngredients,
} from "@workspace/api-client-react";
import type { PackagingItem } from "@workspace/api-client-react";
import { PACKAGING_CATEGORIES } from "./packaging";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, Plus, TrendingUp, TrendingDown, Minus, Users, Calculator, Info, Check, Loader2, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/queryClient";

const INGREDIENT_CATEGORIES = [
  "Raw Materials",
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

const teamMemberSchema = z.object({
  name: z.string().min(1, "Name is required"),
  roleDescription: z.string().optional(),
  hourlyWage: z.coerce.number().min(0.01, "Must be > 0"),
  oncostPercent: z.coerce.number().min(0).max(100).default(25),
});


interface TeamMember { id: number; name: string; roleDescription: string | null; hourlyWage: number; oncostPercent: number; loadedRate: number; isActive: boolean; }
interface OverheadItem { id: number; name: string; monthlyAmount: number; frequency: string; sortOrder: number; isActive: boolean; }

export default function CostLibrary() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: ingredients, isLoading: ingLoading } = useListIngredients();
  const { data: packagingItems } = useQuery<PackagingItem[]>({
    queryKey: ["/api/packaging"],
    queryFn: async () => {
      const r = await fetch(getApiUrl("/packaging"));
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const [search, setSearch] = useState("");
  const [packagingCategoryFilter, setPackagingCategoryFilter] = useState<string>("all");
  const [rawMaterialsSubCategoryFilter, setRawMaterialsSubCategoryFilter] = useState<string>("all");
  const [editTeamMember, setEditTeamMember] = useState<TeamMember | null>(null);
  const [addTeamOpen, setAddTeamOpen] = useState(false);

  const teamMemberForm = useForm<z.infer<typeof teamMemberSchema>>({
    resolver: zodResolver(teamMemberSchema),
    defaultValues: { name: "", roleDescription: "", hourlyWage: 15, oncostPercent: 25 },
  });


  const { data: teamData, isLoading: teamLoading } = useQuery({
    queryKey: ["team-members"],
    queryFn: async () => { const r = await fetch(getApiUrl("/team-members")); return r.json() as Promise<TeamMember[]>; },
  });

  const { data: overheadData, isLoading: overheadLoading } = useQuery({
    queryKey: ["overhead"],
    queryFn: async () => {
      const r = await fetch(getApiUrl("/overhead"));
      return r.json() as Promise<{ items: OverheadItem[]; operatingDaysPerYear: number; daysPerMonth: number; totalMonthly: number }>;
    },
  });


  const [overheadEdits, setOverheadEdits] = useState<Record<number, string>>({});
  const [freqEdits, setFreqEdits] = useState<Record<number, string>>({});
  const [operatingDaysInput, setOperatingDaysInput] = useState<string>("");
  const [isSavingOverhead, setIsSavingOverhead] = useState(false);

  const operatingDaysDisplay = operatingDaysInput !== "" ? parseInt(operatingDaysInput) || 0 : (overheadData?.operatingDaysPerYear ?? 250);
  const liveDaysPerMonth = parseFloat((operatingDaysDisplay / 12).toFixed(1));

  const overheadWatchedTotal = useMemo(() => {
    if (!overheadData?.items || !Array.isArray(overheadData.items)) return null;
    let total = 0;
    for (const item of overheadData.items) {
      const edited = overheadEdits[item.id];
      const freq = freqEdits[item.id] ?? item.frequency ?? "monthly";
      const amount = parseFloat(edited ?? String(item.monthlyAmount)) || 0;
      total += freq === "annual" ? amount / 12 : amount;
    }
    return total;
  }, [overheadData, overheadEdits, freqEdits]);

  const watchedWage = teamMemberForm.watch("hourlyWage");
  const watchedOncost = teamMemberForm.watch("oncostPercent");
  const previewLoadedRate = (parseFloat(String(watchedWage)) || 0) * (1 + (parseFloat(String(watchedOncost)) || 0) / 100);

  const packagingCategoriesWithItems = useMemo(() => {
    if (!packagingItems) return [];
    const seen = new Set(packagingItems.map(i => i.category));
    return PACKAGING_CATEGORIES.filter(c => seen.has(c.value as string));
  }, [packagingItems]);

  const rawMaterialsSubCategories = useMemo(() => {
    if (!ingredients) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of ingredients) {
      if (item.category !== "Raw Materials") continue;
      const sub = item.subCategory?.trim();
      if (sub && !seen.has(sub)) { seen.add(sub); result.push(sub); }
    }
    return result.sort();
  }, [ingredients]);

  const filteredPackaging = useMemo(() => {
    let items = packagingItems ?? [];
    if (packagingCategoryFilter !== "all") {
      items = items.filter(i => i.category === packagingCategoryFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(i =>
        i.nameEnglish.toLowerCase().includes(q) ||
        (i.nameThai || "").toLowerCase().includes(q) ||
        (i.supplier || "").toLowerCase().includes(q)
      );
    }
    return items;
  }, [packagingItems, packagingCategoryFilter, search]);

  const filteredIngredients = useMemo(() => {
    if (!search || !ingredients) return ingredients;
    const q = search.toLowerCase();
    return ingredients.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.supplier || "").toLowerCase().includes(q) ||
      (i.subCategory || "").toLowerCase().includes(q)
    );
  }, [ingredients, search]);

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
      let totalAffected = 0;
      for (const [idStr, val] of Object.entries(overheadEdits)) {
        const freq = freqEdits[idStr] ?? undefined;
        const r = await fetch(getApiUrl(`/overhead/items/${idStr}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ monthlyAmount: parseFloat(val), ...(freq ? { frequency: freq } : {}) }),
        });
        const result = await r.json();
        totalAffected = Math.max(totalAffected, result.affectedSkuCount ?? 0);
      }
      for (const [idStr, freq] of Object.entries(freqEdits)) {
        if (overheadEdits[idStr]) continue;
        const r = await fetch(getApiUrl(`/overhead/items/${idStr}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ frequency: freq }),
        });
        const result = await r.json();
        totalAffected = Math.max(totalAffected, result.affectedSkuCount ?? 0);
      }
      if (operatingDaysInput !== "") {
        const r = await fetch(getApiUrl("/overhead/settings"), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operatingDaysPerYear: parseInt(operatingDaysInput) }),
        });
        const result = await r.json();
        totalAffected = Math.max(totalAffected, result.affectedSkuCount ?? 0);
      }
      setOverheadEdits({});
      setFreqEdits({});
      setOperatingDaysInput("");
      qc.invalidateQueries({ queryKey: ["overhead"] });
      qc.invalidateQueries({ queryKey: ["production-config"] });
      toast({
        title: "Overhead saved",
        description: totalAffected > 0
          ? `${totalAffected} SKU${totalAffected > 1 ? "s" : ""} recalculated`
          : "No SKUs with production setup yet",
      });
    } catch {
      toast({ variant: "destructive", title: "Error saving overhead" });
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
                {[1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}
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
                      <TableCell className="pr-4 text-right">
                        <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">Edit</span>
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
                <CardDescription className="text-xs mt-0.5">Fixed costs divided per SKU based on how many days each product is made</CardDescription>
              </div>
            </div>
          </div>
          <CardContent className="p-0">
            {overheadLoading ? (
              <div className="p-6"><Skeleton className="h-40 w-full" /></div>
            ) : (
              <>
                <div className="px-6 py-4 border-b bg-slate-50/60 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1">
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      How many days per year does your factory operate?
                      <Tooltip>
                        <TooltipTrigger type="button"><Info className="w-3.5 h-3.5 text-muted-foreground" /></TooltipTrigger>
                        <TooltipContent className="max-w-60 text-xs">Used to calculate how many production days there are per month (÷ 12). Overhead is then divided by units-per-day × production-days to get a per-unit cost.</TooltipContent>
                      </Tooltip>
                    </label>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Input
                        type="number" min="1" max="365" className="w-28 h-9"
                        value={operatingDaysInput !== "" ? operatingDaysInput : String(overheadData?.operatingDaysPerYear ?? 250)}
                        onChange={e => setOperatingDaysInput(e.target.value)}
                      />
                      <span className="text-sm text-muted-foreground">days / year</span>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">≈ {liveDaysPerMonth} days / month</span>
                    </div>
                  </div>
                  {overheadWatchedTotal !== null && overheadWatchedTotal > 0 && (
                    <div className="bg-white border rounded-lg px-4 py-3 text-center flex-shrink-0">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Monthly pool total</div>
                      <div className="text-xl font-bold text-slate-700 mt-0.5">{formatCurrency(overheadWatchedTotal)}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">overhead per month</div>
                    </div>
                  )}
                </div>

                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="pl-6 text-xs font-medium">Cost item</TableHead>
                      <TableHead className="text-xs font-medium w-28">Frequency</TableHead>
                      <TableHead className="text-right text-xs font-medium w-48 pr-6">Amount (฿)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overheadData?.items?.map(item => {
                      const currentFreq = freqEdits[item.id] ?? item.frequency ?? "monthly";
                      const currentAmount = overheadEdits[item.id] ?? String(item.monthlyAmount);
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="pl-6 text-sm">{item.name}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <button type="button" onClick={() => setFreqEdits(prev => ({ ...prev, [item.id]: "monthly" }))} className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${currentFreq === "monthly" ? "bg-slate-700 text-white border-slate-700" : "text-muted-foreground border-muted-foreground/30 hover:border-slate-400"}`}>Monthly</button>
                              <button type="button" onClick={() => setFreqEdits(prev => ({ ...prev, [item.id]: "annual" }))} className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${currentFreq === "annual" ? "bg-amber-600 text-white border-amber-600" : "text-muted-foreground border-muted-foreground/30 hover:border-amber-400"}`}>Annual</button>
                            </div>
                          </TableCell>
                          <TableCell className="pr-6">
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-muted-foreground text-xs">฿</span>
                              <Input type="number" step="0.01" className="w-28 h-8 text-right text-sm" value={currentAmount} onChange={e => setOverheadEdits(prev => ({ ...prev, [item.id]: e.target.value }))} />
                              {currentFreq === "annual" && <span className="text-xs text-amber-600 whitespace-nowrap">≈ {formatCurrency((parseFloat(currentAmount) || 0) / 12)}/mo</span>}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                <div className="px-6 py-4 bg-slate-50 border-t flex items-center justify-between gap-4">
                  <p className="text-xs text-muted-foreground">"Save &amp; apply" recalculates overhead for every SKU that has a production setup.</p>
                  <Button onClick={handleApplyOverhead} disabled={isSavingOverhead} size="sm" className="flex-shrink-0">
                    {isSavingOverhead ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                    Save &amp; apply
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── INGREDIENT SECTIONS ── */}
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Materials &amp; Cost Elements</h2>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
        </div>

        {ingLoading ? (
          <div className="space-y-4">
            {[1, 2].map(i => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
        ) : (
          <div className="space-y-4">
            {INGREDIENT_CATEGORIES.map(cat => {
              const allCatItems = (filteredIngredients || []).filter(i => i.category === cat);
              const items = cat === "Raw Materials" && rawMaterialsSubCategoryFilter !== "all"
                ? allCatItems.filter(i => i.subCategory === rawMaterialsSubCategoryFilter)
                : allCatItems;
              return (
                <Card key={cat} className={`border-l-4 ${CATEGORY_BORDER[cat]} overflow-hidden`}>
                  <div className={`px-6 py-3 ${CATEGORY_HEADER_BG[cat]} flex items-center justify-between gap-3`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold uppercase tracking-wider ${CATEGORY_TEXT[cat]}`}>{cat}</span>
                      {allCatItems.length > 0 && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{allCatItems.length}</Badge>}
                    </div>
                    <button
                      onClick={() => setLocation(`/ingredients/new?category=${encodeURIComponent(cat)}`)}
                      className={`text-xs ${CATEGORY_TEXT[cat]} hover:underline flex items-center gap-0.5`}
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>

                  {cat === "Raw Materials" && rawMaterialsSubCategories.length > 1 && (
                    <div className="px-6 py-2 border-b flex flex-wrap gap-1.5 bg-green-50/40">
                      <button
                        onClick={() => setRawMaterialsSubCategoryFilter("all")}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          rawMaterialsSubCategoryFilter === "all"
                            ? "bg-green-600 text-white border-green-600"
                            : "text-green-700 border-green-200 hover:border-green-400 bg-white"
                        }`}
                      >
                        All
                      </button>
                      {rawMaterialsSubCategories.map(sub => (
                        <button
                          key={sub}
                          onClick={() => setRawMaterialsSubCategoryFilter(sub)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            rawMaterialsSubCategoryFilter === sub
                              ? "bg-green-600 text-white border-green-600"
                              : "text-green-700 border-green-200 hover:border-green-400 bg-white"
                          }`}
                        >
                          {sub}
                        </button>
                      ))}
                    </div>
                  )}

                  {items.length === 0 ? (
                    <div className="py-6 text-center text-muted-foreground text-sm">
                      {cat === "Raw Materials" && rawMaterialsSubCategoryFilter !== "all"
                        ? "No items match the current filter."
                        : <>{`No ${cat.toLowerCase()} items yet.`}{" "}<button onClick={() => setLocation(`/ingredients/new?category=${encodeURIComponent(cat)}`)} className="text-primary hover:underline">Add one →</button></>
                      }
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableHead className="pl-6 text-xs font-medium">Name</TableHead>
                          <TableHead className="text-xs font-medium">Sub-category</TableHead>
                          <TableHead className="text-xs font-medium">Supplier</TableHead>
                          <TableHead className="text-right text-xs font-medium">Current price (฿)</TableHead>
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
                            <TableRow
                              key={ing.id}
                              className="cursor-pointer hover:bg-muted/50 group"
                              onClick={() => setLocation(`/ingredients/${ing.id}`)}
                            >
                              <TableCell className="pl-6">
                                <div className="font-medium group-hover:text-primary transition-colors">{ing.name}</div>
                                {ing.description && <div className="text-xs text-muted-foreground truncate max-w-48">{ing.description}</div>}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">{ing.subCategory || "—"}</TableCell>
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
                                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
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

            {/* ── PACKAGING ITEMS ── */}
            <Card className="border-l-4 border-l-violet-500 overflow-hidden">
              <div className="px-6 py-3 bg-violet-50 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-violet-700">Packaging</span>
                  {packagingItems && packagingItems.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{packagingItems.length}</Badge>
                  )}
                </div>
                <button
                  onClick={() => setLocation("/packaging/new")}
                  className="text-xs text-violet-700 hover:underline flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>

              {packagingCategoriesWithItems.length > 1 && (
                <div className="px-6 py-2 border-b flex flex-wrap gap-1.5 bg-violet-50/40">
                  <button
                    onClick={() => setPackagingCategoryFilter("all")}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      packagingCategoryFilter === "all"
                        ? "bg-violet-600 text-white border-violet-600"
                        : "text-violet-700 border-violet-200 hover:border-violet-400 bg-white"
                    }`}
                  >
                    All
                  </button>
                  {packagingCategoriesWithItems.map(cat => (
                    <button
                      key={cat.value}
                      onClick={() => setPackagingCategoryFilter(cat.value)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        packagingCategoryFilter === cat.value
                          ? "bg-violet-600 text-white border-violet-600"
                          : "text-violet-700 border-violet-200 hover:border-violet-400 bg-white"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              )}

              {(filteredPackaging?.length ?? 0) === 0 ? (
                <div className="py-6 text-center text-muted-foreground text-sm">
                  {packagingCategoryFilter !== "all" || search
                    ? "No items match the current filter."
                    : <>No packaging items yet.{" "}<button onClick={() => setLocation("/packaging/new")} className="text-primary hover:underline">Add one →</button></>
                  }
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="pl-6 text-xs font-medium">Name</TableHead>
                      <TableHead className="text-xs font-medium">Category</TableHead>
                      <TableHead className="text-xs font-medium">Supplier</TableHead>
                      <TableHead className="text-right text-xs font-medium">Unit Cost (฿)</TableHead>
                      <TableHead className="text-right text-xs font-medium">MOQ</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPackaging?.map(item => (
                      <TableRow
                        key={item.id}
                        className="cursor-pointer hover:bg-muted/50 group"
                        onClick={() => setLocation(`/packaging/${item.id}`)}
                      >
                        <TableCell className="pl-6">
                          <div className="font-medium group-hover:text-primary transition-colors">{item.nameEnglish}</div>
                          {item.nameThai && <div className="text-xs text-muted-foreground">{item.nameThai}</div>}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {PACKAGING_CATEGORIES.find(c => c.value === item.category)?.label ?? item.category}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{item.supplier || "—"}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatCurrency(item.unitCost)}/{item.unit}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm">{item.moq ?? "—"}</TableCell>
                        <TableCell>
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
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
                  <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder='e.g. "Marco" or "Ana — baker"' {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={teamMemberForm.control} name="roleDescription" render={({ field }) => (
                  <FormItem><FormLabel>What they do <span className="text-muted-foreground font-normal">(optional)</span></FormLabel><FormControl><Input placeholder="e.g. Production + packing" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={teamMemberForm.control} name="hourlyWage" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hourly wage (฿)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">฿</span>
                        <Input type="number" step="0.01" min="0" className="pl-7" {...field} />
                      </div>
                    </FormControl>
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

      </div>
    </TooltipProvider>
  );
}
