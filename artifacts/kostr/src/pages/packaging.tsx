import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Package, FileText, FileCheck2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { getApiUrl } from "@/lib/queryClient";
import type { PackagingItem } from "@workspace/api-client-react";

export const PACKAGING_CATEGORIES = [
  { value: "sachet_primary_bag", label: "Sachet / Primary Bag" },
  { value: "inner_bag", label: "Inner Bag" },
  { value: "box_carton", label: "Box / Carton" },
  { value: "sticker_label", label: "Sticker / Label" },
  { value: "oxygen_absorber", label: "Oxygen Absorber" },
  { value: "desiccant", label: "Desiccant" },
  { value: "shrink_wrap", label: "Shrink Wrap" },
  { value: "tray_insert", label: "Tray / Insert" },
  { value: "printing_block", label: "Printing Block" },
  { value: "other", label: "Other" },
] as const;

export function categoryLabel(value: string): string {
  return PACKAGING_CATEGORIES.find(c => c.value === value)?.label ?? value;
}

const BAG_TYPE_LABELS: Record<string, string> = {
  pouch_stand_up: "Pouch (Stand-Up)",
  pillow_bag: "Pillow Bag",
  flat_bottom_pouch: "Flat-Bottom Pouch",
  gusseted_bag: "Gusseted Bag",
  quad_seal_bag: "Quad-Seal Bag",
  doyen_bag: "Doyen Bag",
  other: "Other",
};

export function bagTypeLabel(value: string): string {
  return BAG_TYPE_LABELS[value] ?? value;
}

const CATEGORY_COLORS: Record<string, string> = {
  sachet_primary_bag: "bg-purple-100 text-purple-800",
  inner_bag: "bg-violet-100 text-violet-800",
  box_carton: "bg-blue-100 text-blue-800",
  sticker_label: "bg-cyan-100 text-cyan-800",
  oxygen_absorber: "bg-green-100 text-green-800",
  desiccant: "bg-teal-100 text-teal-800",
  shrink_wrap: "bg-yellow-100 text-yellow-800",
  tray_insert: "bg-orange-100 text-orange-800",
  printing_block: "bg-rose-100 text-rose-800",
  other: "bg-slate-100 text-slate-700",
};

export default function PackagingList() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "supplier" | "unitCost" | "size">("name");

  const { data: items, isLoading } = useQuery<PackagingItem[]>({
    queryKey: ["/api/packaging"],
    queryFn: async () => {
      const r = await fetch(getApiUrl("/packaging"));
      if (!r.ok) throw new Error("Failed to load packaging items");
      return r.json();
    },
  });

  const getSizeScore = (item: PackagingItem): number => {
    const s = item.specs as any;
    if (!s) return 0;
    if (s.widthMm && s.lengthMm) return (s.widthMm / 10) * (s.lengthMm / 10);
    if (s.lengthCm && s.widthCm && s.heightCm) return s.lengthCm * s.widthCm * s.heightCm;
    if (s.lengthCm && s.widthCm) return s.lengthCm * s.widthCm;
    if (s.rollWidthMm && s.lengthMm) return (s.rollWidthMm / 10) * (s.lengthMm / 10);
    if (s.rollWidthMm) return s.rollWidthMm / 10;
    if (s.heightMm) return s.heightMm;
    return 0;
  };

  const filtered = useMemo(() => {
    if (!items) return [];
    let result = items;
    if (activeCategory !== "all") result = result.filter(i => i.category === activeCategory);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(i =>
        i.nameEnglish.toLowerCase().includes(q) ||
        (i.nameThai || "").toLowerCase().includes(q) ||
        (i.supplier || "").toLowerCase().includes(q) ||
        categoryLabel(i.category).toLowerCase().includes(q)
      );
    }
    return [...result].sort((a, b) => {
      if (sortBy === "supplier") return (a.supplier || "").localeCompare(b.supplier || "");
      if (sortBy === "unitCost") return a.unitCost - b.unitCost;
      if (sortBy === "size") return getSizeScore(a) - getSizeScore(b);
      return a.nameEnglish.localeCompare(b.nameEnglish);
    });
  }, [items, activeCategory, search, sortBy]);

  const countByCategory = useMemo(() => {
    if (!items) return {} as Record<string, number>;
    return items.reduce((acc, i) => {
      acc[i.category] = (acc[i.category] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [items]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Packaging</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage packaging materials and components</p>
        </div>
        <Button onClick={() => setLocation("/packaging/new")}>
          <Plus className="w-4 h-4 mr-2" />
          Add Item
        </Button>
      </div>

      {/* Category filter tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory("all")}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${activeCategory === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
        >
          All {items ? `(${items.length})` : ""}
        </button>
        {PACKAGING_CATEGORIES.map(cat => (
          <button
            key={cat.value}
            onClick={() => setActiveCategory(cat.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${activeCategory === cat.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
          >
            {cat.label} {countByCategory[cat.value] ? `(${countByCategory[cat.value]})` : ""}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, supplier, or category..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Sort by</span>
              <Select value={sortBy} onValueChange={v => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-36 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="supplier">Supplier</SelectItem>
                  <SelectItem value="unitCost">Unit Cost</SelectItem>
                  <SelectItem value="size">Size</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {search && (
              <span className="text-sm text-muted-foreground">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Package className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground font-medium">
                {search || activeCategory !== "all" ? "No items match your filter" : "No packaging items yet"}
              </p>
              {!search && activeCategory === "all" && (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setLocation("/packaging/new")}>
                  <Plus className="w-4 h-4 mr-1" /> Add first item
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead className="text-right">MOQ</TableHead>
                  <TableHead className="text-right">Lead Time</TableHead>
                  <TableHead className="text-center">Docs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(item => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setLocation(`/packaging/${item.id}`)}
                  >
                    <TableCell>
                      <div className="font-medium">{item.nameEnglish}</div>
                      {item.nameThai && <div className="text-xs text-muted-foreground">{item.nameThai}</div>}
                      {item.category === "sachet_primary_bag" && (item.specs as any)?.bagType && (
                        <Badge variant="secondary" className="mt-1 text-xs bg-indigo-50 text-indigo-700 border-indigo-100">
                          {bagTypeLabel((item.specs as any).bagType)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={CATEGORY_COLORS[item.category]}>
                        {categoryLabel(item.category)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.supplier || "—"}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(item.unitCost)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{item.moq ?? "—"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {item.leadTimeDays != null ? `${item.leadTimeDays}d` : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {item.quotationObjectPath && (
                          <span title="Quotation attached" className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            <FileText className="w-3 h-3" />
                            Quote
                          </span>
                        )}
                        {item.specDocObjectPath && (
                          <span title="Spec sheet attached" className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <FileCheck2 className="w-3 h-3" />
                            Spec
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
