import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { skuProductionConfigTable, skuTeamMembersTable, teamMembersTable } from "@workspace/db";
import { getAuth } from "@clerk/express";
import { calculateLaborCostPerUnit, snapshotSku, updateProductionConfigLabor } from "../lib/kostr";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

router.get("/skus/:id/production-config", requireAuth, async (req, res): Promise<void> => {
  const skuId = parseInt(req.params.id, 10);
  if (isNaN(skuId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [config] = await db.select().from(skuProductionConfigTable).where(eq(skuProductionConfigTable.skuId, skuId)).limit(1);

  const teamMemberRows = await db
    .select({ teamMemberId: skuTeamMembersTable.teamMemberId })
    .from(skuTeamMembersTable)
    .where(eq(skuTeamMembersTable.skuId, skuId));

  const teamMemberIds = teamMemberRows.map(r => r.teamMemberId);
  const laborCostPerUnit = await calculateLaborCostPerUnit(skuId);

  if (!config) {
    res.json({ skuId, teamMemberIds, laborCostPerUnit, config: null });
    return;
  }

  res.json({
    skuId,
    teamMemberIds,
    laborCostPerUnit,
    config: {
      ...config,
      unitsPerDay: config.unitsPerDay,
      cartonSize: config.cartonSize,
      shiftHours: parseFloat(config.shiftHours),
      laborCostPerUnit: config.laborCostPerUnit ? parseFloat(config.laborCostPerUnit) : null,
    }
  });
});

router.post("/skus/:id/production-config", requireAuth, async (req, res): Promise<void> => {
  const skuId = parseInt(req.params.id, 10);
  if (isNaN(skuId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { unitsPerDay, cartonSize, shiftHours, teamMemberIds, notes } = req.body;

  const uPD = unitsPerDay != null ? parseInt(unitsPerDay, 10) : null;
  const cS = cartonSize != null ? parseInt(cartonSize, 10) : 1;
  const sH = shiftHours != null ? parseFloat(shiftHours) : 8;
  const memberIds: number[] = Array.isArray(teamMemberIds) ? teamMemberIds.map(Number).filter(n => !isNaN(n)) : [];

  const [existing] = await db.select().from(skuProductionConfigTable).where(eq(skuProductionConfigTable.skuId, skuId)).limit(1);

  if (existing) {
    await db.update(skuProductionConfigTable).set({
      unitsPerDay: uPD,
      cartonSize: cS,
      shiftHours: sH.toFixed(2),
      notes: notes || null,
      updatedAt: new Date(),
    }).where(eq(skuProductionConfigTable.skuId, skuId));
  } else {
    await db.insert(skuProductionConfigTable).values({
      skuId,
      unitsPerDay: uPD,
      cartonSize: cS,
      shiftHours: sH.toFixed(2),
      notes: notes || null,
    });
  }

  await db.delete(skuTeamMembersTable).where(eq(skuTeamMembersTable.skuId, skuId));
  if (memberIds.length > 0) {
    await db.insert(skuTeamMembersTable).values(memberIds.map(tid => ({ skuId, teamMemberId: tid })));
  }

  const laborCost = await updateProductionConfigLabor(skuId);
  await snapshotSku(skuId, "production_config_updated");

  const [config] = await db.select().from(skuProductionConfigTable).where(eq(skuProductionConfigTable.skuId, skuId)).limit(1);

  let explanation: string | null = null;
  if (laborCost !== null && memberIds.length > 0) {
    const members = await db.select({ name: teamMembersTable.name, hourlyWage: teamMembersTable.hourlyWage, oncostPercent: teamMembersTable.oncostPercent })
      .from(teamMembersTable).where(inArray(teamMembersTable.id, memberIds));
    const names = members.map(m => m.name).join(", ");
    const totalRate = members.reduce((s, m) => s + parseFloat(m.hourlyWage) * (1 + parseFloat(m.oncostPercent) / 100), 0);
    const totalUnits = (uPD ?? 0) * cS;
    explanation = `${names} × €${totalRate.toFixed(2)}/hr × ${sH} hrs ÷ ${totalUnits} units = €${laborCost.toFixed(4)}/unit`;
  }

  res.json({
    config: config ? {
      ...config,
      unitsPerDay: config.unitsPerDay,
      cartonSize: config.cartonSize,
      shiftHours: parseFloat(config.shiftHours),
      laborCostPerUnit: laborCost,
    } : null,
    teamMemberIds: memberIds,
    laborCostPerUnit: laborCost,
    explanation,
  });
});

export default router;
