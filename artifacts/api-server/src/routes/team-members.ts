import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { teamMembersTable } from "@workspace/db";
import { getAuth } from "@clerk/express";
import { recalculateAllSkusUsingTeamMember } from "../lib/kostr";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

function formatMember(m: typeof teamMembersTable.$inferSelect) {
  const wage = parseFloat(m.hourlyWage);
  const oncost = parseFloat(m.oncostPercent);
  const loadedRate = wage * (1 + oncost / 100);
  return { ...m, hourlyWage: wage, oncostPercent: oncost, loadedRate: parseFloat(loadedRate.toFixed(2)) };
}

router.get("/team-members", requireAuth, async (req, res): Promise<void> => {
  const members = await db.select().from(teamMembersTable).orderBy(teamMembersTable.createdAt);
  res.json(members.map(formatMember));
});

router.post("/team-members", requireAuth, async (req, res): Promise<void> => {
  const { name, roleDescription, hourlyWage, oncostPercent } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: "Name is required" }); return; }
  const wage = parseFloat(hourlyWage);
  if (isNaN(wage) || wage <= 0) { res.status(400).json({ error: "hourlyWage must be > 0" }); return; }
  const oncost = oncostPercent != null ? parseFloat(oncostPercent) : 25;

  const [member] = await db.insert(teamMembersTable).values({
    name: name.trim(),
    roleDescription: roleDescription?.trim() || null,
    hourlyWage: wage.toFixed(2),
    oncostPercent: oncost.toFixed(2),
  }).returning();

  res.status(201).json(formatMember(member));
});

router.patch("/team-members/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { name, roleDescription, hourlyWage, oncostPercent, isActive } = req.body;
  const updateData: Record<string, any> = {};
  if (name != null) updateData.name = name.trim();
  if (roleDescription !== undefined) updateData.roleDescription = roleDescription?.trim() || null;
  if (hourlyWage != null) {
    const w = parseFloat(hourlyWage);
    if (isNaN(w) || w <= 0) { res.status(400).json({ error: "hourlyWage must be > 0" }); return; }
    updateData.hourlyWage = w.toFixed(2);
  }
  if (oncostPercent != null) updateData.oncostPercent = parseFloat(oncostPercent).toFixed(2);
  if (isActive != null) updateData.isActive = isActive;

  if (Object.keys(updateData).length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }

  const [member] = await db.update(teamMembersTable).set(updateData).where(eq(teamMembersTable.id, id)).returning();
  if (!member) { res.status(404).json({ error: "Not found" }); return; }

  const wageChanged = hourlyWage != null || oncostPercent != null;
  let affectedSkuCount = 0;
  if (wageChanged) {
    affectedSkuCount = await recalculateAllSkusUsingTeamMember(id, `team_member_wage_update:${id}`);
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
