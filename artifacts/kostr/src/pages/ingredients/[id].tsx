import { useParams } from "wouter";
import { useGetIngredient, useGetIngredientPriceHistory } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function IngredientDetail({ id }: { id: string }) {
  const ingredientId = parseInt(id, 10);
  
  const { data: ingredient, isLoading: loadingIng } = useGetIngredient(ingredientId, {
    query: { enabled: !isNaN(ingredientId) }
  });
  
  const { data: history, isLoading: loadingHist } = useGetIngredientPriceHistory(ingredientId, {
    query: { enabled: !isNaN(ingredientId) }
  });

  if (loadingIng) {
    return <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-40 w-full" />
    </div>;
  }

  if (!ingredient) {
    return <div>Ingredient not found</div>;
  }

  // Format history for chart
  const chartData = history ? [...history].reverse().map(h => ({
    date: formatDate(h.effectiveDate),
    price: h.price,
    fullDate: h.effectiveDate
  })) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{ingredient.name}</h1>
        <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
          <span>Category: <strong className="text-foreground">{ingredient.category}</strong></span>
          <span>Unit: <strong className="text-foreground">{ingredient.unit}</strong></span>
          {ingredient.supplier && <span>Supplier: <strong className="text-foreground">{ingredient.supplier}</strong></span>}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Current Price</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">
              {formatCurrency(ingredient.currentPrice)} <span className="text-base font-normal text-muted-foreground">/ {ingredient.unit}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Effective since {formatDate(ingredient.priceEffectiveDate)}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Exposure</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{ingredient.skuCount}</div>
            <p className="text-xs text-muted-foreground mt-1">SKUs using this ingredient</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Price History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] mb-6">
            {loadingHist ? <Skeleton className="h-full w-full" /> : (
              chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(v) => `$${v}`} fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip 
                      formatter={(value: number) => [formatCurrency(value), 'Price']}
                      labelFormatter={(label) => label}
                    />
                    <Line type="stepAfter" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">No price history available</div>
              )
            )}
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Effective Date</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingHist ? (
                  <TableRow><TableCell colSpan={3}><Skeleton className="h-8 w-full"/></TableCell></TableRow>
                ) : history?.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-4">No history recorded.</TableCell></TableRow>
                ) : (
                  history?.map(h => (
                    <TableRow key={h.id}>
                      <TableCell>{formatDate(h.effectiveDate)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(h.price)}</TableCell>
                      <TableCell className="text-muted-foreground">{h.reason || "—"}</TableCell>
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
