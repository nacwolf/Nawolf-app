import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
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
  const oncost = oncostPercent != null ? parseFloat(oncostPercent) : 25;

  let wageVal = "0";
  let salaryVal: string | null = null;

  if (pType === "monthly") {
    const sal = parseFloat(monthlySalary);
    if (isNaN(sal) || sal <= 0) { res.status(400).json({ error: "monthlySalary must be > 0 for monthly pay type" }); return; }
    salaryVal = sal.toFixed(2);
  } else {
    const wage = parseFloat(hourlyWage);
    if (isNaN(wage) || wage <= 0) { res.status(400).json({ error: "hourlyWage must be > 0 for hourly pay type" }); return; }
    wageVal = wage.toFixed(2);
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

  res.status(201).json(formatMember(member));
});

router.patch("/team-members/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { name, roleDescription, hourlyWage, monthlySalary, oncostPercent, isActive, department, payType } = req.body;
  const updateData: Record<string, any> = {};

  if (name != null) updateData.name = name.trim();
  if (roleDescription !== undefined) updateData.roleDescription = roleDescription?.trim() || null;
  if (department != null) updateData.department = department;
  if (payType != null) updateData.payType = payType;
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
  if (isActive != null) updateData.isActive = isActive;

  if (Object.keys(updateData).length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }

  const [member] = await db.update(teamMembersTable).set(updateData).where(eq(teamMembersTable.id, id)).returning();
  if (!member) { res.status(404).json({ error: "Not found" }); return; }

  const compensationChanged = hourlyWage != null || monthlySalary !== undefined || oncostPercent != null;
  let affectedSkuCount = 0;
  if (compensationChanged) {
    affectedSkuCount = await recalculateAllSkusForTeamChange(`team_member_wage_update:${id}`);
  }

  res.json({ member: formatMember(member), affectedSkuCount });
});

router.delete("/team-members/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [m] = await db.update(teamMembersTable).set({ isActive: false }).where(eq(teamMembersTable.id, id)).returning();
  if (!m) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatMember(m));
});

export default router;
