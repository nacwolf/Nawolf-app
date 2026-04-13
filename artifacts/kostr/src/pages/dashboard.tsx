import { useGetDashboardSummary, useGetMarginTrends, useListSkus } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/format";
import { AreaChart, Area, XChart, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, XAxis } from "recharts";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: trends, isLoading: loadingTrends } = useGetMarginTrends();
  const { data: skus, isLoading: loadingSkus } = useListSkus();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Margin</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold">{formatPercent(summary?.avgMargin)}</div>
            )}
            <p className="text-xs text-muted-foreground">Across all SKUs</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total SKUs</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-2xl font-bold">{summary?.totalSkus || 0}</div>
            )}
            <div className="flex gap-2 text-xs mt-1">
              <span className="text-success font-medium">{summary?.healthyCount || 0} Healthy</span>
              <span className="text-warning font-medium">{summary?.reviewCount || 0} Review</span>
              <span className="text-destructive font-medium">{summary?.criticalCount || 0} Critical</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingredients</CardTitle>
          </CardHeader>
          <CardContent>
             {loadingSummary ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-2xl font-bold">{summary?.totalIngredients || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Active in library</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Price Changes</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-2xl font-bold">{summary?.recentPriceChanges || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">In the last 30 days</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Margin Trends</CardTitle>
            <CardDescription>Average margin over time</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {loadingTrends ? (
              <Skeleton className="h-full w-full" />
            ) : trends && trends.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorMargin" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} 
                    fontSize={12} 
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    tickFormatter={(v) => `${v}%`} 
                    fontSize={12} 
                    tickLine={false}
                    axisLine={false}
                  />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <Tooltip 
                    formatter={(value: number) => [`${value.toFixed(1)}%`, 'Avg Margin']}
                    labelFormatter={(label) => new Date(label).toLocaleDateString()}
                  />
                  <Area type="monotone" dataKey="avgMargin" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorMargin)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">No trend data available</div>
            )}
          </CardContent>
        </Card>
        
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent SKUs</CardTitle>
            <CardDescription>Latest margin status</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingSkus ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : skus && skus.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Margin</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {skus.slice(0, 5).map(sku => (
                      <TableRow key={sku.id}>
                        <TableCell>
                          <Link href={`/skus/${sku.id}`} className="font-medium hover:underline text-primary">
                            {sku.skuCode}
                          </Link>
                          <div className="text-xs text-muted-foreground truncate max-w-[150px]">{sku.name}</div>
                        </TableCell>
                        <TableCell>{formatPercent(sku.grossMargin)}</TableCell>
                        <TableCell><StatusBadge status={sku.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">No SKUs found</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
