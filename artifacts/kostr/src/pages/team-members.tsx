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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Info, UserX, Briefcase, Factory } from "lucide-react";
import { formatCurrency } from "@/lib/format";

interface TeamMember {
  id: number;
  name: string;
  roleDescription: string | null;
  department: "management" | "production";
  payType: "hourly" | "monthly";
  hourlyWage: number;
  monthlySalary: number | null;
  oncostPercent: number;
  loadedRate: number;
  isActive: boolean;
}

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  roleDescription: z.string().optional(),
  department: z.enum(["management", "production"]).default("production"),
  payType: z.enum(["hourly", "monthly"]).default("hourly"),
  hourlyWage: z.coerce.number().min(0).default(0),
  monthlySalary: z.coerce.number().min(0).default(0),
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
    defaultValues: { name: "", roleDescription: "", department: "production", payType: "hourly", hourlyWage: 0, monthlySalary: 0, oncostPercent: 25 },
  });

  const watchedPayType = form.watch("payType");
  const watchedDept = form.watch("department");
  const watchedWage = form.watch("hourlyWage");
  const watchedSalary = form.watch("monthlySalary");
  const watchedOncost = form.watch("oncostPercent");

  const previewLoadedRate = watchedPayType === "monthly"
    ? (parseFloat(String(watchedSalary)) || 0) * (1 + (parseFloat(String(watchedOncost)) || 0) / 100)
    : (parseFloat(String(watchedWage)) || 0) * (1 + (parseFloat(String(watchedOncost)) || 0) / 100);

  const previewMonthlyCost = watchedPayType === "monthly"
    ? (parseFloat(String(watchedSalary)) || 0) * (1 + (parseFloat(String(watchedOncost)) || 0) / 100)
    : (parseFloat(String(watchedWage)) || 0) * (1 + (parseFloat(String(watchedOncost)) || 0) / 100) * 8 * 20;

  function openAdd() {
    setEditing(null);
    form.reset({ name: "", roleDescription: "", department: "production", payType: "hourly", hourlyWage: 0, monthlySalary: 0, oncostPercent: 25 });
    setSheetOpen(true);
  }

  function openEdit(member: TeamMember) {
    setEditing(member);
    form.reset({
      name: member.name,
      roleDescription: member.roleDescription || "",
      department: member.department || "production",
      payType: member.payType || "hourly",
      hourlyWage: member.hourlyWage || 0,
      monthlySalary: member.monthlySalary || 0,
      oncostPercent: member.oncostPercent,
    });
    setSheetOpen(true);
  }

  async function handleSave(data: z.infer<typeof schema>) {
    try {
      if (data.department === "production" && data.payType === "hourly" && (!data.hourlyWage || data.hourlyWage <= 0)) {
        toast({ variant: "destructive", title: "Hourly wage must be greater than 0" });
        return;
      }
      if (data.department === "production" && data.payType === "monthly" && (!data.monthlySalary || data.monthlySalary <= 0)) {
        toast({ variant: "destructive", title: "Monthly salary must be greater than 0" });
        return;
      }

      const payload: any = {
        name: data.name,
        roleDescription: data.roleDescription,
        department: data.department,
        payType: data.payType,
        oncostPercent: data.oncostPercent,
      };
      if (data.payType === "hourly") {
        payload.hourlyWage = data.hourlyWage;
        payload.monthlySalary = null;
      } else {
        payload.monthlySalary = data.monthlySalary;
        payload.hourlyWage = 0;
      }

      if (editing) {
        const r = await fetch(getApiUrl(`/team-members/${editing.id}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error("Failed to update");
        const result = await r.json();
        toast({
          title: result.affectedSkuCount > 0
            ? `Updated — ${result.affectedSkuCount} SKU${result.affectedSkuCount !== 1 ? "s" : ""} recalculated`
            : "Team member updated",
        });
      } else {
        const r = await fetch(getApiUrl("/team-members"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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
  const activeManagement = activeMembers.filter(m => m.department === "management");
  const activeProduction = activeMembers.filter(m => m.department !== "management");

  function renderMemberRow(member: TeamMember) {
    const isMonthly = member.payType === "monthly";
    return (
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
          {isMonthly ? (
            <div>
              <div>{formatCurrency(member.monthlySalary ?? 0)}</div>
              <div className="text-[10px] text-muted-foreground">per month</div>
            </div>
          ) : (
            <div>{formatCurrency(member.hourlyWage)}/hr</div>
          )}
        </TableCell>
        <TableCell className="text-right text-muted-foreground tabular-nums">
          {member.oncostPercent}%
        </TableCell>
        <TableCell className="text-right font-semibold text-orange-700 tabular-nums">
          {isMonthly ? (
            <div>
              <div>{formatCurrency((member.monthlySalary ?? 0) * (1 + member.oncostPercent / 100))}</div>
              <div className="text-[10px] font-normal text-orange-600">cost/month</div>
            </div>
          ) : (
            <div>{formatCurrency(member.loadedRate)}/hr</div>
          )}
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
    );
  }

  function renderSection(
    title: string,
    description: string,
    icon: React.ReactNode,
    colorClass: string,
    headerBg: string,
    members: TeamMember[],
    emptyMsg: string
  ) {
    return (
      <Card className={`border-l-4 ${colorClass} overflow-hidden`}>
        <div className={`px-6 py-4 ${headerBg} flex items-center gap-3`}>
          <div className="flex-shrink-0">{icon}</div>
          <div>
            <CardTitle className="text-sm font-bold uppercase tracking-wider" style={{ color: "inherit" }}>
              {title}
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
          </div>
          <div className="ml-auto">
            <span className="text-xs font-medium text-muted-foreground">{members.length} active</span>
          </div>
        </div>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {[1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : members.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {emptyMsg}{" "}
              <button onClick={openAdd} className="text-primary hover:underline">
                Add one →
              </button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-6 text-xs font-medium">Name / Role</TableHead>
                  <TableHead className="text-right text-xs font-medium">Pay</TableHead>
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
                    Cost to you
                  </TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map(renderMemberRow)}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">

        {/* ── PAGE HEADER ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Team</h1>
            <p className="text-muted-foreground mt-1">
              Production wages update labor costs automatically across every SKU
            </p>
          </div>
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 mr-2" />
            Add person
          </Button>
        </div>

        {/* ── PRODUCTION SECTION ── */}
        {renderSection(
          "Production",
          "These people's wages flow into labor cost on every SKU. You can adjust who's included per product.",
          <Factory className="w-4 h-4 text-orange-600" />,
          "border-l-orange-500",
          "bg-orange-50",
          activeProduction,
          "No production staff yet.",
        )}

        {/* ── MANAGEMENT SECTION ── */}
        {renderSection(
          "Management",
          "Administrators and managers — not included in production labor cost.",
          <Briefcase className="w-4 h-4 text-blue-600" />,
          "border-l-blue-500",
          "bg-blue-50",
          activeManagement,
          "No management staff yet.",
        )}

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
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {member.department === "management" ? "Management" : "Production"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {member.payType === "monthly"
                              ? `${formatCurrency(member.monthlySalary ?? 0)}/mo`
                              : `${formatCurrency(member.hourlyWage)}/hr`
                            }
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
                {watchedDept === "production"
                  ? "Production wages update SKU labor costs automatically."
                  : "Management staff are not included in production costs."}
              </SheetDescription>
            </SheetHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">

                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g. "Ana" or "Marco — baker"' {...field} />
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

                <FormField control={form.control} name="department" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="production">
                          <div className="flex items-center gap-2">
                            <Factory className="w-3.5 h-3.5 text-orange-600" />
                            Production
                          </div>
                        </SelectItem>
                        <SelectItem value="management">
                          <div className="flex items-center gap-2">
                            <Briefcase className="w-3.5 h-3.5 text-blue-600" />
                            Management
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                {watchedDept === "production" && (
                  <FormField control={form.control} name="payType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>How are they paid?</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="hourly">Hourly wage</SelectItem>
                          <SelectItem value="monthly">Monthly salary</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}

                {watchedDept === "production" && watchedPayType === "hourly" && (
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
                )}

                {watchedDept === "production" && watchedPayType === "monthly" && (
                  <FormField control={form.control} name="monthlySalary" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monthly salary (฿)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">฿</span>
                          <Input type="number" step="100" min="0" className="pl-7" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}

                {watchedDept === "production" && (
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
                )}

                {watchedDept === "production" && previewMonthlyCost > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-sm space-y-1">
                    {watchedPayType === "monthly" ? (
                      <>
                        <div>
                          <span className="text-muted-foreground">Monthly cost to you </span>
                          <span className="font-bold text-orange-700">
                            {formatCurrency(previewLoadedRate)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Amortized to ฿{((previewLoadedRate) / 20 / 8).toFixed(2)}/hr equivalent (20 days × 8 hrs)
                        </div>
                      </>
                    ) : (
                      <div>
                        <span className="text-muted-foreground">This person costs you </span>
                        <span className="font-bold text-orange-700">
                          {formatCurrency(previewLoadedRate)}/hr
                        </span>
                        <span className="text-muted-foreground"> including all charges</span>
                      </div>
                    )}
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
                {deactivateTarget?.department === "production"
                  ? "They will be removed from all SKU labor cost calculations. Existing snapshots are not changed. You can reactivate them at any time."
                  : "They will be deactivated. You can reactivate them at any time."}
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
