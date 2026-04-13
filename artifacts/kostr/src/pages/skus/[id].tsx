import { useState } from "react";
import { useParams } from "wouter";
import { useGetSku, useUpdateSku, useDeleteSku, useAddSkuCostLine, useDeleteSkuCostLine, useListIngredients, getGetSkuQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency, formatPercent, formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Edit2, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";

const editSkuSchema = z.object({
  sellPrice: z.coerce.number().min(0, "Price must be >= 0"),
  name: z.string().min(1),
  customerName: z.string().optional()
});

const addLineSchema = z.object({
  ingredientId: z.coerce.number().min(1, "Required"),
  quantityPerUnit: z.coerce.number().min(0.0001, "Required"),
  notes: z.string().optional()
});

// Colors for Pie Chart
const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function SkuDetail({ id }: { id: string }) {
  const skuId = parseInt(id, 10);
  const qc = useQueryClient();
  const { toast } = useToast();
  
  const { data: sku, isLoading } = useGetSku(skuId, { query: { enabled: !isNaN(skuId) } });
  const { data: ingredients } = useListIngredients();
  
  const updateSku = useUpdateSku();
  const deleteSku = useDeleteSku();
  const addLine = useAddSkuCostLine();
  const deleteLine = useDeleteSkuCostLine();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAddLineOpen, setIsAddLineOpen] = useState(false);

  const editForm = useForm<z.infer<typeof editSkuSchema>>({
    resolver: zodResolver(editSkuSchema),
    values: {
      sellPrice: sku?.sellPrice || 0,
      name: sku?.name || "",
      customerName: sku?.customerName || ""
    }
  });

  const addLineForm = useForm<z.infer<typeof addLineSchema>>({
    resolver: zodResolver(addLineSchema),
    defaultValues: { ingredientId: 0, quantityPerUnit: 1, notes: "" }
  });

  if (isLoading) return <div className="p-8 space-y-6"><Skeleton className="h-12 w-1/3"/><Skeleton className="h-64 w-full"/></div>;
  if (!sku) return <div className="p-8">SKU not found</div>;

  async function onEditSubmit(data: z.infer<typeof editSkuSchema>) {
    try {
      await updateSku.mutateAsync({
        id: skuId,
        data: { ...data, customerName: data.customerName || null }
      });
      setIsEditOpen(false);
      qc.invalidateQueries({ queryKey: getGetSkuQueryKey(skuId) });
      toast({ title: "SKU updated" });
    } catch (e) {
      toast({ variant: "destructive", title: "Error updating SKU" });
    }
  }

  async function onAddLineSubmit(data: z.infer<typeof addLineSchema>) {
    try {
      await addLine.mutateAsync({
        id: skuId,
        data: { ...data, notes: data.notes || null }
      });
      setIsAddLineOpen(false);
      addLineForm.reset();
      qc.invalidateQueries({ queryKey: getGetSkuQueryKey(skuId) });
      toast({ title: "Cost line added" });
    } catch (e) {
      toast({ variant: "destructive", title: "Error adding cost line" });
    }
  }

  async function handleDeleteLine(lineId: number) {
    if (!confirm("Remove this ingredient from the BOM?")) return;
    try {
      await deleteLine.mutateAsync({ id: skuId, costLineId: lineId } as any);
      qc.invalidateQueries({ queryKey: getGetSkuQueryKey(skuId) });
      toast({ title: "Cost line removed" });
    } catch (e) {
      toast({ variant: "destructive", title: "Error removing line" });
    }
  }

  // Chart data preps
  const snapshotData = [...(sku.snapshots || [])].reverse().map(s => ({
    date: formatDate(s.snapshotDate),
    margin: s.grossMargin,
    sellPrice: s.sellPrice,
    cogs: s.totalCogs
  }));

  const pieData = sku.costLines?.map(l => ({
    name: l.ingredientName,
    value: l.lineCost || 0
  })).sort((a,b) => b.value - a.value) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{sku.skuCode}</h1>
            <StatusBadge status={sku.status} />
          </div>
          <p className="text-lg text-muted-foreground mt-1">{sku.name}</p>
          <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
            <span>Category: <strong className="text-foreground">{sku.category}</strong></span>
            <span>Unit Size: <strong className="text-foreground">{sku.unitSize}</strong></span>
            {sku.customerName && <span>Customer: <strong className="text-foreground">{sku.customerName}</strong></span>}
          </div>
        </div>
        
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogTrigger asChild>
            <Button variant="outline"><Edit2 className="w-4 h-4 mr-2" /> Edit Details</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit SKU</DialogTitle></DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
                <FormField control={editForm.control} name="name" render={({field}) => (
                  <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field}/></FormControl></FormItem>
                )}/>
                <FormField control={editForm.control} name="sellPrice" render={({field}) => (
                  <FormItem><FormLabel>Sell Price</FormLabel><FormControl><Input type="number" step="0.01" {...field}/></FormControl></FormItem>
                )}/>
                <FormField control={editForm.control} name="customerName" render={({field}) => (
                  <FormItem><FormLabel>Customer (Optional)</FormLabel><FormControl><Input {...field} value={field.value||""}/></FormControl></FormItem>
                )}/>
                <DialogFooter><Button type="submit" disabled={updateSku.isPending}>Save Changes</Button></DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-primary text-primary-foreground border-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-primary-foreground/80">Sell Price</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatCurrency(sku.sellPrice)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total COGS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatCurrency(sku.totalCogs)}</div>
            {sku.status === 'unknown' && <div className="text-xs text-destructive mt-1 flex items-center"><AlertTriangle className="w-3 h-3 mr-1"/> Missing cost data</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Gross Margin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatPercent(sku.grossMargin)}</div>
            <div className="text-sm text-muted-foreground mt-1">{formatCurrency((sku.sellPrice || 0) - (sku.totalCogs || 0))} absolute</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Margin History</CardTitle>
            <CardDescription>Margin & COGS fluctuations over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {snapshotData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={snapshotData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCogs" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorSell" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v)=>`$${v}`} />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Area type="monotone" dataKey="sellPrice" name="Sell Price" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorSell)" />
                    <Area type="monotone" dataKey="cogs" name="COGS" stroke="hsl(var(--destructive))" fillOpacity={1} fill="url(#colorCogs)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">Not enough history to chart</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cost Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">No cost lines</div>
              )}
            </div>
            <div className="mt-4 space-y-2">
              {pieData.slice(0, 4).map((d, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <div className="flex items-center gap-2 truncate">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                    <span className="truncate" title={d.name}>{d.name}</span>
                  </div>
                  <span className="font-medium whitespace-nowrap ml-2">{formatCurrency(d.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Bill of Materials</CardTitle>
          <Dialog open={isAddLineOpen} onOpenChange={setIsAddLineOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-2"/> Add Ingredient</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Cost Line</DialogTitle></DialogHeader>
              <Form {...addLineForm}>
                <form onSubmit={addLineForm.handleSubmit(onAddLineSubmit)} className="space-y-4">
                  <FormField control={addLineForm.control} name="ingredientId" render={({field}) => (
                    <FormItem>
                      <FormLabel>Ingredient</FormLabel>
                      <Select onValueChange={(v)=>field.onChange(Number(v))} value={field.value?field.value.toString():""}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select..."/></SelectTrigger></FormControl>
                        <SelectContent>
                          {ingredients?.map(i => <SelectItem key={i.id} value={i.id.toString()}>{i.name} ({formatCurrency(i.currentPrice)}/{i.unit})</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage/>
                    </FormItem>
                  )}/>
                  <FormField control={addLineForm.control} name="quantityPerUnit" render={({field}) => (
                    <FormItem><FormLabel>Quantity</FormLabel><FormControl><Input type="number" step="0.0001" {...field}/></FormControl><FormMessage/></FormItem>
                  )}/>
                  <FormField control={addLineForm.control} name="notes" render={({field}) => (
                    <FormItem><FormLabel>Notes (Optional)</FormLabel><FormControl><Input {...field} value={field.value||""}/></FormControl><FormMessage/></FormItem>
                  )}/>
                  <DialogFooter><Button type="submit" disabled={addLine.isPending}>Add Line</Button></DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ingredient</TableHead>
                <TableHead className="text-right">Unit Cost</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Line Cost</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sku.costLines?.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No ingredients added yet.</TableCell></TableRow>
              ) : (
                sku.costLines?.map(line => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <Link href={`/ingredients/${line.ingredientId}`} className="font-medium text-primary hover:underline">{line.ingredientName}</Link>
                      {line.notes && <div className="text-xs text-muted-foreground">{line.notes}</div>}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(line.currentPrice)} / {line.ingredientUnit}</TableCell>
                    <TableCell className="text-right">{line.quantityPerUnit} {line.ingredientUnit}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(line.lineCost)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteLine(line.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-4 h-4"/>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {sku.costLines && sku.costLines.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="font-bold">Total COGS</TableCell>
                  <TableCell className="text-right font-bold text-lg">{formatCurrency(sku.totalCogs)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Event Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {snapshotData.map((s, i) => (
              <div key={i} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                <div>
                  <div className="font-medium text-sm">{s.date}</div>
                  <div className="text-xs text-muted-foreground">Margin updated to {formatPercent(s.margin)}</div>
                </div>
                <div className="text-sm text-right text-muted-foreground">
                  COGS: {formatCurrency(s.cogs)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
