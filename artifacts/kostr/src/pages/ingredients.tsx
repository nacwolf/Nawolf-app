import { useState } from "react";
import { useListIngredients, useCreateIngredient, useUpdateIngredientPrice, getListIngredientsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Search, Plus, TrendingUp, History } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";

const newIngredientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  unit: z.string().min(1, "Unit is required"),
  supplier: z.string().optional(),
  initialPrice: z.coerce.number().min(0).optional(),
});

const updatePriceSchema = z.object({
  price: z.coerce.number().min(0, "Price must be >= 0"),
  effectiveDate: z.string(),
  reason: z.string().optional(),
});

export default function IngredientsList() {
  const { data: ingredients, isLoading } = useListIngredients();
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const createIngredient = useCreateIngredient();
  const updatePrice = useUpdateIngredientPrice();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const createForm = useForm<z.infer<typeof newIngredientSchema>>({
    resolver: zodResolver(newIngredientSchema),
    defaultValues: { name: "", category: "", unit: "", supplier: "", initialPrice: 0 }
  });

  const priceForm = useForm<z.infer<typeof updatePriceSchema>>({
    resolver: zodResolver(updatePriceSchema),
    defaultValues: { price: 0, effectiveDate: new Date().toISOString().split('T')[0], reason: "" }
  });

  const filteredIngredients = ingredients?.filter(ing => 
    ing.name.toLowerCase().includes(search.toLowerCase()) || 
    ing.category.toLowerCase().includes(search.toLowerCase())
  ) || [];

  async function onCreateSubmit(data: z.infer<typeof newIngredientSchema>) {
    try {
      await createIngredient.mutateAsync({ 
        data: {
          ...data,
          supplier: data.supplier || null,
          initialPrice: data.initialPrice || null
        } 
      });
      toast({ title: "Ingredient created" });
      setIsCreateOpen(false);
      createForm.reset();
      queryClient.invalidateQueries({ queryKey: getListIngredientsQueryKey() });
    } catch (e) {
      toast({ variant: "destructive", title: "Error creating ingredient" });
    }
  }

  async function onPriceSubmit(data: z.infer<typeof updatePriceSchema>) {
    if (!updatingId) return;
    try {
      const res = await updatePrice.mutateAsync({
        id: updatingId,
        data: {
          ...data,
          reason: data.reason || null
        }
      });
      toast({ 
        title: "Price updated", 
        description: `Updated price. ${res.affectedSkuCount} SKUs recalculated.` 
      });
      setUpdatingId(null);
      queryClient.invalidateQueries({ queryKey: getListIngredientsQueryKey() });
    } catch (e) {
      toast({ variant: "destructive", title: "Error updating price" });
    }
  }

  const openPriceUpdate = (ing: any) => {
    setUpdatingId(ing.id);
    priceForm.reset({
      price: ing.currentPrice || 0,
      effectiveDate: new Date().toISOString().split('T')[0],
      reason: ""
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ingredients Library</h1>
          <p className="text-muted-foreground">Manage raw materials and track cost changes.</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Ingredient
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Ingredient</DialogTitle>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                <FormField control={createForm.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={createForm.control} name="category" render={({ field }) => (
                    <FormItem><FormLabel>Category</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>
                  )} />
                  <FormField control={createForm.control} name="unit" render={({ field }) => (
                    <FormItem><FormLabel>Unit (e.g. kg, lb, L)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>
                  )} />
                </div>
                <FormField control={createForm.control} name="supplier" render={({ field }) => (
                  <FormItem><FormLabel>Supplier (Optional)</FormLabel><FormControl><Input {...field} value={field.value || ""}/></FormControl><FormMessage/></FormItem>
                )} />
                <FormField control={createForm.control} name="initialPrice" render={({ field }) => (
                  <FormItem><FormLabel>Initial Price (Optional)</FormLabel><FormControl><Input type="number" step="0.001" {...field} /></FormControl><FormMessage/></FormItem>
                )} />
                <DialogFooter>
                  <Button type="submit" disabled={createIngredient.isPending}>Save</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search ingredients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 max-w-md"
            />
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Current Price</TableHead>
                  <TableHead className="text-right">Last Updated</TableHead>
                  <TableHead className="text-right">Used In</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  ))
                ) : filteredIngredients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No ingredients found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredIngredients.map((ing) => (
                    <TableRow key={ing.id}>
                      <TableCell className="font-medium">
                        <Link href={`/ingredients/${ing.id}`} className="hover:underline text-primary">
                          {ing.name}
                        </Link>
                      </TableCell>
                      <TableCell>{ing.category}</TableCell>
                      <TableCell>{ing.supplier || "—"}</TableCell>
                      <TableCell className="text-right font-medium">
                        {ing.currentPrice ? `${formatCurrency(ing.currentPrice)} / ${ing.unit}` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatDate(ing.priceEffectiveDate)}
                      </TableCell>
                      <TableCell className="text-right">
                        {ing.skuCount} SKUs
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" asChild>
                            <Link href={`/ingredients/${ing.id}`}><History className="h-4 w-4" /></Link>
                          </Button>
                          <Dialog open={updatingId === ing.id} onOpenChange={(open) => !open && setUpdatingId(null)}>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" onClick={() => openPriceUpdate(ing)}>
                                <TrendingUp className="h-4 w-4 mr-2" /> Update Price
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Update Price: {ing.name}</DialogTitle>
                              </DialogHeader>
                              <Form {...priceForm}>
                                <form onSubmit={priceForm.handleSubmit(onPriceSubmit)} className="space-y-4">
                                  <FormField control={priceForm.control} name="price" render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>New Price per {ing.unit}</FormLabel>
                                      <FormControl><Input type="number" step="0.0001" {...field} /></FormControl>
                                      <FormMessage/>
                                    </FormItem>
                                  )} />
                                  <FormField control={priceForm.control} name="effectiveDate" render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Effective Date</FormLabel>
                                      <FormControl><Input type="date" {...field} /></FormControl>
                                      <FormMessage/>
                                    </FormItem>
                                  )} />
                                  <FormField control={priceForm.control} name="reason" render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Reason (Optional)</FormLabel>
                                      <FormControl><Input placeholder="e.g. Supplier increase Q3" {...field} value={field.value || ""}/></FormControl>
                                      <FormMessage/>
                                    </FormItem>
                                  )} />
                                  <DialogFooter>
                                    <Button type="button" variant="ghost" onClick={() => setUpdatingId(null)}>Cancel</Button>
                                    <Button type="submit" disabled={updatePrice.isPending}>Update</Button>
                                  </DialogFooter>
                                </form>
                              </Form>
                            </DialogContent>
                          </Dialog>
                        </div>
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
