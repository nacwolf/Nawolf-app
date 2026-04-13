import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPercent, formatDate } from "@/lib/format";
import { getApiUrl } from "@/lib/queryClient";
import { Download, ArrowUp, ArrowDown, Minus } from "lucide-react";

type ActivityRow = {
  id: number;
  skuId: number;
  skuCode: string;
  skuName: string;
  snapshotDate: string;
  totalCogs: number;
  sellPrice: number;
  grossMargin: number;
  triggeredBy: string | null;
  createdAt: string;
  prevTotalCogs: number | null;
  prevGrossMargin: number | null;
};

type TriggerType = "all" | "ingredient_cost" | "sell_price" | "cost_line" | "sku_created";
type GroupBy = "none" | "day" | "week";

function triggerInfo(triggeredBy: string | null): { label: string; className: string } {
  if (!triggeredBy) return { label: "Unknown", className: "bg-gray-100 text-gray-700" };
  if (triggeredBy.startsWith("price_update")) return { label: "Ingredient Cost", className: "bg-orange-100 text-orange-800" };
  if (triggeredBy === "sell_price_updated") return { label: "Sell Price", className: "bg-purple-100 text-purple-800" };
  if (triggeredBy.startsWith("cost_line")) return { label: "BOM Change", className: "bg-blue-100 text-blue-800" };
  if (triggeredBy === "sku_created") return { label: "SKU Created", className: "bg-green-100 text-green-800" };
  return { label: triggeredBy, className: "bg-gray-100 text-gray-700" };
}

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

export default function ActivityFeed() {
  const [, setLocation] = useLocation();
  const [triggerType, setTriggerType] = useState<TriggerType>("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["activity", triggerType, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "200" });
      if (triggerType !== "all") params.set("triggerType", triggerType);
      const res = await fetch(getApiUrl(`/activity?${params}`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load activity");
      return res.json() as Promise<ActivityRow[]>;
    },
  });

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      if (dateFrom && r.snapshotDate < dateFrom) return false;
      if (dateTo && r.snapshotDate > dateTo) return false;
      return true;
    });
  }, [rows, dateFrom, dateTo]);

  const grouped = useMemo(() => {
    if (groupBy === "none") return [{ key: null, label: null, rows: filteredRows }];
    const map = new Map<string, ActivityRow[]>();
    for (const row of filteredRows) {
      const key = groupBy === "day" ? row.snapshotDate : getWeekStart(row.snapshotDate);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, rows]) => ({
        key,
        label: groupBy === "day" ? formatDate(key) : `Week of ${formatDate(key)}`,
        rows,
      }));
  }, [filteredRows, groupBy]);

  function exportCsv() {
    const cols = ["Date", "SKU Code", "SKU Name", "Trigger", "COGS", "Margin %"];
    const lines = [cols.join(",")];
    for (const row of filteredRows) {
      lines.push([
        row.snapshotDate,
        row.skuCode,
        `"${row.skuName}"`,
        `"${row.triggeredBy || ""}"`,
        row.totalCogs.toFixed(4),
        (row.grossMargin * 100).toFixed(2),
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kostr-activity-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Activity Feed</h1>
          <p className="text-muted-foreground">All cost and margin events across all SKUs</p>
        </div>
        <Button variant="outline" onClick={exportCsv}>
          <Download className="w-4 h-4 mr-2" /> Export CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground whitespace-nowrap">From</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground whitespace-nowrap">To</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
            </div>
            <Select value={triggerType} onValueChange={(v) => setTriggerType(v as TriggerType)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Events</SelectItem>
                <SelectItem value="ingredient_cost">Ingredient Cost</SelectItem>
                <SelectItem value="sell_price">Sell Price</SelectItem>
                <SelectItem value="cost_line">BOM Change</SelectItem>
                <SelectItem value="sku_created">SKU Created</SelectItem>
              </SelectContent>
            </Select>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Grouping</SelectItem>
                <SelectItem value="day">Group by Day</SelectItem>
                <SelectItem value="week">Group by Week</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto text-sm text-muted-foreground self-center">
              {filteredRows.length} event{filteredRows.length !== 1 ? "s" : ""}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {isLoading ? (
          <Card>
            <CardContent className="p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </CardContent>
          </Card>
        ) : filteredRows.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              No events found for the selected filters.
            </CardContent>
          </Card>
        ) : (
          grouped.map((group) => (
            <Card key={group.key ?? "all"}>
              {group.label && (
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{group.label}</CardTitle>
                </CardHeader>
              )}
              <CardContent className={group.label ? "pt-0" : "pt-4"}>
                <div className="divide-y">
                  {group.rows.map((row) => {
                    const trigger = triggerInfo(row.triggeredBy);
                    const cogsChange = row.prevTotalCogs !== null ? row.totalCogs - row.prevTotalCogs : null;
                    const marginChange = row.prevGrossMargin !== null ? row.grossMargin - row.prevGrossMargin : null;
                    return (
                      <div
                        key={row.id}
                        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-3 cursor-pointer hover:bg-muted/40 px-1 rounded transition-colors"
                        onClick={() => setLocation(`/skus/${row.skuId}`)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="min-w-[90px] text-sm text-muted-foreground">{formatDate(row.snapshotDate)}</div>
                          <div>
                            <div className="font-medium text-sm">
                              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded mr-2">{row.skuCode}</span>
                              {row.skuName}
                            </div>
                            <span className={`inline-block mt-1 text-xs px-1.5 py-0.5 rounded font-medium ${trigger.className}`}>{trigger.label}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 ml-auto text-right">
                          <div>
                            <div className="text-xs text-muted-foreground">COGS</div>
                            <div className="text-sm font-medium">{formatCurrency(row.totalCogs)}</div>
                            {cogsChange !== null && (
                              <div className={`text-xs flex items-center justify-end gap-0.5 ${cogsChange > 0 ? "text-red-600" : cogsChange < 0 ? "text-green-600" : "text-muted-foreground"}`}>
                                {cogsChange > 0 ? <ArrowUp className="w-2.5 h-2.5" /> : cogsChange < 0 ? <ArrowDown className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
                                {cogsChange > 0 ? "+" : ""}{formatCurrency(cogsChange)}
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Margin</div>
                            <div className="text-sm font-medium">{formatPercent(row.grossMargin)}</div>
                            {marginChange !== null && (
                              <div className={`text-xs flex items-center justify-end gap-0.5 ${marginChange > 0 ? "text-green-600" : marginChange < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                                {marginChange > 0 ? <ArrowUp className="w-2.5 h-2.5" /> : marginChange < 0 ? <ArrowDown className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
                                {marginChange > 0 ? "+" : ""}{(marginChange * 100).toFixed(1)}pp
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
