import { useState, useMemo, useRef } from "react";
import { useGetSku, useUpdateSku, useDeleteSkuCostLine, useListIngredients, getGetSkuQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency, formatPercent, formatDate, formatDateShort } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, ReferenceLine, Legend } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Pencil, AlertTriangle, ArrowDown, ArrowUp, Search, Check, Users, Calculator, Loader2, Info, ChevronDown, ChevronUp, FileText, ImagePlus, X, Upload, Save, GripVertical, Printer } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { getApiUrl } from "@/lib/queryClient";
import { PhotoUpload } from "@/components/photo-upload";

const BOM_CATEGORIES = [
  "Raw Materials",
  "Packaging",
] as const;

const SECONDARY_CATEGORIES = [
  "Overhead",
  "Quality & Compliance",
  "Delivery",
] as const;

const CATEGORIES = [...BOM_CATEGORIES, ...SECONDARY_CATEGORIES] as const;

const CATEGORY_COLORS: Record<string, string> = {
  "Raw Materials": "#22c55e",
  "Packaging": "#a855f7",
  "Overhead": "#94a3b8",
  "Quality & Compliance": "#3b82f6",
  "Delivery": "#f59e0b",
};

const CATEGORY_BORDER: Record<string, string> = {
  "Raw Materials": "border-l-green-500",
  "Packaging": "border-l-purple-500",
  "Overhead": "border-l-slate-400",
  "Quality & Compliance": "border-l-blue-500",
  "Delivery": "border-l-amber-500",
};

const CATEGORY_HEADER_BG: Record<string, string> = {
  "Raw Materials": "bg-green-50",
  "Packaging": "bg-purple-50",
  "Overhead": "bg-slate-50",
  "Quality & Compliance": "bg-blue-50",
  "Delivery": "bg-amber-50",
};

const CATEGORY_TEXT: Record<string, string> = {
  "Raw Materials": "text-green-700",
  "Packaging": "text-purple-700",
  "Overhead": "text-slate-600",
  "Quality & Compliance": "text-blue-700",
  "Delivery": "text-amber-700",
};

const CATEGORY_BG: Record<string, string> = {
  "Raw Materials": "bg-green-100 text-green-800",
  "Packaging": "bg-purple-100 text-purple-800",
  "Overhead": "bg-slate-100 text-slate-700",
  "Quality & Compliance": "bg-blue-100 text-blue-800",
  "Delivery": "bg-amber-100 text-amber-800",
};

const editPriceSchema = z.object({
  sellPrice: z.coerce.number().min(0.01, "Price must be > 0"),
});

const lineSchema = z.object({
  itemId: z.coerce.number().min(1, "Select an item"),
  displayQty: z.coerce.number().min(0.000001, "Must be > 0"),
  notes: z.string().optional(),
});

type TimePeriod = "3M" | "6M" | "12M" | "All";
type DisplayUnit = "kg" | "g";

interface EditingLine {
  id: number;
  ingredientId: number | null;
  packagingItemId: number | null;
  quantityPerUnit: number;
  notes: string | null;
  ingredientUnit: string;
  itemType: "ingredient" | "packaging";
}

function triggerLabel(triggeredBy: string | null): { label: string; className: string } {
  if (!triggeredBy) return { label: "Unknown", className: "bg-gray-100 text-gray-700" };
  if (triggeredBy.startsWith("price_update")) return { label: "Ingredient Cost", className: "bg-orange-100 text-orange-800" };
  if (triggeredBy === "sell_price_updated") return { label: "Sell Price", className: "bg-purple-100 text-purple-800" };
  if (triggeredBy.startsWith("cost_line")) return { label: "BOM Change", className: "bg-blue-100 text-blue-800" };
  if (triggeredBy === "sku_created") return { label: "SKU Created", className: "bg-green-100 text-green-800" };
  return { label: triggeredBy, className: "bg-gray-100 text-gray-700" };
}

function formatQty(qty: number, unit: string): string {
  if (unit === "kg" && qty < 1) {
    const g = qty * 1000;
    return `${g % 1 === 0 ? g : g.toFixed(1)} g`;
  }
  const rounded = parseFloat(qty.toFixed(4));
  return `${rounded} ${unit}`;
}

function initDisplayUnit(qty: number, unit: string): DisplayUnit {
  return unit === "kg" && qty < 1 ? "g" : "kg";
}

function toDisplayQty(storedQty: number, unit: string, displayUnit: DisplayUnit): number {
  if (unit === "kg" && displayUnit === "g") return parseFloat((storedQty * 1000).toFixed(4));
  return storedQty;
}

function toStoredQty(displayQty: number, unit: string, displayUnit: DisplayUnit): number {
  if (unit === "kg" && displayUnit === "g") return displayQty / 1000;
  return displayQty;
}

interface ItemPickerProps {
  items: any[];
  selectedId: number;
  selectedType: "ingredient" | "packaging";
  onSelect: (item: any) => void;
}

function IngredientPicker({ items, selectedId, selectedType, onSelect }: ItemPickerProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.supplier || "").toLowerCase().includes(q) ||
      (i.category || "").toLowerCase().includes(q)
    );
  }, [items, search]);

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const cat of CATEGORIES) {
      const catItems = filtered.filter((i: any) => i.category === cat);
      if (catItems.length) map[cat] = catItems;
    }
    const other = filtered.filter((i: any) => !CATEGORIES.includes(i.category as any));
    if (other.length) map["Other"] = other;
    return map;
  }, [filtered]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-8 h-9"
          placeholder="Search ingredients & packaging..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus={false}
        />
      </div>
      <div className="h-56 overflow-y-auto border rounded-md">
        {Object.entries(grouped).length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No results</div>
        ) : Object.entries(grouped).map(([cat, catItems]) => (
          <div key={cat}>
            <div className="sticky top-0 z-10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted border-b">
              {cat}
            </div>
            {catItems.map((item: any) => {
              const isSelected = selectedId === item.id && selectedType === item._type;
              return (
                <button
                  key={`${item._type}-${item.id}`}
                  type="button"
                  onClick={() => onSelect(item)}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 hover:bg-accent transition-colors ${isSelected ? "bg-primary/8" : ""}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {isSelected && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                      <span className={`text-sm font-medium truncate ${isSelected ? "text-primary" : ""}`}>{item.name}</span>
                    </div>
                    {item.supplier && (
                      <div className="text-xs text-muted-foreground truncate pl-5">{item.supplier}</div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                    {item.currentPrice != null ? formatCurrency(item.currentPrice) : "—"}/{item.unit}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function SortableIngredientRow({ id, row, idx, onChange, onRemove }: {
  id: string;
  row: { name: string; percentage: number };
  idx: number;
  onChange: (idx: number, field: "name" | "percentage", value: string) => void;
  onRemove: (idx: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex gap-2 items-center">
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground flex-shrink-0 touch-none"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <Input
        className="flex-1"
        placeholder="ชื่อไทย / English name"
        value={row.name}
        onChange={e => onChange(idx, "name", e.target.value)}
      />
      <div className="flex items-center gap-1 w-24 flex-shrink-0">
        <Input
          type="number"
          min={0}
          max={100}
          step={0.1}
          placeholder="%"
          value={row.percentage === 0 && row.name === "" ? "" : row.percentage}
          onChange={e => onChange(idx, "percentage", e.target.value)}
          className="text-right"
        />
        <span className="text-sm text-muted-foreground">%</span>
      </div>
      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive flex-shrink-0" onClick={() => onRemove(idx)}>
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

export default function SkuDetail({ id }: { id: string }) {
  const skuId = parseInt(id, 10);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: sku, isLoading } = useGetSku(skuId, { query: { enabled: !isNaN(skuId) } });
  const { data: ingredients } = useListIngredients();

  const { data: packagingItems } = useQuery<any[]>({
    queryKey: ["/api/packaging"],
    queryFn: async () => {
      const r = await fetch(getApiUrl("/packaging"));
      if (!r.ok) throw new Error();
      return r.json();
    },
  });

  const updateSku = useUpdateSku();
  const deleteLine = useDeleteSkuCostLine();

  const [isEditPriceOpen, setIsEditPriceOpen] = useState(false);
  const [isAddLineOpen, setIsAddLineOpen] = useState(false);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("All");
  const [editingLine, setEditingLine] = useState<EditingLine | null>(null);
  const [addDisplayUnit, setAddDisplayUnit] = useState<DisplayUnit>("kg");
  const [editDisplayUnit, setEditDisplayUnit] = useState<DisplayUnit>("kg");
  const [addItemType, setAddItemType] = useState<"ingredient" | "packaging">("ingredient");
  const [editItemType, setEditItemType] = useState<"ingredient" | "packaging">("ingredient");
  const [isSavingLine, setIsSavingLine] = useState(false);
  const [addNumBlocks, setAddNumBlocks] = useState("");
  const [addMoq, setAddMoq] = useState("");
  const [editNumBlocks, setEditNumBlocks] = useState("");
  const [editMoq, setEditMoq] = useState("");
  const [isSavingProd, setIsSavingProd] = useState(false);
  const [prodUnitsPerDay, setProdUnitsPerDay] = useState<string>("");
  const [prodCartonSize, setProdCartonSize] = useState<string>("1");
  const [prodShiftHours, setProdShiftHours] = useState<string>("8");
  const [prodDaysPerMonth, setProdDaysPerMonth] = useState<string>("20");
  const [prodExcludedMemberIds, setProdExcludedMemberIds] = useState<number[]>([]);
  const [prodSectionOpen, setProdSectionOpen] = useState(false);
  const [prodInitialized, setProdInitialized] = useState(false);
  const [prodDirty, setProdDirty] = useState(false);
  const [changeReason, setChangeReason] = useState<string>("");
  const [changeNote, setChangeNote] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [prodKwhPerUnit, setProdKwhPerUnit] = useState("");
  const [prodLitersPerUnit, setProdLitersPerUnit] = useState("");
  const [showAdvancedProd, setShowAdvancedProd] = useState(false);

  // ── New spec sections ──
  const [specOpen, setSpecOpen] = useState<Record<string, boolean>>({ II: false, III: false, IV: false, V: false, VI: false, VII: false });
  const toggleSpec = (s: string) => setSpecOpen(p => ({ ...p, [s]: !p[s] }));

  // Spec II edit state
  const [editingSpec, setEditingSpec] = useState<string | null>(null);
  const [specDraft, setSpecDraft] = useState<Record<string, any>>({});
  const [savingSpec, setSavingSpec] = useState(false);

  // Drag-to-reorder sensors for ingredient list
  const ingredientSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function startEditSpec(section: string) {
    const s = sku as any;
    const base: Record<string, any> = {};
    if (section === "II") {
      Object.assign(base, {
        unitSize: s?.unitSize ?? "", netWeight: s?.netWeight ?? "", netWeightUnit: s?.netWeightUnit ?? "g",
        grossWeight: s?.grossWeight ?? "", grossWeightUnit: s?.grossWeightUnit ?? "g",
        unitsPerCarton: s?.unitsPerCarton ?? "", cartonGrossWeight: s?.cartonGrossWeight ?? "",
        cartonGrossWeightUnit: s?.cartonGrossWeightUnit ?? "kg",
        cartonDimL: s?.cartonDimL ?? "", cartonDimW: s?.cartonDimW ?? "", cartonDimH: s?.cartonDimH ?? "",
        shelfLife: s?.shelfLife ?? "", shelfLifeUnit: s?.shelfLifeUnit ?? "days",
        storageCondition: s?.storageCondition ?? "",
      });
    } else if (section === "III") {
      Object.assign(base, {
        exFactoryPrice: s?.exFactoryPrice ?? "", fobPrice: s?.fobPrice ?? "",
        moq: s?.moq ?? "", moqUnit: s?.moqUnit ?? "units",
      });
    } else if (section === "IV") {
      Object.assign(base, {
        fdaNumber: s?.fdaNumber ?? "", barcodeEan13: s?.barcodeEan13 ?? "",
        halalCertified: !!s?.halalCertified, gmpCertified: !!s?.gmpCertified,
        haccpCertified: !!s?.haccpCertified, organicCertified: !!s?.organicCertified,
        otherCertifications: s?.otherCertifications ?? "",
      });
    } else if (section === "V") {
      Object.assign(base, {
        productDescription: s?.productDescription ?? "",
        fdaNumber: s?.fdaNumber ?? "",
        barcodeEan13: s?.barcodeEan13 ?? "",
      });
    } else if (section === "VI") {
      Object.assign(base, {
        ingredientLines: Array.isArray(s?.ingredientLines) && s.ingredientLines.length > 0
          ? s.ingredientLines.map((r: any) => ({ name: r.name ?? "", percentage: r.percentage ?? 0 }))
          : [],
        allergenInfo: s?.allergenInfo ?? "",
      });
    } else if (section === "VII") {
      Object.assign(base, {
        nutritionalInfo: s?.nutritionalInfo ?? "",
      });
    }
    setSpecDraft(base);
    setEditingSpec(section);
  }

  async function saveSpec(section: string) {
    setSavingSpec(true);
    try {
      const patch: Record<string, any> = {};
      const d = specDraft;
      if (section === "II") {
        patch.unitSize = d.unitSize || null;
        patch.netWeight = d.netWeight !== "" ? parseFloat(d.netWeight) : null;
        patch.netWeightUnit = d.netWeightUnit || null;
        patch.grossWeight = d.grossWeight !== "" ? parseFloat(d.grossWeight) : null;
        patch.grossWeightUnit = d.grossWeightUnit || null;
        patch.unitsPerCarton = d.unitsPerCarton !== "" ? parseInt(d.unitsPerCarton, 10) : null;
        patch.cartonGrossWeight = d.cartonGrossWeight !== "" ? parseFloat(d.cartonGrossWeight) : null;
        patch.cartonGrossWeightUnit = d.cartonGrossWeightUnit || null;
        patch.cartonDimL = d.cartonDimL !== "" ? parseFloat(d.cartonDimL) : null;
        patch.cartonDimW = d.cartonDimW !== "" ? parseFloat(d.cartonDimW) : null;
        patch.cartonDimH = d.cartonDimH !== "" ? parseFloat(d.cartonDimH) : null;
        patch.shelfLife = d.shelfLife !== "" ? parseInt(d.shelfLife, 10) : null;
        patch.shelfLifeUnit = d.shelfLifeUnit || null;
        patch.storageCondition = d.storageCondition || null;
      } else if (section === "III") {
        patch.exFactoryPrice = d.exFactoryPrice !== "" ? parseFloat(d.exFactoryPrice) : null;
        patch.fobPrice = d.fobPrice !== "" ? parseFloat(d.fobPrice) : null;
        patch.moq = d.moq !== "" ? parseInt(d.moq, 10) : null;
        patch.moqUnit = d.moqUnit || null;
      } else if (section === "IV") {
        patch.fdaNumber = d.fdaNumber || null;
        patch.barcodeEan13 = d.barcodeEan13 || null;
        patch.halalCertified = !!d.halalCertified;
        patch.gmpCertified = !!d.gmpCertified;
        patch.haccpCertified = !!d.haccpCertified;
        patch.organicCertified = !!d.organicCertified;
        patch.otherCertifications = d.otherCertifications || null;
      } else if (section === "V") {
        patch.productDescription = d.productDescription || null;
        patch.fdaNumber = d.fdaNumber || null;
        patch.barcodeEan13 = d.barcodeEan13 || null;
      } else if (section === "VI") {
        patch.ingredientLines = Array.isArray(d.ingredientLines) && d.ingredientLines.length > 0 ? d.ingredientLines : null;
        patch.allergenInfo = d.allergenInfo || null;
      } else if (section === "VII") {
        patch.nutritionalInfo = d.nutritionalInfo || null;
      }
      await updateSku.mutateAsync({ id: skuId, data: patch });
      qc.invalidateQueries({ queryKey: getGetSkuQueryKey(skuId) });
      setEditingSpec(null);
      toast({ title: "Saved" });
    } catch {
      toast({ variant: "destructive", title: "Save failed" });
    } finally {
      setSavingSpec(false);
    }
  }

  // File upload helpers for detail page
  const labelRef = useRef<HTMLInputElement>(null);
  const specRef = useRef<HTMLInputElement>(null);
  const dielineRef = useRef<HTMLInputElement>(null);
  const prodPhotosRef = useRef<HTMLInputElement>(null);
  const certsRef = useRef<HTMLInputElement>(null);
  const nutritionDocRef = useRef<HTMLInputElement>(null);
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);

  async function uploadSingleFile(file: File, endpoint: string, method: "PATCH" | "POST" = "PATCH") {
    setUploadingFile(endpoint);
    try {
      const urlRes = await fetch(getApiUrl("/storage/uploads/request-url"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();
      const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      if (!putRes.ok) throw new Error("Upload failed");
      await fetch(getApiUrl(endpoint), {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectPath, contentType: file.type, fileName: file.name }),
      });
      qc.invalidateQueries({ queryKey: getGetSkuQueryKey(skuId) });
      toast({ title: "File uploaded" });
    } catch (err) {
      toast({ variant: "destructive", title: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      setUploadingFile(null);
    }
  }

  async function deleteFile(endpoint: string) {
    try {
      await fetch(getApiUrl(endpoint), { method: "DELETE" });
      qc.invalidateQueries({ queryKey: getGetSkuQueryKey(skuId) });
      toast({ title: "File removed" });
    } catch {
      toast({ variant: "destructive", title: "Failed to remove file" });
    }
  }

  const ingMap = useMemo(() => {
    if (!ingredients) return {} as Record<number, any>;
    return Object.fromEntries(ingredients.map((i: any) => [i.id, i])) as Record<number, any>;
  }, [ingredients]);

  const pkgMap = useMemo(() => {
    if (!packagingItems) return {} as Record<number, any>;
    return Object.fromEntries(packagingItems.map((p: any) => [p.id, p])) as Record<number, any>;
  }, [packagingItems]);

  const priceForm = useForm<z.infer<typeof editPriceSchema>>({
    resolver: zodResolver(editPriceSchema),
    values: { sellPrice: sku?.sellPrice || 0 }
  });

  const addLineForm = useForm<z.infer<typeof lineSchema>>({
    resolver: zodResolver(lineSchema),
    defaultValues: { itemId: 0, displayQty: 1, notes: "" }
  });

  const editLineForm = useForm<z.infer<typeof lineSchema>>({
    resolver: zodResolver(lineSchema),
    defaultValues: { itemId: 0, displayQty: 1, notes: "" }
  });

  const allCostItems = useMemo(() => {
    const ingItems = (ingredients ?? []).map((i: any) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      category: i.category || "Other",
      currentPrice: i.currentPrice,
      supplier: i.supplier,
      _type: "ingredient" as const,
    }));
    const pkgItems = (packagingItems ?? []).map((p: any) => ({
      id: p.id,
      name: p.nameEnglish,
      unit: p.unit,
      category: "Packaging",
      pkgCategory: p.category,
      currentPrice: parseFloat(p.unitCost),
      supplier: p.supplier,
      _type: "packaging" as const,
    }));
    return [...ingItems, ...pkgItems];
  }, [ingredients, packagingItems]);

  const addItemId = addLineForm.watch("itemId");
  const addItem = allCostItems.find(i => i.id === addItemId && i._type === addItemType);
  const editItemId = editLineForm.watch("itemId");
  const editItem = allCostItems.find(i => i.id === editItemId && i._type === editItemType);

  const addIsPrintingBlock = (addItem as any)?.pkgCategory === "printing_block";
  const editIsPrintingBlock = (editItem as any)?.pkgCategory === "printing_block";

  const { data: prodConfig, refetch: refetchProdConfig } = useQuery({
    queryKey: ["production-config", skuId],
    queryFn: async () => {
      const r = await fetch(getApiUrl(`/skus/${skuId}/production-config`));
      return r.json() as Promise<{
        config: any;
        excludedMemberIds: number[];
        allProductionMembers: {
          id: number;
          name: string;
          roleDescription: string | null;
          payType: "hourly" | "monthly";
          hourlyWage: number;
          monthlySalary: number | null;
          oncostPercent: number;
          loadedRate: number;
          excluded: boolean;
        }[];
        operatingDaysPerYear: number;
        daysPerMonth: number;
      }>;
    },
    enabled: !isNaN(skuId),
  });

  useMemo(() => {
    if (!prodInitialized && prodConfig) {
      setProdInitialized(true);
      setProdExcludedMemberIds(prodConfig.excludedMemberIds ?? []);
      if (prodConfig.config) {
        setProdUnitsPerDay(String(prodConfig.config.unitsPerDay ?? ""));
        setProdCartonSize(String(prodConfig.config.cartonSize ?? "1"));
        setProdShiftHours(String(prodConfig.config.shiftHours ?? "8"));
        setProdDaysPerMonth(String(prodConfig.config.productionDaysPerMonth ?? "20"));
        setProdKwhPerUnit((prodConfig.config as any).kwhPerUnit != null ? String((prodConfig.config as any).kwhPerUnit) : "");
        setProdLitersPerUnit((prodConfig.config as any).litersPerUnit != null ? String((prodConfig.config as any).litersPerUnit) : "");
      }
    }
  }, [prodConfig, prodInitialized]);

  const isFirstSave = !prodConfig?.config;
  const hasLaborSetup = prodConfig?.config?.laborCostPerUnit !== null && prodConfig?.config?.laborCostPerUnit !== undefined;
  const hasOverheadSetup = prodConfig?.config?.overheadCostPerUnit !== null && prodConfig?.config?.overheadCostPerUnit !== undefined;
  const hasUtilitiesSetup = (prodConfig?.config as any)?.utilitiesCostPerUnit != null;
  const hasWaterSetup = (prodConfig?.config as any)?.waterCostPerUnit != null;

  async function handleSaveProdConfig() {
    setIsSavingProd(true);
    try {
      const reason = isFirstSave ? "initial" : (changeReason || "");
      if (!isFirstSave && !reason) {
        toast({ variant: "destructive", title: "Please select a change reason" });
        setIsSavingProd(false);
        return;
      }
      await fetch(getApiUrl(`/skus/${skuId}/production-config`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitsPerDay: parseInt(prodUnitsPerDay) || null,
          cartonSize: parseInt(prodCartonSize) || 1,
          shiftHours: parseFloat(prodShiftHours) || 8,
          productionDaysPerMonth: parseInt(prodDaysPerMonth) || 20,
          excludedMemberIds: prodExcludedMemberIds,
          kwhPerUnit: prodKwhPerUnit !== "" ? parseFloat(prodKwhPerUnit) : null,
          litersPerUnit: prodLitersPerUnit !== "" ? parseFloat(prodLitersPerUnit) : null,
          changeReason: reason,
          changeNote: changeNote || null,
        }),
      });
      await refetchProdConfig();
      qc.invalidateQueries({ queryKey: getGetSkuQueryKey(skuId) });
      setProdDirty(false);
      setChangeReason("");
      setChangeNote("");
      toast({ title: "Production setup saved — COGS updated" });
    } catch {
      toast({ variant: "destructive", title: "Error saving production setup" });
    } finally {
      setIsSavingProd(false);
    }
  }

  const allProductionMembers = prodConfig?.allProductionMembers ?? [];

  const previewLaborCost = useMemo(() => {
    const upd = parseInt(prodUnitsPerDay) || 0;
    const cs = parseInt(prodCartonSize) || 1;
    const sh = parseFloat(prodShiftHours) || 8;
    const dpm = parseInt(prodDaysPerMonth) || 20;
    const totalUnits = upd * cs;
    if (allProductionMembers.length === 0 || totalUnits === 0) return null;
    const included = allProductionMembers.filter(m => !prodExcludedMemberIds.includes(m.id));
    if (included.length === 0) return null;
    let total = 0;
    for (const m of included) {
      const oncost = m.oncostPercent / 100;
      if (m.payType === "monthly" && m.monthlySalary != null) {
        total += (m.monthlySalary * (1 + oncost)) / dpm / totalUnits;
      } else {
        total += (m.hourlyWage * (1 + oncost) * sh) / totalUnits;
      }
    }
    return total;
  }, [allProductionMembers, prodExcludedMemberIds, prodUnitsPerDay, prodCartonSize, prodShiftHours, prodDaysPerMonth]);

  const previewMonthlyUnits = useMemo(() => {
    const upd = parseInt(prodUnitsPerDay) || 0;
    const cs = parseInt(prodCartonSize) || 1;
    const dpm = parseInt(prodDaysPerMonth) || 20;
    return upd * cs * dpm;
  }, [prodUnitsPerDay, prodCartonSize, prodDaysPerMonth]);

  const daysPerMonthFactory = prodConfig?.daysPerMonth ?? 20.8;
  const daysPerMonthWarning = parseInt(prodDaysPerMonth) > daysPerMonthFactory;

  const snapshotData = useMemo(() => {
    const all = [...(sku?.snapshots || [])].reverse();
    if (timePeriod === "All") return all;
    const now = new Date();
    const months = timePeriod === "3M" ? 3 : timePeriod === "6M" ? 6 : 12;
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    return all.filter(s => s.snapshotDate >= cutoffStr);
  }, [sku?.snapshots, timePeriod]);

  const chartData = snapshotData.map(s => ({
    date: formatDateShort(s.snapshotDate),
    rawDate: s.snapshotDate,
    margin: s.grossMargin,
    marginPct: Math.round(s.grossMargin * 1000) / 10,
    sellPrice: s.sellPrice,
    cogs: s.totalCogs,
  }));

  const categoryBreakdown = useMemo(() => {
    if (!sku?.costLines) return [];
    const totals: Record<string, number> = {};
    for (const line of sku.costLines) {
      const cat = (line as any).ingredientCategory || "Other";
      if (cat === "Labor") continue;
      totals[cat] = (totals[cat] || 0) + (line.lineCost || 0);
    }
    const result = Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    return result;
  }, [sku?.costLines]);

  const totalCategoryValue = categoryBreakdown.reduce((s, d) => s + d.value, 0);

  const costLinesByCategory = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const cat of BOM_CATEGORIES) map[cat] = [];
    for (const cat of SECONDARY_CATEGORIES) map[cat] = [];
    for (const line of sku?.costLines ?? []) {
      const cat = (line as any).ingredientCategory || "Other";
      if (!map[cat]) map[cat] = [];
      map[cat].push(line);
    }
    return map;
  }, [sku?.costLines]);

  const eventLog = useMemo(() => {
    const snaps = [...(sku?.snapshots || [])];
    return snaps.map((s, idx) => {
      const prev = snaps[idx + 1];
      return {
        ...s,
        prevCogs: prev?.totalCogs ?? null,
        prevMargin: prev?.grossMargin ?? null,
        cogsChange: prev ? s.totalCogs - prev.totalCogs : null,
        marginChange: prev ? s.grossMargin - prev.grossMargin : null,
      };
    });
  }, [sku?.snapshots]);

  if (isLoading) return <div className="p-8 space-y-6"><Skeleton className="h-12 w-1/3" /><Skeleton className="h-64 w-full" /></div>;
  if (!sku) return <div className="p-8">SKU not found</div>;

  const marginEuro = (sku.sellPrice || 0) - (sku.totalCogs || 0);
  const targetPrice30 = sku.totalCogs ? sku.totalCogs / 0.70 : null;

  async function onEditPriceSubmit(data: z.infer<typeof editPriceSchema>) {
    try {
      await updateSku.mutateAsync({ id: skuId, data: { sellPrice: data.sellPrice } });
      setIsEditPriceOpen(false);
      qc.invalidateQueries({ queryKey: getGetSkuQueryKey(skuId) });
      toast({ title: "Sell price updated" });
    } catch {
      toast({ variant: "destructive", title: "Error updating price" });
    }
  }

  async function onAddLineSubmit(data: z.infer<typeof lineSchema>) {
    const itemUnit = addItem?.unit ?? "kg";
    try {
      let payload: any;
      if (addIsPrintingBlock) {
        const nb = parseInt(addNumBlocks, 10);
        const m = parseInt(addMoq, 10);
        if (!nb || !m || nb < 1 || m < 1) {
          toast({ variant: "destructive", title: "Enter valid number of blocks and MOQ" });
          return;
        }
        payload = {
          packagingItemId: data.itemId,
          quantityPerUnit: nb / m,
          notes: `${nb} blocks ÷ ${m.toLocaleString()} unit MOQ`,
        };
      } else {
        const storedQty = addItemType === "ingredient" ? toStoredQty(data.displayQty, itemUnit, addDisplayUnit) : data.displayQty;
        payload = { quantityPerUnit: storedQty, notes: data.notes || null };
        if (addItemType === "ingredient") payload.ingredientId = data.itemId;
        else payload.packagingItemId = data.itemId;
      }
      const res = await fetch(getApiUrl(`/skus/${skuId}/cost-lines`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const newLine = await res.json();
      qc.setQueryData(getGetSkuQueryKey(skuId), (old: any) => {
        if (!old) return old;
        return { ...old, costLines: [...(old.costLines ?? []), newLine] };
      });
      setIsAddLineOpen(false);
      addLineForm.reset();
      setAddDisplayUnit("kg");
      setAddItemType("ingredient");
      setAddNumBlocks("");
      setAddMoq("");
      qc.invalidateQueries({ queryKey: getGetSkuQueryKey(skuId) });
      toast({ title: "Cost line added" });
    } catch {
      toast({ variant: "destructive", title: "Error adding cost line" });
    }
  }

  async function onEditLineSubmit(data: z.infer<typeof lineSchema>) {
    if (!editingLine) return;
    const itemUnit = editItem?.unit ?? editingLine.ingredientUnit;
    setIsSavingLine(true);
    try {
      let payload: any;
      if (editIsPrintingBlock) {
        const nb = parseInt(editNumBlocks, 10);
        const m = parseInt(editMoq, 10);
        if (!nb || !m || nb < 1 || m < 1) {
          toast({ variant: "destructive", title: "Enter valid number of blocks and MOQ" });
          setIsSavingLine(false);
          return;
        }
        payload = {
          packagingItemId: data.itemId,
          quantityPerUnit: nb / m,
          notes: `${nb} blocks ÷ ${m.toLocaleString()} unit MOQ`,
        };
      } else {
        const storedQty = editItemType === "ingredient" ? toStoredQty(data.displayQty, itemUnit, editDisplayUnit) : data.displayQty;
        payload = { quantityPerUnit: storedQty, notes: data.notes || null };
        if (editItemType === "ingredient") payload.ingredientId = data.itemId;
        else payload.packagingItemId = data.itemId;
      }
      const res = await fetch(getApiUrl(`/skus/${skuId}/cost-lines/${editingLine.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const updatedLine = await res.json();
      qc.setQueryData(getGetSkuQueryKey(skuId), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          costLines: (old.costLines ?? []).map((l: any) => l.id === updatedLine.id ? updatedLine : l),
        };
      });
      setEditingLine(null);
      qc.invalidateQueries({ queryKey: getGetSkuQueryKey(skuId) });
      toast({ title: "Cost line updated" });
    } catch {
      toast({ variant: "destructive", title: "Error updating cost line" });
    } finally {
      setIsSavingLine(false);
    }
  }

  async function handleDeleteLine(lineId: number) {
    if (!confirm("Remove this cost line?")) return;
    try {
      await deleteLine.mutateAsync({ id: skuId, costLineId: lineId } as any);
      qc.invalidateQueries({ queryKey: getGetSkuQueryKey(skuId) });
      toast({ title: "Cost line removed" });
    } catch {
      toast({ variant: "destructive", title: "Error removing line" });
    }
  }

  function openEditLine(line: any) {
    const isPackaging = line.packagingItemId != null;
    const itemType: "ingredient" | "packaging" = isPackaging ? "packaging" : "ingredient";
    const itemId = isPackaging ? line.packagingItemId : line.ingredientId;
    const ingUnit = line.ingredientUnit ?? (isPackaging ? "piece" : "kg");
    const isPb = isPackaging && pkgMap[line.packagingItemId]?.category === "printing_block";
    const du: DisplayUnit = (!isPackaging && ingUnit === "kg") ? initDisplayUnit(line.quantityPerUnit, ingUnit) : "kg";
    const dq = (!isPackaging && ingUnit === "kg") ? toDisplayQty(line.quantityPerUnit, ingUnit, du) : line.quantityPerUnit;
    setEditItemType(itemType);
    setEditDisplayUnit(du);
    if (isPb) {
      const match = (line.notes ?? "").match(/^(\d+) blocks ÷ ([\d,]+) unit MOQ$/);
      if (match) {
        setEditNumBlocks(match[1]);
        setEditMoq(match[2].replace(/,/g, ""));
      } else {
        setEditNumBlocks("");
        setEditMoq("");
      }
    } else {
      setEditNumBlocks("");
      setEditMoq("");
    }
    setEditingLine({ id: line.id, ingredientId: line.ingredientId ?? null, packagingItemId: line.packagingItemId ?? null, quantityPerUnit: line.quantityPerUnit, notes: line.notes ?? null, ingredientUnit: ingUnit, itemType });
    editLineForm.reset({ itemId: itemId ?? 0, displayQty: dq, notes: line.notes ?? "" });
  }

  function openAddLineFromCategory() {
    addLineForm.reset({ itemId: 0, displayQty: 1, notes: "" });
    setAddDisplayUnit("kg");
    setAddItemType("ingredient");
    setAddNumBlocks("");
    setAddMoq("");
    setIsAddLineOpen(true);
  }

  const currentEditIngUnit = editItem?.unit ?? editingLine?.ingredientUnit ?? "kg";
  const currentAddIngUnit = addItem?.unit ?? "kg";

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">{sku.name}</h1>
            <StatusBadge status={sku.status} />
          </div>
          <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
            <span className="font-mono bg-muted px-2 py-0.5 rounded text-xs">{sku.skuCode}</span>
            <span>Category: <strong className="text-foreground">{sku.category}</strong></span>
            <span>Unit: <strong className="text-foreground">{sku.unitSize}</strong></span>
            {sku.customerName && <span>Customer: <strong className="text-foreground">{sku.customerName}</strong></span>}
          </div>
        </div>
        <div className="w-full md:w-44 flex-shrink-0">
          <PhotoUpload
            entityType="sku"
            entityId={skuId}
            currentPhotoUrl={(sku as any).photoUrl ?? null}
            currentPhotoContentType={(sku as any).photoContentType ?? null}
            onUpdate={() => qc.invalidateQueries({ queryKey: getGetSkuQueryKey(skuId) })}
          />
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total COGS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(sku.totalCogs)}</div>
            {sku.status === "unknown" && (
              <div className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> No cost data</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-primary text-primary-foreground border-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-primary-foreground/70 uppercase tracking-wide">Sell Price</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{formatCurrency(sku.sellPrice)}</div>
              <Dialog open={isEditPriceOpen} onOpenChange={setIsEditPriceOpen}>
                <DialogTrigger asChild>
                  <button className="text-primary-foreground/60 hover:text-primary-foreground transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Edit Sell Price</DialogTitle></DialogHeader>
                  <Form {...priceForm}>
                    <form onSubmit={priceForm.handleSubmit(onEditPriceSubmit)} className="space-y-4">
                      <FormField control={priceForm.control} name="sellPrice" render={({ field }) => (
                        <FormItem>
                          <FormLabel>New Sell Price (฿)</FormLabel>
                          <FormControl><Input type="number" step="0.01" autoFocus {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => setIsEditPriceOpen(false)}>Cancel</Button>
                        <Button type="submit" disabled={updateSku.isPending}>Save</Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gross Margin %</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercent(sku.grossMargin)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Margin ฿/unit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(marginEuro > 0 ? marginEuro : null)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Target (30%)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(targetPrice30)}</div>
            <p className="text-xs text-muted-foreground mt-1">min sell price</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1 border rounded-lg p-1">
          {(["3M", "6M", "12M", "All"] as TimePeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setTimePeriod(p)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${timePeriod === p ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gross Margin % Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[240px]">
              {chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(v) => `${v}%`} fontSize={11} tickLine={false} axisLine={false} domain={[0, "auto"]} />
                    <RechartsTooltip formatter={(v: number) => [`${v.toFixed(1)}%`, "Margin"]} labelFormatter={(l) => l} />
                    <ReferenceLine y={25} stroke="#22c55e" strokeDasharray="4 4" label={{ value: "25%", position: "insideTopRight", fontSize: 10, fill: "#22c55e" }} />
                    <ReferenceLine y={10} stroke="#f97316" strokeDasharray="4 4" label={{ value: "10%", position: "insideTopRight", fontSize: 10, fill: "#f97316" }} />
                    <Line type="monotone" dataKey="marginPct" name="Margin %" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Not enough data to chart</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">COGS vs Sell Price</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[240px]">
              {chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradMarginBand" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gradCogs" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(v) => `฿${v.toFixed(2)}`} fontSize={11} tickLine={false} axisLine={false} />
                    <RechartsTooltip formatter={(v: number) => [formatCurrency(v)]} />
                    <Area type="monotone" dataKey="sellPrice" name="Sell Price" stroke="hsl(var(--primary))" fill="url(#gradMarginBand)" strokeWidth={2} />
                    <Area type="monotone" dataKey="cogs" name="COGS" stroke="#ef4444" fill="url(#gradCogs)" strokeWidth={2} />
                    <Legend />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Not enough data to chart</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Cost Breakdown by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryBreakdown.length > 0 ? (
              <>
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryBreakdown} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                        {categoryBreakdown.map((entry, index) => (
                          <Cell key={index} fill={CATEGORY_COLORS[entry.name] || "#94a3b8"} />
                        ))}
                      </Pie>
                      <RechartsTooltip formatter={(v: number) => [formatCurrency(v)]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 space-y-2">
                  {categoryBreakdown.map((d) => (
                    <div key={d.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[d.name] || "#94a3b8" }} />
                        <span className="truncate">{d.name}</span>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <span className="text-muted-foreground">{totalCategoryValue > 0 ? Math.round((d.value / totalCategoryValue) * 100) : 0}%</span>
                        <span className="font-medium">{formatCurrency(d.value)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">No cost lines yet</div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Bill of Materials</CardTitle>
              <CardDescription>Cost lines per category</CardDescription>
            </div>
            <Button size="sm" onClick={openAddLineFromCategory}>
              <Plus className="w-4 h-4 mr-1.5" /> Add Cost Line
            </Button>
          </CardHeader>

          <CardContent className="p-0 pb-1">
            {BOM_CATEGORIES.map(cat => {
              const lines = costLinesByCategory[cat] ?? [];
              const catTotal = lines.reduce((s: number, l: any) => s + (l.lineCost || 0), 0);
              return (
                <div key={cat} className={`border-l-4 ${CATEGORY_BORDER[cat]} border-b last:border-b-0`}>
                  <div className={`px-4 py-2 flex items-center justify-between ${CATEGORY_HEADER_BG[cat]}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-bold uppercase tracking-wider ${CATEGORY_TEXT[cat]}`}>{cat}</span>
                      {lines.length > 0 && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{lines.length}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {lines.length > 0 && (
                        <span className="text-xs font-medium text-muted-foreground">{formatCurrency(catTotal)}</span>
                      )}
                      <button
                        onClick={openAddLineFromCategory}
                        className="text-xs text-primary hover:underline flex items-center gap-0.5"
                      >
                        <Plus className="w-3 h-3" /> Add
                      </button>
                    </div>
                  </div>

                  {lines.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="pl-4 text-xs h-8 text-muted-foreground font-medium">Item</TableHead>
                          <TableHead className="text-right text-xs h-8 text-muted-foreground font-medium">Unit Cost</TableHead>
                          <TableHead className="text-right text-xs h-8 text-muted-foreground font-medium">Qty</TableHead>
                          <TableHead className="text-right text-xs h-8 text-muted-foreground font-medium">Line Cost</TableHead>
                          <TableHead className="w-16 h-8" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lines.map((line: any, lineIdx: number) => {
                          const isPrintingBlock = !!line.isPrintingBlock || (line.packagingItemId != null && pkgMap[line.packagingItemId]?.category === "printing_block");
                          const supplier = !isPrintingBlock && line.packagingItemId != null
                            ? pkgMap[line.packagingItemId]?.supplier
                            : !isPrintingBlock && line.ingredientId != null
                            ? ingMap[line.ingredientId]?.supplier
                            : null;
                          return (
                            <TableRow key={line.id ?? `pb-${lineIdx}`} className="group">
                              <TableCell className="pl-4 py-2">
                                <div className="flex items-center gap-1.5">
                                  {isPrintingBlock && <Printer className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />}
                                  <div className="text-sm font-medium">{line.ingredientName}</div>
                                </div>
                                {supplier && (
                                  <div className="text-xs text-muted-foreground">{supplier}</div>
                                )}
                                {line.notes && (
                                  <div className="text-xs text-muted-foreground italic">{line.notes}</div>
                                )}
                              </TableCell>
                              <TableCell className="text-right text-sm text-muted-foreground py-2">
                                {isPrintingBlock
                                  ? <span className="text-purple-600 font-medium">{formatCurrency(line.currentPrice)}/unit</span>
                                  : <>{formatCurrency(line.currentPrice)}/{line.ingredientUnit}</>
                                }
                              </TableCell>
                              <TableCell className="text-right text-sm py-2">
                                {isPrintingBlock ? "—" : formatQty(line.quantityPerUnit, line.ingredientUnit)}
                              </TableCell>
                              <TableCell className="text-right text-sm font-medium py-2">
                                {formatCurrency(line.lineCost)}
                              </TableCell>
                              <TableCell className="py-2 pr-3">
                                {isPrintingBlock ? (
                                  <div className="flex items-center justify-end">
                                    <span className="text-[10px] text-purple-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">amortized</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => openEditLine(line)}
                                      className="p-1 rounded hover:bg-muted transition-colors"
                                      title="Edit"
                                    >
                                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteLine(line.id)}
                                      className="p-1 rounded hover:bg-destructive/10 transition-colors"
                                      title="Remove"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                    </button>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="px-4 py-2.5 text-xs text-muted-foreground italic">No items in this category</div>
                  )}
                </div>
              );
            })}


            {(sku.costLines?.length ?? 0) > 0 && (
              <div className="px-4 py-3 flex items-center justify-between bg-muted/40 border-t mt-0">
                <span className="text-sm font-bold">Total COGS</span>
                <span className="text-lg font-bold">{formatCurrency(sku.totalCogs)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Production Setup ── */}
      <TooltipProvider>
      <Card className="border-l-4 border-l-orange-500">
        <button
          className="w-full px-6 py-4 bg-orange-50 flex items-center justify-between gap-3 rounded-t-xl"
          onClick={() => setProdSectionOpen(o => !o)}
        >
          <div className="flex items-center gap-3">
            <Users className="w-4 h-4 text-orange-600 flex-shrink-0" />
            <div className="text-left">
              <div className="text-sm font-bold uppercase tracking-wider text-orange-700">Production Setup</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {hasLaborSetup || hasOverheadSetup || hasUtilitiesSetup || hasWaterSetup
                  ? [
                      hasLaborSetup ? `Labor ${formatCurrency(prodConfig?.config?.laborCostPerUnit ?? null)}/unit` : null,
                      hasOverheadSetup ? `Overhead ${formatCurrency(prodConfig?.config?.overheadCostPerUnit ?? null)}/unit` : null,
                      hasUtilitiesSetup ? `Utilities ${formatCurrency((prodConfig?.config as any).utilitiesCostPerUnit)}/unit` : null,
                      hasWaterSetup ? `Water ${formatCurrency((prodConfig?.config as any).waterCostPerUnit)}/unit` : null,
                    ].filter(Boolean).join(" · ")
                  : "Set up team and production days to calculate labor & overhead cost"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(hasLaborSetup || hasOverheadSetup || hasUtilitiesSetup || hasWaterSetup) && (
              <Badge className="bg-orange-100 text-orange-800 border-0 text-xs">
                {formatCurrency((prodConfig?.config?.laborCostPerUnit ?? 0) + (prodConfig?.config?.overheadCostPerUnit ?? 0) + ((prodConfig?.config as any)?.utilitiesCostPerUnit ?? 0) + ((prodConfig?.config as any)?.waterCostPerUnit ?? 0))}/unit
              </Badge>
            )}
            {prodSectionOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </button>

        {prodSectionOpen && (
          <CardContent className="pt-5 space-y-5">
            {/* 1. Team Members */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold">1. Who works on this product?</span>
                <Tooltip>
                  <TooltipTrigger type="button"><Info className="w-3.5 h-3.5 text-muted-foreground" /></TooltipTrigger>
                  <TooltipContent className="max-w-60 text-xs">All production staff are included by default. Uncheck anyone not involved in making this specific product.</TooltipContent>
                </Tooltip>
              </div>
              {allProductionMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No production staff yet. Add them in the <Link href="/team-members" className="text-primary hover:underline">Team page</Link>.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {allProductionMembers.map(m => {
                    const isIncluded = !prodExcludedMemberIds.includes(m.id);
                    return (
                      <label key={m.id} className={`flex items-center gap-3 border rounded-lg px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors ${isIncluded ? "border-orange-300 bg-orange-50" : "opacity-50"}`}>
                        <Checkbox
                          checked={isIncluded}
                          onCheckedChange={(checked) => {
                            setProdExcludedMemberIds(prev => checked ? prev.filter(id => id !== m.id) : [...prev, m.id]);
                            setProdDirty(true);
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{m.name}</div>
                          {m.roleDescription && <div className="text-xs text-muted-foreground truncate">{m.roleDescription}</div>}
                        </div>
                        <div className="text-xs text-orange-700 font-medium flex-shrink-0">
                          {m.payType === "monthly"
                            ? `฿${(m.monthlySalary ?? 0).toLocaleString()}/mo`
                            : `${formatCurrency(m.loadedRate)}/hr`}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. Units per day + carton size */}
            <div>
              <p className="text-sm font-semibold mb-3">2. Output</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                    Cartons produced per day
                    <Tooltip>
                      <TooltipTrigger type="button"><Info className="w-3.5 h-3.5 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent className="text-xs max-w-52">How many cartons your team produces in one shift for this product.</TooltipContent>
                    </Tooltip>
                  </label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="e.g. 50"
                    value={prodUnitsPerDay}
                    onChange={e => { setProdUnitsPerDay(e.target.value); setProdDirty(true); }}
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                    Units per carton
                    <Tooltip>
                      <TooltipTrigger type="button"><Info className="w-3.5 h-3.5 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent className="text-xs max-w-52">If you sell in cartons of 12, set this to 12. Leave as 1 if you sell individual units.</TooltipContent>
                    </Tooltip>
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={prodCartonSize}
                    onChange={e => { setProdCartonSize(e.target.value); setProdDirty(true); }}
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            {/* 3. Production days per month */}
            <div>
              <p className="text-sm font-semibold mb-3">3. Production days per month for this product</p>
              <div className="flex items-center gap-3 flex-wrap">
                <Input
                  type="number"
                  min="1"
                  max="31"
                  placeholder="20"
                  value={prodDaysPerMonth}
                  onChange={e => { setProdDaysPerMonth(e.target.value); setProdDirty(true); }}
                  className="h-9 w-24"
                />
                <span className="text-sm text-muted-foreground">days / month</span>
                {daysPerMonthWarning && (
                  <div className="flex items-center gap-1.5 text-amber-600 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Exceeds factory average ({daysPerMonthFactory} days/month)
                  </div>
                )}
              </div>
            </div>

            {/* Advanced: Shift hours */}
            <div>
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowAdvanced(a => !a)}
              >
                {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Advanced settings
              </button>
              {showAdvanced && (
                <div className="mt-3 max-w-xs">
                  <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                    Shift hours
                    <Tooltip>
                      <TooltipTrigger type="button"><Info className="w-3.5 h-3.5 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent className="text-xs max-w-52">How many hours the team works on this product in one production run.</TooltipContent>
                    </Tooltip>
                  </label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={prodShiftHours}
                    onChange={e => { setProdShiftHours(e.target.value); setProdDirty(true); }}
                    className="h-9"
                  />
                </div>
              )}
            </div>

            {/* Live confirmation panel */}
            {(previewMonthlyUnits > 0 || previewLaborCost !== null) && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-orange-700">Live preview</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Monthly units</div>
                    <div className="text-base font-bold text-foreground">{previewMonthlyUnits > 0 ? previewMonthlyUnits.toLocaleString() : "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Annual units</div>
                    <div className="text-base font-bold text-foreground">{previewMonthlyUnits > 0 ? (previewMonthlyUnits * 12).toLocaleString() : "—"}</div>
                  </div>
                  <div className="sm:col-start-1">
                    <div className="text-xs text-muted-foreground">Labor / unit</div>
                    <div className="text-base font-bold text-orange-700">{previewLaborCost !== null ? formatCurrency(previewLaborCost) : "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Overhead / unit</div>
                    <div className="text-base font-bold text-slate-600">{(prodConfig?.config as any)?.overheadCostPerUnit != null ? formatCurrency((prodConfig?.config as any).overheadCostPerUnit) : "—"}</div>
                    <div className="text-[10px] text-muted-foreground">from saved config</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Utilities / unit</div>
                    <div className="text-base font-bold text-slate-600">{(prodConfig?.config as any)?.utilitiesCostPerUnit != null ? formatCurrency((prodConfig?.config as any).utilitiesCostPerUnit) : "—"}</div>
                    <div className="text-[10px] text-muted-foreground">from saved config</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Water / unit</div>
                    <div className="text-base font-bold text-slate-600">{(prodConfig?.config as any)?.waterCostPerUnit != null ? formatCurrency((prodConfig?.config as any).waterCostPerUnit) : "—"}</div>
                    <div className="text-[10px] text-muted-foreground">from saved config</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Combined pre-ingredient</div>
                    <div className="text-base font-bold text-slate-700">
                      {previewLaborCost !== null ? formatCurrency(previewLaborCost + ((prodConfig?.config as any)?.overheadCostPerUnit ?? 0) + ((prodConfig?.config as any)?.utilitiesCostPerUnit ?? 0) + ((prodConfig?.config as any)?.waterCostPerUnit ?? 0)) : "—"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">labor + overhead + utilities + water</div>
                  </div>
                </div>
                {previewLaborCost !== null && (
                  <div className="text-xs text-muted-foreground border-t border-orange-200 pt-2">
                    {(() => {
                      const included = allProductionMembers.filter(m => !prodExcludedMemberIds.includes(m.id));
                      const totalUnits = (parseInt(prodUnitsPerDay) || 0) * (parseInt(prodCartonSize) || 1);
                      const names = included.map(m => m.name).join(", ");
                      return `${names} · ${totalUnits} units/day`;
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Advanced: per-SKU consumption overrides */}
            <div className="border-t pt-4">
              <button
                type="button"
                onClick={() => setShowAdvancedProd(o => !o)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAdvancedProd ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Advanced: per-SKU consumption overrides
              </button>
              {showAdvancedProd && (
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-muted-foreground">Leave blank to use global monthly allocation. Set a value to override with an exact consumption rate for this product.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">kWh per unit</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.001"
                        placeholder="e.g. 0.05"
                        value={prodKwhPerUnit}
                        onChange={e => { setProdKwhPerUnit(e.target.value); setProdDirty(true); }}
                        className="h-9"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Liters per unit</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.001"
                        placeholder="e.g. 0.2"
                        value={prodLitersPerUnit}
                        onChange={e => { setProdLitersPerUnit(e.target.value); setProdDirty(true); }}
                        className="h-9"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Set electricity and water rates in Cost Library → Utilities &amp; Water.</p>
                </div>
              )}
            </div>

            {/* Change reason tiles — only shown on subsequent saves */}
            {!isFirstSave && prodDirty && (
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm font-semibold">Why are you changing this?</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { key: "efficiency", label: "Efficiency", desc: "Output changed" },
                    { key: "team_changed", label: "Team changed", desc: "People added/removed" },
                    { key: "shift_changed", label: "Shift changed", desc: "Hours adjusted" },
                    { key: "wages_changed", label: "Wages changed", desc: "Rates updated" },
                  ].map(r => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => setChangeReason(r.key)}
                      className={`border rounded-lg px-3 py-2.5 text-left transition-colors ${changeReason === r.key ? "border-orange-400 bg-orange-50" : "hover:border-orange-300 hover:bg-orange-50/50"}`}
                    >
                      <div className="text-xs font-semibold">{r.label}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{r.desc}</div>
                    </button>
                  ))}
                </div>
                {changeReason && (
                  <Input
                    placeholder="Optional note (e.g. new hire, line speed improvement…)"
                    value={changeNote}
                    onChange={e => setChangeNote(e.target.value)}
                    className="h-9 text-sm"
                  />
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-1 border-t">
              <Button
                onClick={handleSaveProdConfig}
                disabled={isSavingProd || (!isFirstSave && prodDirty && !changeReason)}
                size="sm"
              >
                {isSavingProd ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                Save &amp; apply
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
      </TooltipProvider>

      {/* ── Other Cost Lines (Overhead, Quality & Compliance, Delivery) ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base">Other Cost Lines</CardTitle>
            <CardDescription>Overhead, quality, and delivery costs per unit</CardDescription>
          </div>
          <Button size="sm" onClick={openAddLineFromCategory}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Cost Line
          </Button>
        </CardHeader>
        <CardContent className="p-0 pb-1">
          {SECONDARY_CATEGORIES.map(cat => {
            const lines = costLinesByCategory[cat] ?? [];
            const catTotal = lines.reduce((s: number, l: any) => s + (l.lineCost || 0), 0);
            return (
              <div key={cat} className={`border-l-4 ${CATEGORY_BORDER[cat]} border-b last:border-b-0`}>
                <div className={`px-4 py-2 flex items-center justify-between ${CATEGORY_HEADER_BG[cat]}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${CATEGORY_TEXT[cat]}`}>{cat}</span>
                    {lines.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{lines.length}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {lines.length > 0 && (
                      <span className="text-xs font-medium text-muted-foreground">{formatCurrency(catTotal)}</span>
                    )}
                    <button
                      onClick={openAddLineFromCategory}
                      className="text-xs text-primary hover:underline flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>
                </div>
                {lines.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-4 text-xs h-8 text-muted-foreground font-medium">Item</TableHead>
                        <TableHead className="text-right text-xs h-8 text-muted-foreground font-medium">Unit Cost</TableHead>
                        <TableHead className="text-right text-xs h-8 text-muted-foreground font-medium">Qty</TableHead>
                        <TableHead className="text-right text-xs h-8 text-muted-foreground font-medium">Line Cost</TableHead>
                        <TableHead className="w-16 h-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line: any) => {
                        const supplier = line.ingredientId != null ? ingMap[line.ingredientId]?.supplier : null;
                        return (
                          <TableRow key={line.id} className="group">
                            <TableCell className="pl-4 py-2">
                              <div className="text-sm font-medium">{line.ingredientName}</div>
                              {supplier && <div className="text-xs text-muted-foreground">{supplier}</div>}
                              {line.notes && <div className="text-xs text-muted-foreground italic">{line.notes}</div>}
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground py-2">
                              {formatCurrency(line.currentPrice)}/{line.ingredientUnit}
                            </TableCell>
                            <TableCell className="text-right text-sm py-2">
                              {formatQty(line.quantityPerUnit, line.ingredientUnit)}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium py-2">
                              {formatCurrency(line.lineCost)}
                            </TableCell>
                            <TableCell className="py-2 pr-3">
                              <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => openEditLine(line)}
                                  className="p-1 rounded hover:bg-muted transition-colors"
                                  title="Edit"
                                >
                                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                </button>
                                <button
                                  onClick={() => handleDeleteLine(line.id)}
                                  className="p-1 rounded hover:bg-destructive/10 transition-colors"
                                  title="Remove"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                </button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="px-4 py-2.5 text-xs text-muted-foreground italic">No items in this category</div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Event Log</CardTitle>
          <CardDescription>All cost and price changes for this SKU</CardDescription>
        </CardHeader>
        <CardContent>
          {eventLog.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">No events recorded.</div>
          ) : (
            <div className="space-y-0 divide-y">
              {eventLog.map((s, i) => {
                const trigger = triggerLabel(s.triggeredBy ?? null);
                const cogsIncrease = s.cogsChange !== null && s.cogsChange > 0;
                const cogsDecrease = s.cogsChange !== null && s.cogsChange < 0;
                return (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 text-muted-foreground text-sm whitespace-nowrap">{formatDate(s.snapshotDate)}</div>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${trigger.className}`}>{trigger.label}</span>
                    </div>
                    <div className="flex items-center gap-6 ml-0 sm:ml-auto text-sm">
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">COGS</div>
                        <div className="font-medium flex items-center gap-1">
                          {formatCurrency(s.totalCogs)}
                          {cogsIncrease && <ArrowUp className="w-3 h-3 text-destructive" />}
                          {cogsDecrease && <ArrowDown className="w-3 h-3 text-green-600" />}
                        </div>
                        {s.cogsChange !== null && (
                          <div className={`text-xs ${s.cogsChange > 0 ? "text-destructive" : "text-green-600"}`}>
                            {s.cogsChange > 0 ? "+" : ""}{formatCurrency(s.cogsChange)}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Margin</div>
                        <div className="font-medium">{formatPercent(s.grossMargin)}</div>
                        {s.marginChange !== null && (
                          <div className={`text-xs ${s.marginChange > 0 ? "text-green-600" : "text-destructive"}`}>
                            {s.marginChange > 0 ? "+" : ""}{(s.marginChange * 100).toFixed(1)}pp
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Section II — Physical Specifications ── */}
      <Card>
        <button type="button" className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors rounded-t-lg" onClick={() => toggleSpec("II")}>
          <span className="text-sm font-semibold">II — Physical Specifications</span>
          {specOpen.II ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {specOpen.II && (
          <CardContent className="space-y-4">
            {editingSpec === "II" ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1"><label className="text-sm font-medium">Unit Size Description</label><Input placeholder="e.g. 40g bag" value={specDraft.unitSize ?? ""} onChange={e => setSpecDraft(p => ({ ...p, unitSize: e.target.value }))} /></div>
                  <div className="space-y-1"><label className="text-sm font-medium">Units per Carton</label><Input type="number" min="1" value={specDraft.unitsPerCarton ?? ""} onChange={e => setSpecDraft(p => ({ ...p, unitsPerCarton: e.target.value }))} /></div>
                  <div className="space-y-1"><label className="text-sm font-medium">Net Weight</label>
                    <div className="flex gap-2">
                      <Input type="number" step="0.01" className="flex-1" value={specDraft.netWeight ?? ""} onChange={e => setSpecDraft(p => ({ ...p, netWeight: e.target.value }))} />
                      <Select value={specDraft.netWeightUnit || "g"} onValueChange={v => setSpecDraft(p => ({ ...p, netWeightUnit: v }))}>
                        <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>{["g","kg","ml","l"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1"><label className="text-sm font-medium">Gross Weight</label>
                    <div className="flex gap-2">
                      <Input type="number" step="0.01" className="flex-1" value={specDraft.grossWeight ?? ""} onChange={e => setSpecDraft(p => ({ ...p, grossWeight: e.target.value }))} />
                      <Select value={specDraft.grossWeightUnit || "g"} onValueChange={v => setSpecDraft(p => ({ ...p, grossWeightUnit: v }))}>
                        <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>{["g","kg","ml","l"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1"><label className="text-sm font-medium">Carton Gross Weight</label>
                    <div className="flex gap-2">
                      <Input type="number" step="0.01" className="flex-1" value={specDraft.cartonGrossWeight ?? ""} onChange={e => setSpecDraft(p => ({ ...p, cartonGrossWeight: e.target.value }))} />
                      <Select value={specDraft.cartonGrossWeightUnit || "kg"} onValueChange={v => setSpecDraft(p => ({ ...p, cartonGrossWeightUnit: v }))}>
                        <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>{["g","kg"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1"><label className="text-sm font-medium">Shelf Life</label>
                    <div className="flex gap-2">
                      <Input type="number" step="1" className="flex-1" value={specDraft.shelfLife ?? ""} onChange={e => setSpecDraft(p => ({ ...p, shelfLife: e.target.value }))} />
                      <Select value={specDraft.shelfLifeUnit || "days"} onValueChange={v => setSpecDraft(p => ({ ...p, shelfLifeUnit: v }))}>
                        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>{["days","months","years"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <div className="space-y-1"><label className="text-sm font-medium">Carton Dimensions (L × W × H in cm)</label>
                  <div className="flex items-center gap-2">
                    <Input type="number" step="0.1" placeholder="L" className="flex-1" value={specDraft.cartonDimL ?? ""} onChange={e => setSpecDraft(p => ({ ...p, cartonDimL: e.target.value }))} />
                    <span className="text-muted-foreground text-sm">×</span>
                    <Input type="number" step="0.1" placeholder="W" className="flex-1" value={specDraft.cartonDimW ?? ""} onChange={e => setSpecDraft(p => ({ ...p, cartonDimW: e.target.value }))} />
                    <span className="text-muted-foreground text-sm">×</span>
                    <Input type="number" step="0.1" placeholder="H" className="flex-1" value={specDraft.cartonDimH ?? ""} onChange={e => setSpecDraft(p => ({ ...p, cartonDimH: e.target.value }))} />
                    <span className="text-muted-foreground text-xs">cm</span>
                  </div>
                </div>
                <div className="space-y-1"><label className="text-sm font-medium">Storage Condition</label><Input placeholder="e.g. Store in cool dry place" value={specDraft.storageCondition ?? ""} onChange={e => setSpecDraft(p => ({ ...p, storageCondition: e.target.value }))} /></div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingSpec(null)}>Cancel</Button>
                  <Button size="sm" onClick={() => saveSpec("II")} disabled={savingSpec}>{savingSpec && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}<Save className="w-3 h-3 mr-1" />Save</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {(() => { const s = sku as any; return (
                  <div className="grid gap-3 md:grid-cols-2 text-sm">
                    {s?.unitSize && <div><span className="text-muted-foreground">Unit Size: </span><span className="font-medium">{s.unitSize}</span></div>}
                    {s?.netWeight && <div><span className="text-muted-foreground">Net Weight: </span><span className="font-medium">{s.netWeight} {s.netWeightUnit}</span></div>}
                    {s?.grossWeight && <div><span className="text-muted-foreground">Gross Weight: </span><span className="font-medium">{s.grossWeight} {s.grossWeightUnit}</span></div>}
                    {s?.unitsPerCarton && <div><span className="text-muted-foreground">Units/Carton: </span><span className="font-medium">{s.unitsPerCarton}</span></div>}
                    {s?.cartonGrossWeight && <div><span className="text-muted-foreground">Carton Weight: </span><span className="font-medium">{s.cartonGrossWeight} {s.cartonGrossWeightUnit}</span></div>}
                    {(s?.cartonDimL || s?.cartonDimW || s?.cartonDimH) && <div><span className="text-muted-foreground">Carton Dims: </span><span className="font-medium">{s.cartonDimL} × {s.cartonDimW} × {s.cartonDimH} cm</span></div>}
                    {s?.shelfLife && <div><span className="text-muted-foreground">Shelf Life: </span><span className="font-medium">{s.shelfLife} {s.shelfLifeUnit}</span></div>}
                    {s?.storageCondition && <div className="md:col-span-2"><span className="text-muted-foreground">Storage: </span><span className="font-medium">{s.storageCondition}</span></div>}
                    {!s?.unitSize && !s?.netWeight && !s?.grossWeight && !s?.unitsPerCarton && <div className="md:col-span-2 text-muted-foreground text-sm py-2">No specifications added yet.</div>}
                  </div>
                ); })()}
                <Button variant="outline" size="sm" onClick={() => { startEditSpec("II"); }}><Pencil className="w-3 h-3 mr-1" />Edit</Button>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Section III — Pricing & Commercial ── */}
      <Card>
        <button type="button" className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors rounded-t-lg" onClick={() => toggleSpec("III")}>
          <span className="text-sm font-semibold">III — Pricing & Commercial</span>
          {specOpen.III ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {specOpen.III && (
          <CardContent className="space-y-4">
            {editingSpec === "III" ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1"><label className="text-sm font-medium">Ex-Factory Price (฿)</label><Input type="number" step="0.01" value={specDraft.exFactoryPrice ?? ""} onChange={e => setSpecDraft(p => ({ ...p, exFactoryPrice: e.target.value }))} /></div>
                  <div className="space-y-1"><label className="text-sm font-medium">FOB Price (฿)</label><Input type="number" step="0.01" value={specDraft.fobPrice ?? ""} onChange={e => setSpecDraft(p => ({ ...p, fobPrice: e.target.value }))} /></div>
                  <div className="space-y-1"><label className="text-sm font-medium">MOQ</label>
                    <div className="flex gap-2">
                      <Input type="number" step="1" className="flex-1" value={specDraft.moq ?? ""} onChange={e => setSpecDraft(p => ({ ...p, moq: e.target.value }))} />
                      <Select value={specDraft.moqUnit || "units"} onValueChange={v => setSpecDraft(p => ({ ...p, moqUnit: v }))}>
                        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>{["units","cartons","kg"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingSpec(null)}>Cancel</Button>
                  <Button size="sm" onClick={() => saveSpec("III")} disabled={savingSpec}>{savingSpec && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}<Save className="w-3 h-3 mr-1" />Save</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {(() => { const s = sku as any; return (
                  <div className="grid gap-3 md:grid-cols-3 text-sm">
                    {s?.exFactoryPrice != null && <div><span className="text-muted-foreground">Ex-Factory: </span><span className="font-medium">{formatCurrency(s.exFactoryPrice)}</span></div>}
                    {s?.fobPrice != null && <div><span className="text-muted-foreground">FOB: </span><span className="font-medium">{formatCurrency(s.fobPrice)}</span></div>}
                    {s?.moq != null && <div><span className="text-muted-foreground">MOQ: </span><span className="font-medium">{s.moq.toLocaleString()} {s.moqUnit}</span></div>}
                    {s?.exFactoryPrice == null && s?.fobPrice == null && s?.moq == null && <div className="col-span-3 text-muted-foreground py-2">No commercial details added yet.</div>}
                  </div>
                ); })()}
                <Button variant="outline" size="sm" onClick={() => startEditSpec("III")}><Pencil className="w-3 h-3 mr-1" />Edit</Button>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Section IV — Regulatory & Compliance ── */}
      <Card>
        <button type="button" className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors rounded-t-lg" onClick={() => toggleSpec("IV")}>
          <span className="text-sm font-semibold">IV — Regulatory & Compliance</span>
          {specOpen.IV ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {specOpen.IV && (
          <CardContent className="space-y-4">
            {editingSpec === "IV" ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1"><label className="text-sm font-medium">FDA Registration Number</label><Input placeholder="e.g. 10-3-12345-1-0001" value={specDraft.fdaNumber ?? ""} onChange={e => setSpecDraft(p => ({ ...p, fdaNumber: e.target.value }))} /></div>
                  <div className="space-y-1"><label className="text-sm font-medium">Barcode EAN-13</label><Input placeholder="13-digit barcode" maxLength={13} value={specDraft.barcodeEan13 ?? ""} onChange={e => setSpecDraft(p => ({ ...p, barcodeEan13: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {([["halalCertified","Halal"],["gmpCertified","GMP"],["haccpCertified","HACCP"],["organicCertified","Organic"]] as const).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-2 rounded-lg border p-3">
                      <Switch checked={!!specDraft[key]} onCheckedChange={v => setSpecDraft(p => ({ ...p, [key]: v }))} />
                      <span className="text-sm font-medium">{label}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1"><label className="text-sm font-medium">Other Certifications</label><Input placeholder="e.g. ISO 22000, BRC" value={specDraft.otherCertifications ?? ""} onChange={e => setSpecDraft(p => ({ ...p, otherCertifications: e.target.value }))} /></div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingSpec(null)}>Cancel</Button>
                  <Button size="sm" onClick={() => saveSpec("IV")} disabled={savingSpec}>{savingSpec && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}<Save className="w-3 h-3 mr-1" />Save</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {(() => { const s = sku as any; return (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {s?.halalCertified && <Badge variant="secondary">Halal</Badge>}
                      {s?.gmpCertified && <Badge variant="secondary">GMP</Badge>}
                      {s?.haccpCertified && <Badge variant="secondary">HACCP</Badge>}
                      {s?.organicCertified && <Badge variant="secondary">Organic</Badge>}
                    </div>
                    <div className="grid gap-2 text-sm md:grid-cols-2">
                      {s?.fdaNumber && <div><span className="text-muted-foreground">FDA: </span><span className="font-medium font-mono">{s.fdaNumber}</span></div>}
                      {s?.barcodeEan13 && <div><span className="text-muted-foreground">EAN-13: </span><span className="font-medium font-mono">{s.barcodeEan13}</span></div>}
                      {s?.otherCertifications && <div className="md:col-span-2"><span className="text-muted-foreground">Other: </span><span className="font-medium">{s.otherCertifications}</span></div>}
                    </div>
                    {!s?.halalCertified && !s?.gmpCertified && !s?.haccpCertified && !s?.organicCertified && !s?.fdaNumber && !s?.barcodeEan13 && <p className="text-muted-foreground text-sm py-1">No compliance data added yet.</p>}
                  </div>
                ); })()}
                <Button variant="outline" size="sm" onClick={() => startEditSpec("IV")}><Pencil className="w-3 h-3 mr-1" />Edit</Button>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Section V — Labelling & Files ── */}
      <Card>
        <button type="button" className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors rounded-t-lg" onClick={() => toggleSpec("V")}>
          <span className="text-sm font-semibold">V — Labelling & Files</span>
          {specOpen.V ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {specOpen.V && (
          <CardContent className="space-y-6">

            {/* Labelling details — product description, FDA, barcode */}
            <div className="space-y-3">
              {editingSpec === "V" ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Product Description</label>
                    <Textarea rows={3} placeholder="Describe the product as it appears on the label…" value={specDraft.productDescription ?? ""} onChange={e => setSpecDraft(p => ({ ...p, productDescription: e.target.value }))} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-sm font-medium">FDA Registration Number</label>
                      <Input placeholder="e.g. 10-2-12345" value={specDraft.fdaNumber ?? ""} onChange={e => setSpecDraft(p => ({ ...p, fdaNumber: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium">Barcode EAN-13</label>
                      <Input placeholder="e.g. 8850012345678" value={specDraft.barcodeEan13 ?? ""} onChange={e => setSpecDraft(p => ({ ...p, barcodeEan13: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditingSpec(null)}>Cancel</Button>
                    <Button size="sm" onClick={() => saveSpec("V")} disabled={savingSpec}>{savingSpec && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}<Save className="w-3 h-3 mr-1" />Save</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {(() => {
                    const s = sku as any;
                    const hasDesc = !!s?.productDescription;
                    const hasFda = !!s?.fdaNumber;
                    const hasBarcode = !!s?.barcodeEan13;
                    return (
                      <>
                        {hasDesc && (
                          <div className="space-y-0.5">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Product Description</p>
                            <p className="text-sm whitespace-pre-wrap">{s.productDescription}</p>
                          </div>
                        )}
                        {(hasFda || hasBarcode) && (
                          <div className="flex flex-wrap gap-4">
                            {hasFda && (
                              <div className="space-y-0.5">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">FDA No.</p>
                                <p className="text-sm font-mono">{s.fdaNumber}</p>
                              </div>
                            )}
                            {hasBarcode && (
                              <div className="space-y-0.5">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Barcode EAN-13</p>
                                <p className="text-sm font-mono">{s.barcodeEan13}</p>
                              </div>
                            )}
                          </div>
                        )}
                        {!hasDesc && !hasFda && !hasBarcode && (
                          <p className="text-muted-foreground text-sm">No labelling details added yet.</p>
                        )}
                        <Button variant="outline" size="sm" onClick={() => startEditSpec("V")}><Pencil className="w-3 h-3 mr-1" />Edit</Button>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Single file uploads */}
            <div className="grid gap-4 md:grid-cols-3 pt-2 border-t">
              {([
                { label: "Label File", urlKey: "labelFileUrl", nameKey: "labelFileName", endpoint: `/skus/${skuId}/label-file`, ref: labelRef, accept: ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" },
                { label: "Spec Sheet", urlKey: "specSheetUrl", nameKey: "specSheetFileName", endpoint: `/skus/${skuId}/spec-sheet`, ref: specRef, accept: ".pdf,application/pdf" },
                { label: "Packaging Dieline", urlKey: "dielineUrl", nameKey: "dielineFileName", endpoint: `/skus/${skuId}/dieline`, ref: dielineRef, accept: ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" },
              ]).map(({ label, urlKey, nameKey, endpoint, ref, accept }) => {
                const s = sku as any;
                const fileUrl = s?.[urlKey] ? getApiUrl(`/storage${s[urlKey]}`) : null;
                const fileName = s?.[nameKey] ?? "View file";
                return (
                  <div key={label} className="space-y-1">
                    <label className="text-sm font-medium">{label}</label>
                    {fileUrl ? (
                      <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
                        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="flex-1 text-xs truncate text-primary hover:underline">{fileName}</a>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => deleteFile(endpoint)} title="Remove"><X className="w-3 h-3" /></Button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => ref.current?.click()} disabled={uploadingFile === endpoint} className="flex items-center gap-2 w-full border-2 border-dashed border-muted-foreground/25 rounded-lg px-3 py-2 hover:border-primary/50 hover:bg-muted/20 transition-colors text-sm text-muted-foreground disabled:opacity-50">
                        {uploadingFile === endpoint ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Upload
                      </button>
                    )}
                    <input ref={ref} type="file" accept={accept} className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadSingleFile(f, endpoint); }} />
                  </div>
                );
              })}
            </div>

            {/* Product photos (multi) */}
            <div className="space-y-2 pt-2 border-t">
              <label className="text-sm font-medium">Product Photos</label>
              <div className="flex flex-wrap gap-2">
                {((sku as any)?.productPhotos ?? []).map((photo: any) => (
                  <div key={photo.id} className="relative group w-20 h-20">
                    <img src={getApiUrl(`/storage${photo.objectPath}`)} alt={photo.fileName ?? ""} className="w-full h-full object-cover rounded-lg border" />
                    <button type="button" onClick={() => fetch(getApiUrl(`/skus/${skuId}/product-photos/${photo.id}`), { method: "DELETE" }).then(() => qc.invalidateQueries({ queryKey: getGetSkuQueryKey(skuId) }))} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => prodPhotosRef.current?.click()} disabled={!!uploadingFile} className="flex flex-col items-center justify-center w-20 h-20 border-2 border-dashed border-muted-foreground/25 rounded-lg hover:border-primary/50 hover:bg-muted/20 transition-colors disabled:opacity-50">
                  {uploadingFile === "photos" ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : <ImagePlus className="w-5 h-5 text-muted-foreground" />}
                </button>
              </div>
              <input ref={prodPhotosRef} type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" multiple className="hidden" onChange={async e => {
                const files = Array.from(e.target.files ?? []); e.target.value = "";
                setUploadingFile("photos");
                try { for (const f of files) await uploadSingleFile(f, `/skus/${skuId}/product-photos`, "POST"); } finally { setUploadingFile(null); }
              }} />
            </div>

            {/* Certificate files (multi) */}
            <div className="space-y-2 pt-2 border-t">
              <label className="text-sm font-medium">Certificate Files</label>
              <div className="space-y-1">
                {((sku as any)?.certificateFiles ?? []).map((cf: any) => (
                  <div key={cf.id} className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2 text-sm group">
                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <a href={getApiUrl(`/storage${cf.objectPath}`)} target="_blank" rel="noopener noreferrer" className="flex-1 text-xs truncate text-primary hover:underline">{cf.fileName ?? "Certificate"}</a>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100" onClick={() => fetch(getApiUrl(`/skus/${skuId}/certificate-files/${cf.id}`), { method: "DELETE" }).then(() => qc.invalidateQueries({ queryKey: getGetSkuQueryKey(skuId) }))}><X className="w-3 h-3" /></Button>
                  </div>
                ))}
                <button type="button" onClick={() => certsRef.current?.click()} disabled={!!uploadingFile} className="flex items-center gap-2 w-full border-2 border-dashed border-muted-foreground/25 rounded-lg px-3 py-2 hover:border-primary/50 hover:bg-muted/20 transition-colors text-sm text-muted-foreground disabled:opacity-50">
                  {uploadingFile === "certs" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Add certificate files (PDF)
                </button>
              </div>
              <input ref={certsRef} type="file" accept=".pdf,application/pdf" multiple className="hidden" onChange={async e => {
                const files = Array.from(e.target.files ?? []); e.target.value = "";
                setUploadingFile("certs");
                try { for (const f of files) await uploadSingleFile(f, `/skus/${skuId}/certificate-files`, "POST"); } finally { setUploadingFile(null); }
              }} />
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Section VI — Ingredient List ── */}
      <Card>
        <button type="button" className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors rounded-t-lg" onClick={() => toggleSpec("VI")}>
          <span className="text-sm font-semibold">VI — Ingredient List</span>
          {specOpen.VI ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {specOpen.VI && (
          <CardContent className="space-y-4">
            {editingSpec === "VI" ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Ingredients</label>
                    {(() => {
                      const rows: any[] = specDraft.ingredientLines ?? [];
                      const total = rows.reduce((s: number, r: any) => s + (parseFloat(r.percentage) || 0), 0);
                      return <span className={`text-xs font-mono ${Math.abs(total - 100) < 0.01 ? "text-green-600" : "text-muted-foreground"}`}>{total.toFixed(1)}% total</span>;
                    })()}
                  </div>
                  {(() => {
                    const ingredientRows: any[] = specDraft.ingredientLines ?? [];
                    const rowIds = ingredientRows.map((_: any, i: number) => `ingredient-${i}`);
                    const handleDragEnd = (event: DragEndEvent) => {
                      const { active, over } = event;
                      if (!over || active.id === over.id) return;
                      const oldIndex = rowIds.indexOf(active.id as string);
                      const newIndex = rowIds.indexOf(over.id as string);
                      setSpecDraft(p => ({ ...p, ingredientLines: arrayMove(p.ingredientLines ?? [], oldIndex, newIndex) }));
                    };
                    const handleChange = (idx: number, field: "name" | "percentage", value: string) => {
                      setSpecDraft(p => {
                        const rows = [...(p.ingredientLines ?? [])];
                        rows[idx] = { ...rows[idx], [field]: field === "percentage" ? (parseFloat(value) || 0) : value };
                        return { ...p, ingredientLines: rows };
                      });
                    };
                    const handleRemove = (idx: number) => {
                      setSpecDraft(p => ({ ...p, ingredientLines: (p.ingredientLines ?? []).filter((_: any, i: number) => i !== idx) }));
                    };
                    return (
                      <DndContext sensors={ingredientSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
                          <div className="space-y-2">
                            {ingredientRows.map((row: any, idx: number) => (
                              <SortableIngredientRow
                                key={`ingredient-${idx}`}
                                id={`ingredient-${idx}`}
                                row={row}
                                idx={idx}
                                onChange={handleChange}
                                onRemove={handleRemove}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    );
                  })()}
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setSpecDraft(p => ({ ...p, ingredientLines: [...(p.ingredientLines ?? []), { name: "", percentage: 0 }] }))}>
                    <Plus className="w-3.5 h-3.5 mr-1" />Add ingredient
                  </Button>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Allergen Information</label>
                  <Textarea rows={2} placeholder="Contains: Wheat, Milk. May contain traces of nuts." value={specDraft.allergenInfo ?? ""} onChange={e => setSpecDraft(p => ({ ...p, allergenInfo: e.target.value }))} />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingSpec(null)}>Cancel</Button>
                  <Button size="sm" onClick={() => saveSpec("VI")} disabled={savingSpec}>{savingSpec && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}<Save className="w-3 h-3 mr-1" />Save</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {(() => {
                  const s = sku as any;
                  const lines: Array<{ nameThai: string; nameEnglish: string; percentage: number }> = Array.isArray(s?.ingredientLines) ? s.ingredientLines : [];
                  const hasAllergen = !!s?.allergenInfo;
                  return (
                    <>
                      {lines.length > 0 ? (
                        <div className="border rounded-lg overflow-hidden">
                          <div className="bg-muted/40 px-3 py-1.5 border-b">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ingredient List</p>
                          </div>
                          <div className="divide-y">
                            {lines.map((row, i) => (
                              <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                                <span>{row.name}</span>
                                <span className="font-mono text-xs ml-4 flex-shrink-0">{row.percentage}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-sm">No ingredient list added yet.</p>
                      )}
                      {hasAllergen && (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Allergen Information</p>
                          <div className="flex items-start gap-2 border rounded-lg p-3 bg-amber-50/60 border-amber-200">
                            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-amber-900">{s.allergenInfo}</p>
                          </div>
                        </div>
                      )}
                      <Button variant="outline" size="sm" onClick={() => startEditSpec("VI")}><Pencil className="w-3 h-3 mr-1" />Edit</Button>
                    </>
                  );
                })()}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Section VII — Nutrition Info ── */}
      <Card>
        <button type="button" className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors rounded-t-lg" onClick={() => toggleSpec("VII")}>
          <span className="text-sm font-semibold">VII — Nutrition Info</span>
          {specOpen.VII ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {specOpen.VII && (
          <CardContent className="space-y-4">
            {editingSpec === "VII" ? (
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Nutritional Information</label>
                  <p className="text-xs text-muted-foreground">Enter per-serving values — e.g. "Energy: 160 kcal / Protein: 3 g / Fat: 5 g / Carbohydrates: 25 g / Sugar: 10 g / Sodium: 120 mg"</p>
                  <Textarea rows={8} placeholder={"Serving size: 40g\nServings per container: 1\n\nEnergy: 160 kcal\nProtein: 3 g\nTotal Fat: 5 g\n  - Saturated Fat: 2 g\nCarbohydrates: 25 g\n  - Sugar: 10 g\nDietary Fibre: 1 g\nSodium: 120 mg"} value={specDraft.nutritionalInfo ?? ""} onChange={e => setSpecDraft(p => ({ ...p, nutritionalInfo: e.target.value }))} />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingSpec(null)}>Cancel</Button>
                  <Button size="sm" onClick={() => saveSpec("VII")} disabled={savingSpec}>{savingSpec && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}<Save className="w-3 h-3 mr-1" />Save</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {(() => { const s = sku as any; return s?.nutritionalInfo ? (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-muted/50 px-4 py-2 border-b">
                      <p className="text-xs font-bold uppercase tracking-widest">Nutrition Facts</p>
                    </div>
                    <div className="px-4 py-3">
                      {s.nutritionalInfo.split("\n").map((line: string, i: number) => {
                        const isSubRow = line.startsWith("  ") || line.startsWith("\t");
                        const parts = line.trim().split(/:\s*/);
                        const hasColon = parts.length >= 2;
                        return (
                          <div
                            key={i}
                            className={`flex items-center justify-between py-1 text-sm ${i > 0 ? "border-t border-dashed border-muted-foreground/20" : ""} ${isSubRow ? "pl-4 text-muted-foreground" : ""}`}
                          >
                            {hasColon ? (
                              <>
                                <span className={isSubRow ? "" : "font-medium"}>{parts[0]}</span>
                                <span className="font-mono text-xs">{parts.slice(1).join(": ")}</span>
                              </>
                            ) : (
                              <span className="text-muted-foreground italic w-full">{line.trim() || <span className="select-none">&nbsp;</span>}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No nutritional information added yet.</p>
                ); })()}
                <Button variant="outline" size="sm" onClick={() => startEditSpec("VII")}><Pencil className="w-3 h-3 mr-1" />Edit</Button>
              </div>
            )}

            {/* Nutrition document / photo upload */}
            <div className="pt-2 border-t space-y-2">
              <label className="text-sm font-medium">Nutrition Document or Photo</label>
              {(() => {
                const s = sku as any;
                const docPath = s?.nutritionDocPath;
                const contentType = s?.nutritionDocContentType ?? "";
                const isImage = contentType.startsWith("image/");
                const endpoint = `/skus/${skuId}/nutrition-doc`;
                if (docPath) {
                  const fileUrl = getApiUrl(`/storage${docPath}`);
                  return (
                    <div className="space-y-2">
                      {isImage ? (
                        <div className="relative group inline-block">
                          <img src={fileUrl} alt="Nutrition" className="max-h-64 rounded-lg border object-contain" />
                          <button type="button" onClick={() => deleteFile(endpoint)} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
                          <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="flex-1 text-xs truncate text-primary hover:underline">View nutrition document</a>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => deleteFile(endpoint)} title="Remove"><X className="w-3 h-3" /></Button>
                        </div>
                      )}
                      <button type="button" onClick={() => nutritionDocRef.current?.click()} disabled={uploadingFile === endpoint} className="flex items-center gap-2 border-2 border-dashed border-muted-foreground/25 rounded-lg px-3 py-2 hover:border-primary/50 hover:bg-muted/20 transition-colors text-sm text-muted-foreground disabled:opacity-50">
                        {uploadingFile === endpoint ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Replace
                      </button>
                    </div>
                  );
                }
                return (
                  <button type="button" onClick={() => nutritionDocRef.current?.click()} disabled={uploadingFile === endpoint} className="flex items-center gap-2 w-full border-2 border-dashed border-muted-foreground/25 rounded-lg px-3 py-2 hover:border-primary/50 hover:bg-muted/20 transition-colors text-sm text-muted-foreground disabled:opacity-50">
                    {uploadingFile === endpoint ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Upload nutrition image or PDF
                  </button>
                );
              })()}
              <input ref={nutritionDocRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadSingleFile(f, `/skus/${skuId}/nutrition-doc`); }} />
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Add Cost Line Dialog ── */}
      <Dialog open={isAddLineOpen} onOpenChange={(open) => { if (!open) { setIsAddLineOpen(false); addLineForm.reset(); setAddDisplayUnit("kg"); setAddItemType("ingredient"); setAddNumBlocks(""); setAddMoq(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Cost Line</DialogTitle></DialogHeader>
          <Form {...addLineForm}>
            <form onSubmit={addLineForm.handleSubmit(onAddLineSubmit)} className="space-y-4">
              <FormField control={addLineForm.control} name="itemId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Ingredient / Packaging Item</FormLabel>
                  <IngredientPicker
                    items={allCostItems}
                    selectedId={field.value}
                    selectedType={addItemType}
                    onSelect={(item) => {
                      field.onChange(item.id);
                      setAddItemType(item._type);
                      if (item._type === "ingredient") {
                        const du = initDisplayUnit(1, item.unit);
                        setAddDisplayUnit(du);
                      }
                      if ((item as any).pkgCategory !== "printing_block") {
                        setAddNumBlocks("");
                        setAddMoq("");
                      }
                      addLineForm.setValue("displayQty", 1);
                    }}
                  />
                  <FormMessage />
                </FormItem>
              )} />

              {addIsPrintingBlock ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Number of blocks</label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        placeholder="e.g. 8"
                        value={addNumBlocks}
                        onChange={e => setAddNumBlocks(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">MOQ (units)</label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        placeholder="e.g. 10000"
                        value={addMoq}
                        onChange={e => setAddMoq(e.target.value)}
                      />
                    </div>
                  </div>
                  {addItem && addNumBlocks && addMoq && parseInt(addNumBlocks) > 0 && parseInt(addMoq) > 0 && (
                    <div className="rounded-lg bg-purple-50 border border-purple-200 px-4 py-3 text-sm">
                      <span className="text-muted-foreground">Cost per unit: </span>
                      <span className="font-semibold text-purple-700">
                        {formatCurrency((parseInt(addNumBlocks) * addItem.currentPrice) / parseInt(addMoq))}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">
                        ({addNumBlocks} × {formatCurrency(addItem.currentPrice)} ÷ {parseInt(addMoq).toLocaleString()})
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <FormField control={addLineForm.control} name="displayQty" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity per unit</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input type="number" step="any" placeholder="0" {...field} className="flex-1" />
                      </FormControl>
                      {addItemType === "ingredient" && currentAddIngUnit === "kg" && (
                        <div className="flex border rounded-md overflow-hidden">
                          {(["g", "kg"] as DisplayUnit[]).map(u => (
                            <button
                              key={u}
                              type="button"
                              onClick={() => {
                                const current = parseFloat(String(field.value)) || 0;
                                if (u === "g" && addDisplayUnit === "kg") {
                                  addLineForm.setValue("displayQty", parseFloat((current * 1000).toFixed(4)));
                                } else if (u === "kg" && addDisplayUnit === "g") {
                                  addLineForm.setValue("displayQty", parseFloat((current / 1000).toFixed(6)));
                                }
                                setAddDisplayUnit(u);
                              }}
                              className={`px-3 py-2 text-sm font-medium transition-colors ${addDisplayUnit === u ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                            >
                              {u}
                            </button>
                          ))}
                        </div>
                      )}
                      {(addItemType !== "ingredient" || currentAddIngUnit !== "kg") && (
                        <div className="flex items-center px-3 border rounded-md bg-muted text-sm text-muted-foreground">{currentAddIngUnit || "unit"}</div>
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              {!addIsPrintingBlock && (
                <FormField control={addLineForm.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl><Input placeholder="e.g. 5% waste factor" {...field} value={field.value || ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => { setIsAddLineOpen(false); addLineForm.reset(); setAddNumBlocks(""); setAddMoq(""); }}>Cancel</Button>
                <Button type="submit">Add</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Cost Line Sheet ── */}
      <Sheet open={!!editingLine} onOpenChange={(open) => { if (!open) setEditingLine(null); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle>Edit Cost Line</SheetTitle>
          </SheetHeader>
          <Form {...editLineForm}>
            <form onSubmit={editLineForm.handleSubmit(onEditLineSubmit)} className="space-y-5">
              <FormField control={editLineForm.control} name="itemId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Ingredient / Packaging Item</FormLabel>
                  <IngredientPicker
                    items={allCostItems}
                    selectedId={field.value}
                    selectedType={editItemType}
                    onSelect={(item) => {
                      field.onChange(item.id);
                      setEditItemType(item._type);
                      if (item._type === "ingredient") {
                        const du = initDisplayUnit(parseFloat(String(editLineForm.getValues("displayQty"))) || 1, item.unit);
                        setEditDisplayUnit(du);
                      }
                      if ((item as any).pkgCategory !== "printing_block") {
                        setEditNumBlocks("");
                        setEditMoq("");
                      }
                    }}
                  />
                  <FormMessage />
                </FormItem>
              )} />

              {editIsPrintingBlock ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Number of blocks</label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        placeholder="e.g. 8"
                        value={editNumBlocks}
                        onChange={e => setEditNumBlocks(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">MOQ (units)</label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        placeholder="e.g. 10000"
                        value={editMoq}
                        onChange={e => setEditMoq(e.target.value)}
                      />
                    </div>
                  </div>
                  {editItem && editNumBlocks && editMoq && parseInt(editNumBlocks) > 0 && parseInt(editMoq) > 0 && (
                    <div className="rounded-lg bg-purple-50 border border-purple-200 px-4 py-3 text-sm">
                      <span className="text-muted-foreground">Cost per unit: </span>
                      <span className="font-semibold text-purple-700">
                        {formatCurrency((parseInt(editNumBlocks) * editItem.currentPrice) / parseInt(editMoq))}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">
                        ({editNumBlocks} × {formatCurrency(editItem.currentPrice)} ÷ {parseInt(editMoq).toLocaleString()})
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <FormField control={editLineForm.control} name="displayQty" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity per unit</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input type="number" step="any" placeholder="0" {...field} className="flex-1" />
                      </FormControl>
                      {editItemType === "ingredient" && currentEditIngUnit === "kg" && (
                        <div className="flex border rounded-md overflow-hidden">
                          {(["g", "kg"] as DisplayUnit[]).map(u => (
                            <button
                              key={u}
                              type="button"
                              onClick={() => {
                                const current = parseFloat(String(field.value)) || 0;
                                if (u === "g" && editDisplayUnit === "kg") {
                                  editLineForm.setValue("displayQty", parseFloat((current * 1000).toFixed(4)));
                                } else if (u === "kg" && editDisplayUnit === "g") {
                                  editLineForm.setValue("displayQty", parseFloat((current / 1000).toFixed(6)));
                                }
                                setEditDisplayUnit(u);
                              }}
                              className={`px-3 py-2 text-sm font-medium transition-colors ${editDisplayUnit === u ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                            >
                              {u}
                            </button>
                          ))}
                        </div>
                      )}
                      {(editItemType !== "ingredient" || currentEditIngUnit !== "kg") && (
                        <div className="flex items-center px-3 border rounded-md bg-muted text-sm text-muted-foreground">{currentEditIngUnit || "unit"}</div>
                      )}
                  </div>
                  <FormMessage />
                </FormItem>
              )} />
              )}

              {!editIsPrintingBlock && (
                <FormField control={editLineForm.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl><Input placeholder="e.g. 5% waste factor" {...field} value={field.value || ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <SheetFooter className="flex gap-2 pt-2">
                <Button type="button" variant="ghost" className="flex-1" onClick={() => setEditingLine(null)}>Cancel</Button>
                <Button type="submit" className="flex-1" disabled={isSavingLine}>Save Changes</Button>
              </SheetFooter>
            </form>
          </Form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
