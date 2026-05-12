import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Users, Info, UserX } from "lucide-react";
import { formatCurrency } from "@/lib/format";

interface TeamMember {
  id: number;
  name: string;
  roleDescription: string | null;
  hourlyWage: number;
  oncostPercent: number;
  loadedRate: number;
  isActive: boolean;
}

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  roleDescription: z.string().optional(),
  hourlyWage: z.coerce.number().min(0.01, "Must be > 0"),
  oncostPercent: z.coerce.number().min(0).max(100).default(25),
});

export default function TeamMembersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<TeamMember | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const { data: members, isLoading } = useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      const r = await fetch(getApiUrl("/team-members"));
      if (!r.ok) throw new Error("Failed to load team members");
      return r.json() as Promise<TeamMember[]>;
    },
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", roleDescription: "", hourlyWage: 15, oncostPercent: 25 },
  });

  const watchedWage = form.watch("hourlyWage");
  const watchedOncost = form.watch("oncostPercent");
  const previewLoadedRate =
    (parseFloat(String(watchedWage)) || 0) * (1 + (parseFloat(String(watchedOncost)) || 0) / 100);

  function openAdd() {
    setEditing(null);
    form.reset({ name: "", roleDescription: "", hourlyWage: 15, oncostPercent: 25 });
    setSheetOpen(true);
  }

  function openEdit(member: TeamMember) {
    setEditing(member);
    form.reset({
      name: member.name,
      roleDescription: member.roleDescription || "",
      hourlyWage: member.hourlyWage,
      oncostPercent: member.oncostPercent,
    });
    setSheetOpen(true);
  }

  async function handleSave(data: z.infer<typeof schema>) {
    try {
      if (editing) {
        const r = await fetch(getApiUrl(`/team-members/${editing.id}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!r.ok) throw new Error("Failed to update");
        const result = await r.json();
        toast({
          title:
            result.affectedSkuCount > 0
              ? `Wage updated — ${result.affectedSkuCount} SKU${result.affectedSkuCount !== 1 ? "s" : ""} recalculated`
              : "Team member updated",
        });
      } else {
        const r = await fetch(getApiUrl("/team-members"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!r.ok) throw new Error("Failed to create");
        toast({ title: "Team member added" });
      }
      qc.invalidateQueries({ queryKey: ["team-members"] });
      setSheetOpen(false);
      setEditing(null);
    } catch {
      toast({ variant: "destructive", title: "Failed to save team member" });
    }
  }

  async function handleDeactivate(member: TeamMember) {
    try {
      const r = await fetch(getApiUrl(`/team-members/${member.id}`), { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to deactivate");
      qc.invalidateQueries({ queryKey: ["team-members"] });
      toast({ title: `${member.name} deactivated` });
    } catch {
      toast({ variant: "destructive", title: "Failed to deactivate team member" });
    } finally {
      setDeactivateTarget(null);
    }
  }

  async function handleReactivate(member: TeamMember) {
    try {
      const r = await fetch(getApiUrl(`/team-members/${member.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      if (!r.ok) throw new Error("Failed to reactivate");
      qc.invalidateQueries({ queryKey: ["team-members"] });
      toast({ title: `${member.name} reactivated` });
    } catch {
      toast({ variant: "destructive", title: "Failed to reactivate" });
    }
  }

  const activeMembers = members?.filter(m => m.isActive) ?? [];
  const inactiveMembers = members?.filter(m => !m.isActive) ?? [];

  return (
    <TooltipProvider>
      <div className="space-y-6">

        {/* ── PAGE HEADER ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Team Members</h1>
            <p className="text-muted-foreground mt-1">
              Set wages once — labor costs update automatically across every SKU
            </p>
          </div>
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 mr-2" />
            Add person
          </Button>
        </div>

        {/* ── ACTIVE MEMBERS CARD ── */}
        <Card className="border-l-4 border-l-orange-500 overflow-hidden">
          <div className="px-6 py-4 bg-orange-50 flex items-center gap-3">
            <Users className="w-4 h-4 text-orange-600 flex-shrink-0" />
            <div>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-orange-700">
                Active Team
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Wages included in labor cost calculations for every SKU with a production setup
              </CardDescription>
            </div>
          </div>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : activeMembers.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">
                No active team members yet.{" "}
                <button onClick={openAdd} className="text-primary hover:underline">
                  Add one →
                </button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="pl-6 text-xs font-medium">Name / Role</TableHead>
                    <TableHead className="text-right text-xs font-medium">Hourly wage</TableHead>
                    <TableHead className="text-right text-xs font-medium">
                      <div className="flex items-center justify-end gap-1">
                        Employer charges
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button">
                              <Info className="w-3 h-3 text-muted-foreground" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-52 text-xs">
                            National insurance, pension, and holiday pay on top of their wage. Use 25% if unsure.
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableHead>
                    <TableHead className="text-right text-xs font-medium text-orange-700">
                      Cost to you / hr
                    </TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeMembers.map(member => (
                    <TableRow
                      key={member.id}
                      className="cursor-pointer group"
                      onClick={() => openEdit(member)}
                    >
                      <TableCell className="pl-6">
                        <div className="font-medium">{member.name}</div>
                        {member.roleDescription && (
                          <div className="text-xs text-muted-foreground">{member.roleDescription}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(member.hourlyWage)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {member.oncostPercent}%
                      </TableCell>
                      <TableCell className="text-right font-semibold text-orange-700 tabular-nums">
                        {formatCurrency(member.loadedRate)}/hr
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={e => { e.stopPropagation(); setDeactivateTarget(member); }}
                            className="p-1 rounded hover:bg-destructive/10 transition-colors"
                            title="Deactivate"
                          >
                            <UserX className="w-3.5 h-3.5 text-destructive" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* ── INACTIVE MEMBERS ── */}
        {inactiveMembers.length > 0 && (
          <div>
            <button
              onClick={() => setShowInactive(v => !v)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {showInactive ? "Hide" : "Show"} {inactiveMembers.length} inactive member
              {inactiveMembers.length !== 1 ? "s" : ""}
            </button>
            {showInactive && (
              <Card className="mt-3 border-l-4 border-l-slate-300 overflow-hidden">
                <div className="px-6 py-3 bg-slate-50">
                  <CardTitle className="text-sm font-medium text-slate-500">Inactive</CardTitle>
                </div>
                <CardContent className="p-0">
                  <Table>
                    <TableBody>
                      {inactiveMembers.map(member => (
                        <TableRow key={member.id} className="group opacity-60">
                          <TableCell className="pl-6">
                            <div className="font-medium">{member.name}</div>
                            {member.roleDescription && (
                              <div className="text-xs text-muted-foreground">
                                {member.roleDescription}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {formatCurrency(member.hourlyWage)}/hr
                          </TableCell>
                          <TableCell className="pr-6 text-right">
                            <button
                              onClick={() => handleReactivate(member)}
                              className="text-xs text-primary hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              Reactivate
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── ADD / EDIT SHEET ── */}
        <Sheet
          open={sheetOpen}
          onOpenChange={o => { if (!o) { setSheetOpen(false); setEditing(null); } }}
        >
          <SheetContent className="sm:max-w-md overflow-y-auto">
            <SheetHeader className="pb-4">
              <SheetTitle>{editing ? "Edit team member" : "Add team member"}</SheetTitle>
              <SheetDescription>
                Set their wage once — labor costs update across all products automatically.
              </SheetDescription>
            </SheetHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g. "Marco" or "Ana — baker"' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="roleDescription" render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      What they do{" "}
                      <span className="text-muted-foreground font-normal">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Production + packing"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="hourlyWage" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hourly wage (฿)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">฿</span>
                        <Input type="number" step="0.01" min="0" className="pl-7" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="oncostPercent" render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <div className="flex items-center gap-1.5">
                        Employer charges on top of wages
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button">
                              <Info className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-60 text-xs">
                            National insurance, pension, and holiday pay on top of their wage.
                            Use 25% if unsure.
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          max="100"
                          className="w-24"
                          {...field}
                        />
                      </FormControl>
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />
                {previewLoadedRate > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-sm">
                    <span className="text-muted-foreground">This person costs you </span>
                    <span className="font-bold text-orange-700">
                      {formatCurrency(previewLoadedRate)}/hr
                    </span>
                    <span className="text-muted-foreground"> including all charges</span>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex-1"
                    onClick={() => { setSheetOpen(false); setEditing(null); }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1">Save</Button>
                </div>
              </form>
            </Form>
          </SheetContent>
        </Sheet>

        {/* ── DEACTIVATE CONFIRMATION ── */}
        <AlertDialog
          open={deactivateTarget !== null}
          onOpenChange={o => { if (!o) setDeactivateTarget(null); }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deactivate {deactivateTarget?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                They will be excluded from all future labor cost calculations. Existing SKU snapshots
                are not changed. You can reactivate them at any time.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deactivateTarget && handleDeactivate(deactivateTarget)}
              >
                Deactivate
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </TooltipProvider>
  );
}
