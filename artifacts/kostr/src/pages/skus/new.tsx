import { useState } from "react";
import { useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateSku, useListIngredients } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";

const skuFormSchema = z.object({
  skuCode: z.string().min(1, "SKU Code is required"),
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  unitSize: z.string().min(1, "Unit Size is required"),
  sellPrice: z.coerce.number().min(0, "Price must be >= 0"),
  customerName: z.string().optional(),
  costLines: z.array(z.object({
    ingredientId: z.coerce.number().min(1, "Select an ingredient"),
    quantityPerUnit: z.coerce.number().min(0.0001, "Quantity must be > 0"),
    notes: z.string().optional()
  })).optional()
});

type SkuFormValues = z.infer<typeof skuFormSchema>;

export default function SkuNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: ingredients } = useListIngredients();
  const createSku = useCreateSku();

  const form = useForm<SkuFormValues>({
    resolver: zodResolver(skuFormSchema),
    defaultValues: {
      skuCode: "",
      name: "",
      category: "",
      unitSize: "",
      sellPrice: 0,
      customerName: "",
      costLines: []
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "costLines"
  });

  async function onSubmit(data: SkuFormValues) {
    try {
      const payload = {
        ...data,
        customerName: data.customerName || null,
        costLines: data.costLines?.map(line => ({
          ...line,
          notes: line.notes || null
        }))
      };
      
      const res = await createSku.mutateAsync({ data: payload });
      toast({
        title: "SKU Created",
        description: `${res.skuCode} has been created successfully.`,
      });
      setLocation(`/skus/${res.id}`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create SKU. Please check your inputs.",
      });
    }
  }

  // Calculate live estimated COGS based on current form values
  const watchCostLines = form.watch("costLines");
  const watchSellPrice = form.watch("sellPrice");
  
  const estimatedCogs = watchCostLines?.reduce((total, line) => {
    if (!line.ingredientId || !line.quantityPerUnit || !ingredients) return total;
    const ingredient = ingredients.find(i => i.id === line.ingredientId);
    if (!ingredient || !ingredient.currentPrice) return total;
    return total + (ingredient.currentPrice * line.quantityPerUnit);
  }, 0) || 0;

  const estimatedMargin = watchSellPrice > 0 ? ((watchSellPrice - estimatedCogs) / watchSellPrice) : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Build New SKU</h1>
        <p className="text-muted-foreground">Define your product and its component costs.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="skuCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU Code</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. FG-1001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Organic Almond Butter 16oz" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Nut Butters" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="unitSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit Size</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 16 oz jar" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sellPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sell Price ($)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="customerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="If specific to a customer" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Bill of Materials (BOM)</CardTitle>
                <div className="text-right text-sm">
                  <div className="text-muted-foreground">Estimated COGS</div>
                  <div className="font-bold text-lg">{formatCurrency(estimatedCogs)}</div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex flex-col sm:flex-row gap-4 items-start sm:items-end bg-muted/50 p-4 rounded-lg border">
                    <FormField
                      control={form.control}
                      name={`costLines.${index}.ingredientId`}
                      render={({ field }) => (
                        <FormItem className="flex-1 w-full">
                          <FormLabel>Ingredient</FormLabel>
                          <Select 
                            onValueChange={(val) => field.onChange(Number(val))} 
                            value={field.value ? field.value.toString() : ""}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select ingredient" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {ingredients?.map(ing => (
                                <SelectItem key={ing.id} value={ing.id.toString()}>
                                  {ing.name} ({formatCurrency(ing.currentPrice)}/{ing.unit})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name={`costLines.${index}.quantityPerUnit`}
                      render={({ field }) => (
                        <FormItem className="w-full sm:w-32">
                          <FormLabel>Qty</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.001" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name={`costLines.${index}.notes`}
                      render={({ field }) => (
                        <FormItem className="flex-1 w-full">
                          <FormLabel>Notes (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. 5% waste factor" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button 
                      type="button" 
                      variant="destructive" 
                      size="icon" 
                      onClick={() => remove(index)}
                      className="mt-6 sm:mt-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => append({ ingredientId: 0, quantityPerUnit: 1, notes: "" })}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Ingredient
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Sell Price</div>
                <div className="font-medium">{formatCurrency(watchSellPrice)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Est. Margin</div>
                <div className={`font-bold ${estimatedMargin > 0.25 ? 'text-success' : estimatedMargin > 0.1 ? 'text-warning' : 'text-destructive'}`}>
                  {formatCurrency(watchSellPrice - estimatedCogs)} ({formatPercent(estimatedMargin * 100)})
                </div>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setLocation("/skus")}>Cancel</Button>
              <Button type="submit" disabled={createSku.isPending}>
                {createSku.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create SKU
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
