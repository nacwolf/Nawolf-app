import { useState, useMemo } from "react";
import { useGetDashboardSummary, useListSkus } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatPercent, formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link, useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, TrendingUp, Package, CheckCircle, AlertTriangle, XCircle, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

type SortKey = "margin" | "name" | "lastChanged";
type SortDir = "asc" | "desc";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: skus, isLoading: loadingSkus } = useListSkus();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("margin");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const categories = useMemo(() => {
    if (!skus) return [];
    const cats = [...new Set(skus.map((s) => s.category).filter(Boolean))];
    return cats.sort();
  }, [skus]);

  const filteredSkus = useMemo(() => {
    if (!skus) return [];
    let list = skus.filter((sku) => {
      if (statusFilter !== "all" && sku.status !== statusFilter) return false;
      if (categoryFilter !== "all" && sku.category !== categoryFilter) return false;
      if (search && !sku.name.toLowerCase().includes(search.toLowerCase()) && !sku.skuCode.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "margin") {
        cmp = (a.grossMargin ?? -1) - (b.grossMargin ?? -1);
      } else if (sortKey === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (sortKey === "lastChanged") {
        const ad = (a as any).lastChangedDate ?? "";
        const bd = (b as any).lastChangedDate ?? "";
        cmp = ad.localeCompare(bd);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [skus, statusFilter, categoryFilter, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <Button asChild>
          <Link href="/skus/new">
            <Plus className="w-4 h-4 mr-2" />
            New SKU
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => setStatusFilter("all")}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total SKUs</CardTitle>
            <Package className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-12" /> : (
              <div className="text-2xl font-bold">{summary?.totalSkus ?? 0}</div>
            )}
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors col-span-1"
          onClick={() => setStatusFilter("all")}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Margin</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold">{formatPercent(summary?.avgMargin)}</div>
            )}
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-green-200 dark:hover:border-green-800 transition-colors"
          onClick={() => setStatusFilter("healthy")}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Healthy</CardTitle>
            <CheckCircle className="w-4 h-4 text-green-600" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-10" /> : (
              <>
                <div className="text-2xl font-bold text-green-600">{summary?.healthyCount ?? 0}</div>
                <p className="text-xs text-muted-foreground">margin &gt;25%</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-amber-200 dark:hover:border-amber-800 transition-colors"
          onClick={() => setStatusFilter("review")}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Review</CardTitle>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-10" /> : (
              <>
                <div className="text-2xl font-bold text-amber-500">{summary?.reviewCount ?? 0}</div>
                <p className="text-xs text-muted-foreground">margin 10–25%</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-red-200 dark:hover:border-red-800 transition-colors"
          onClick={() => setStatusFilter("critical")}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Critical</CardTitle>
            <XCircle className="w-4 h-4 text-red-600" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-10" /> : (
              <>
                <div className="text-2xl font-bold text-red-600">{summary?.criticalCount ?? 0}</div>
                <p className="text-xs text-muted-foreground">margin &lt;10%</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search SKUs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="w-full sm:w-48">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-44">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="healthy">Healthy</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Current COGS</TableHead>
                  <TableHead className="text-right">Sell Price</TableHead>
                  <TableHead className="text-right">
                    <button
                      className="flex items-center ml-auto hover:text-foreground"
                      onClick={() => toggleSort("margin")}
                    >
                      Margin <SortIcon k="margin" />
                    </button>
                  </TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">
                    <button
                      className="flex items-center ml-auto hover:text-foreground"
                      onClick={() => toggleSort("lastChanged")}
                    >
                      Last Changed <SortIcon k="lastChanged" />
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingSkus ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredSkus.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                      No SKUs match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSkus.map((sku) => (
                    <TableRow
                      key={sku.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setLocation(`/skus/${sku.id}`)}
                    >
                      <TableCell>
                        <div className="font-medium">{sku.name}</div>
                        <div className="text-xs text-muted-foreground">{sku.skuCode}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{sku.category}</TableCell>
                      <TableCell className="text-right">{formatCurrency(sku.totalCogs)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(sku.sellPrice)}</TableCell>
                      <TableCell className="text-right font-medium">{formatPercent(sku.grossMargin)}</TableCell>
                      <TableCell className="text-center">
                        <span onClick={(e) => { e.stopPropagation(); setStatusFilter(sku.status); }}>
                          <StatusBadge status={sku.status} />
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm">
                        {formatDate((sku as any).lastChangedDate)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
