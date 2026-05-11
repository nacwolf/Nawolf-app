import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSkuPrintingBlockConfig,
  useListSkuPrintingBlockConfigs,
  useSetSkuPrintingBlockConfig,
  useRetireSkuPrintingBlockConfig,
  useDeleteSkuPrintingBlockConfig,
  useListPrintingBlockSuppliers,
  getGetSkuQueryKey,
  getGetSkuPrintingBlockConfigQueryKey,
  getListSkuPrintingBlockConfigsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Printer, ChevronDown, ChevronUp, Loader2, Trash2, History } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";

interface PrintingBlockPanelProps {
  skuId: number;
}

export function PrintingBlockPanel({ skuId }: PrintingBlockPanelProps) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [isRetireOpen, setIsRetireOpen] = useState(false);
  const [retireReason, setRetireReason] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [numBlocks, setNumBlocks] = useState<string>("");
  const [moq, setMoq] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const { data: activeConfig, isLoading } = useGetSkuPrintingBlockConfig(skuId);
  const { data: configHistory } = useListSkuPrintingBlockConfigs(skuId);
  const { data: suppliers } = useListPrintingBlockSuppliers();
  const setConfig = useSetSkuPrintingBlockConfig();
  const retireConfig = useRetireSkuPrintingBlockConfig();
  const deleteConfig = useDeleteSkuPrintingBlockConfig();

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: getGetSkuPrintingBlockConfigQueryKey(skuId) });
    qc.invalidateQueries({ queryKey: getListSkuPrintingBlockConfigsQueryKey(skuId) });
    qc.invalidateQueries({ queryKey: getGetSkuQueryKey(skuId) });
  }

  function openConfigForm() {
    if (activeConfig) {
      setSelectedSupplierId(String(activeConfig.supplierId));
      setNumBlocks(String(activeConfig.numBlocks));
      setMoq(String(activeConfig.moq));
    } else {
      setSelectedSupplierId("");
      setNumBlocks("");
      setMoq("");
    }
    setShowConfigForm(true);
    setIsOpen(true);
  }

  async function handleSaveConfig() {
    const sid = parseInt(selectedSupplierId, 10);
    const nb = parseInt(numBlocks, 10);
    const m = parseInt(moq, 10);
    if (!sid || !nb || !m || nb < 1 || m < 1) {
      toast({ variant: "destructive", title: "Please fill in all fields with valid positive values" });
      return;
    }
    setIsSaving(true);
    try {
      await setConfig.mutateAsync({ id: skuId, data: { supplierId: sid, numBlocks: nb, moq: m } });
      invalidateAll();
      setShowConfigForm(false);
      toast({ title: "Printing block configured — COGS updated" });
    } catch {
      toast({ variant: "destructive", title: "Failed to save block config" });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRetire() {
    try {
      const result = await retireConfig.mutateAsync({ id: skuId, data: { reason: retireReason || null } });
      invalidateAll();
      setIsRetireOpen(false);
      setRetireReason("");
      const marginStr = result.grossMargin != null ? `New margin: ${(result.grossMargin * 100).toFixed(1)}%` : undefined;
      toast({ title: "Printing blocks retired", description: marginStr });
    } catch {
      toast({ variant: "destructive", title: "Failed to retire block config" });
    }
  }

  async function handleDelete() {
    if (!confirm("Remove this printing block config entirely? This will recalculate COGS.")) return;
    try {
      const result = await deleteConfig.mutateAsync({ id: skuId });
      invalidateAll();
      const marginStr = result.grossMargin != null ? `New margin: ${(result.grossMargin * 100).toFixed(1)}%` : undefined;
      toast({ title: "Block config removed", description: marginStr });
    } catch {
      toast({ variant: "destructive", title: "Failed to remove block config" });
    }
  }

  const hasActiveConfig = !!activeConfig;
  const retiredConfigs = (configHistory ?? []).filter(c => c.status === "retired");
  const lastRetired = retiredConfigs[0] ?? null;

  const previewSupplier = suppliers?.find(s => s.id === parseInt(selectedSupplierId, 10));
  const previewCost =
    previewSupplier && numBlocks && moq
      ? (parseInt(numBlocks, 10) * previewSupplier.pricePerBlock) / parseInt(moq, 10)
      : null;

  const headerSubtitle = isLoading
    ? "Loading..."
    : hasActiveConfig
    ? `${activeConfig.numBlocks} blocks · ${activeConfig.supplierName} · amortized over ${activeConfig.moq.toLocaleString()} units`
    : lastRetired
    ? `Retired on ${formatDate(lastRetired.retiredAt ?? "")} — click to reconfigure`
    : "No active block config — click to configure";

  return (
    <>
      <Card className="border-l-4 border-l-purple-500">
        <button
          className="w-full px-6 py-4 bg-purple-50 flex items-center justify-between gap-3 rounded-t-xl"
          onClick={() => setIsOpen(o => !o)}
        >
          <div className="flex items-center gap-3">
            <Printer className="w-4 h-4 text-purple-600 flex-shrink-0" />
            <div className="text-left">
              <div className="text-sm font-bold uppercase tracking-wider text-purple-700">Printing Blocks</div>
              <div className="text-xs text-muted-foreground mt-0.5">{headerSubtitle}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasActiveConfig && (
              <Badge className="bg-purple-100 text-purple-800 border-0 text-xs">
                {formatCurrency(activeConfig.amortizedCostPerUnit)}/unit
              </Badge>
            )}
            {!hasActiveConfig && lastRetired && (
              <Badge variant="outline" className="text-amber-700 border-amber-300 text-xs">
                Retired
              </Badge>
            )}
            {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </button>

        {isOpen && (
          <CardContent className="pt-5 space-y-4">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading...
              </div>
            ) : hasActiveConfig ? (
              <>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-purple-700">Active configuration</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground">Supplier</div>
                      <div className="text-sm font-semibold">{activeConfig.supplierName}</div>
                      <div className="text-xs text-muted-foreground">{formatCurrency(activeConfig.pricePerBlock)}/block</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Blocks</div>
                      <div className="text-base font-bold">{activeConfig.numBlocks}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">MOQ</div>
                      <div className="text-base font-bold">{activeConfig.moq.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">units</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Amortized cost</div>
                      <div className="text-base font-bold text-purple-700">
                        {formatCurrency(activeConfig.amortizedCostPerUnit)}/unit
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Printing Blocks (amortized over {activeConfig.moq.toLocaleString()} units)
                      </div>
                    </div>
                  </div>
                </div>

                {!showConfigForm && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={openConfigForm}>
                      Update config
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-amber-700 border-amber-300 hover:bg-amber-50"
                      onClick={() => setIsRetireOpen(true)}
                    >
                      Retire blocks
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive ml-auto"
                      onClick={handleDelete}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove config
                    </Button>
                  </div>
                )}
              </>
            ) : (
              !showConfigForm && (
                <div className="space-y-3">
                  {lastRetired ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-1">
                      <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                        Retired on {formatDate(lastRetired.retiredAt ?? "")}
                      </div>
                      {lastRetired.retiredReason && (
                        <div className="text-xs text-muted-foreground italic">{lastRetired.retiredReason}</div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        Was: {lastRetired.numBlocks} blocks · {lastRetired.moq.toLocaleString()} unit MOQ
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No printing block config yet. Add one to include the amortized block cost in COGS.
                    </p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    {(suppliers?.length ?? 0) === 0 ? (
                      <p className="text-xs text-muted-foreground">First add a supplier in the Cost Library.</p>
                    ) : (
                      <Button size="sm" onClick={openConfigForm}>
                        {lastRetired ? "Add new block config" : "Configure printing blocks"}
                      </Button>
                    )}
                    {lastRetired && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive ml-auto"
                        onClick={handleDelete}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove config
                      </Button>
                    )}
                  </div>
                </div>
              )
            )}

            {showConfigForm && (
              <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                <div className="text-sm font-semibold">
                  {hasActiveConfig ? "Update block configuration" : "Add block configuration"}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Supplier</label>
                    <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select supplier..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(suppliers ?? []).map(s => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name} ({formatCurrency(s.pricePerBlock)}/block)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Number of blocks</label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="e.g. 4"
                      value={numBlocks}
                      onChange={e => setNumBlocks(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">MOQ (units)</label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="e.g. 5000"
                      value={moq}
                      onChange={e => setMoq(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>

                {previewCost != null && !isNaN(previewCost) && (
                  <div className="text-sm text-purple-700 font-medium">
                    Amortized cost:{" "}
                    <span className="font-bold">{formatCurrency(previewCost)}/unit</span>
                    <span className="text-xs text-muted-foreground ml-2 font-normal">
                      ({numBlocks} blocks × {formatCurrency(previewSupplier?.pricePerBlock ?? 0)} ÷{" "}
                      {parseInt(moq, 10).toLocaleString()} units)
                    </span>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveConfig} disabled={isSaving}>
                    {isSaving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                    Save &amp; apply
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowConfigForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {retiredConfigs.length > 0 && (
              <div>
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowHistory(h => !h)}
                >
                  <History className="w-3.5 h-3.5" />
                  {showHistory ? "Hide" : "Show"} block history ({retiredConfigs.length} retired)
                </button>
                {showHistory && (
                  <div className="mt-3 border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Supplier</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Blocks</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">MOQ</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Retired</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {retiredConfigs.map(c => (
                          <tr key={c.id}>
                            <td className="px-3 py-2 font-medium">{c.supplierName}</td>
                            <td className="px-3 py-2 text-right">{c.numBlocks}</td>
                            <td className="px-3 py-2 text-right">{c.moq.toLocaleString()}</td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {c.retiredAt ? formatDate(c.retiredAt) : "—"}
                              {c.retiredReason && (
                                <span className="block italic text-[10px]">{c.retiredReason}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <AlertDialog open={isRetireOpen} onOpenChange={setIsRetireOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire Printing Blocks</AlertDialogTitle>
            <AlertDialogDescription>
              This will retire the current block configuration and remove its amortized cost from COGS. You can add a
              new config at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium">Reason (optional)</label>
            <Textarea
              className="mt-1.5"
              placeholder="e.g. First production run complete"
              value={retireReason}
              onChange={e => setRetireReason(e.target.value)}
              rows={2}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setIsRetireOpen(false); setRetireReason(""); }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRetire}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {retireConfig.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Retire Blocks
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
