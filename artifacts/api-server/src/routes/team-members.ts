import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { teamMembersTable } from "@workspace/db";
import { getAuth } from "@clerk/express";
import { recalculateAllSkusForTeamChange } from "../lib/kostr";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

function formatMember(m: typeof teamMembersTable.$inferSelect) {
  const wage = parseFloat(m.hourlyWage);
  const salary = m.monthlySalary ? parseFloat(m.monthlySalary) : null;
  const oncost = parseFloat(m.oncostPercent);
  const department = m.department ?? "production";
  const payType = m.payType ?? "hourly";

  let loadedRate: number;
  if (payType === "monthly" && salary !== null) {
    const daysPerMonth = 20;
    const hoursPerDay = 8;
    loadedRate = (salary * (1 + oncost / 100)) / daysPerMonth / hoursPerDay;
  } else {
    loadedRate = wage * (1 + oncost / 100);
  }

  return {
    ...m,
    hourlyWage: wage,
    monthlySalary: salary,
    oncostPercent: oncost,
    department,
    payType,
    loadedRate: parseFloat(loadedRate.toFixed(2)),
  };
}

router.get("/team-members", requireAuth, async (req, res): Promise<void> => {
  const members = await db.select().from(teamMembersTable).orderBy(teamMembersTable.createdAt);
  res.json(members.map(formatMember));
});

router.post("/team-members", requireAuth, async (req, res): Promise<void> => {
  const { name, roleDescription, hourlyWage, monthlySalary, oncostPercent, department, payType } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: "Name is required" }); return; }

  const dept = department || "production";
  const pType = payType || "hourly";

  if (!["production", "management"].includes(dept)) { res.status(400).json({ error: "department must be 'production' or 'management'" }); return; }
  if (!["hourly", "monthly"].includes(pType)) { res.status(400).json({ error: "payType must be 'hourly' or 'monthly'" }); return; }

  const oncost = oncostPercent != null ? parseFloat(oncostPercent) : 25;

  let wageVal = "0";
  let salaryVal: string | null = null;

  if (dept === "production") {
    if (pType === "monthly") {
      const sal = parseFloat(monthlySalary);
      if (isNaN(sal) || sal <= 0) { res.status(400).json({ error: "monthlySalary must be > 0 for monthly production staff" }); return; }
      salaryVal = sal.toFixed(2);
    } else {
      const wage = parseFloat(hourlyWage);
      if (isNaN(wage) || wage <= 0) { res.status(400).json({ error: "hourlyWage must be > 0 for hourly production staff" }); return; }
      wageVal = wage.toFixed(2);
    }
  } else {
    if (pType === "monthly" && monthlySalary != null) {
      const sal = parseFloat(monthlySalary);
      if (!isNaN(sal) && sal > 0) salaryVal = sal.toFixed(2);
    } else if (hourlyWage != null) {
      const wage = parseFloat(hourlyWage);
      if (!isNaN(wage) && wage >= 0) wageVal = wage.toFixed(2);
    }
  }

  const [member] = await db.insert(teamMembersTable).values({
    name: name.trim(),
    roleDescription: roleDescription?.trim() || null,
    department: dept,
    payType: pType,
    hourlyWage: wageVal,
    monthlySalary: salaryVal,
    oncostPercent: oncost.toFixed(2),
  }).returning();

  let affectedSkuCount = 0;
  if (dept === "production") {
    affectedSkuCount = await recalculateAllSkusForTeamChange(`team_member_created:${member.id}`);
  }

  res.status(201).json({ member: formatMember(member), affectedSkuCount });
});

router.patch("/team-members/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { name, roleDescription, hourlyWage, monthlySalary, oncostPercent, isActive, department, payType } = req.body;

  const [existing] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const updateData: Record<string, any> = {};

  if (department != null && !["production", "management"].includes(department)) {
    res.status(400).json({ error: "department must be 'production' or 'management'" }); return;
  }
  if (payType != null && !["hourly", "monthly"].includes(payType)) {
    res.status(400).json({ error: "payType must be 'hourly' or 'monthly'" }); return;
  }

  if (name != null) updateData.name = name.trim();
  if (roleDescription !== undefined) updateData.roleDescription = roleDescription?.trim() || null;
  if (department != null) updateData.department = department;
  if (payType != null) updateData.payType = payType;
  if (isActive != null) updateData.isActive = isActive;

  if (hourlyWage != null) {
    const w = parseFloat(hourlyWage);
    if (isNaN(w) || w < 0) { res.status(400).json({ error: "hourlyWage must be >= 0" }); return; }
    updateData.hourlyWage = w.toFixed(2);
  }
  if (monthlySalary !== undefined) {
    if (monthlySalary === null || monthlySalary === "") {
      updateData.monthlySalary = null;
    } else {
      const s = parseFloat(monthlySalary);
      if (!isNaN(s)) updateData.monthlySalary = s.toFixed(2);
    }
  }
  if (oncostPercent != null) updateData.oncostPercent = parseFloat(oncostPercent).toFixed(2);

  const effectiveDept = (department ?? existing.department ?? "production") as string;
  const effectivePayType = (payType ?? existing.payType ?? "hourly") as string;

  if (effectiveDept === "production") {
    const finalWage = updateData.hourlyWage != null ? parseFloat(updateData.hourlyWage) : parseFloat(existing.hourlyWage);
    const finalSalary = updateData.monthlySalary != null
      ? parseFloat(updateData.monthlySalary)
      : (existing.monthlySalary ? parseFloat(existing.monthlySalary) : null);

    if (effectivePayType === "hourly" && (isNaN(finalWage) || finalWage <= 0)) {
      res.status(400).json({ error: "hourlyWage must be > 0 for hourly production staff" }); return;
    }
    if (effectivePayType === "monthly" && (finalSalary == null || isNaN(finalSalary) || finalSalary <= 0)) {
      res.status(400).json({ error: "monthlySalary must be > 0 for monthly production staff" }); return;
    }
  }

  if (Object.keys(updateData).length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }

  const [member] = await db.update(teamMembersTable).set(updateData).where(eq(teamMembersTable.id, id)).returning();
  if (!member) { res.status(404).json({ error: "Not found" }); return; }

  const wasOrIsProduction = existing.department === "production" || effectiveDept === "production";
  const affectsLaborCost = (
    hourlyWage != null ||
    monthlySalary !== undefined ||
    oncostPercent != null ||
    isActive != null ||
    department != null ||
    payType != null
  );

  let affectedSkuCount = 0;
  if (affectsLaborCost && wasOrIsProduction) {
    affectedSkuCount = await recalculateAllSkusForTeamChange(`team_member_updated:${id}`);
  }

  res.json({ member: formatMember(member), affectedSkuCount });
});

router.delete("/team-members/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const [m] = await db.update(teamMembersTable).set({ isActive: false }).where(eq(teamMembersTable.id, id)).returning();
  if (!m) { res.status(404).json({ error: "Not found" }); return; }

  if (existing.department === "production") {
    await recalculateAllSkusForTeamChange(`team_member_deactivated:${id}`);
  }

  res.json(formatMember(m));
});

export default router;
