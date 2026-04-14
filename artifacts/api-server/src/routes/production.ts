import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, appSettingsTable } from "@workspace/db";
import { skuProductionConfigTable, skuTeamMembersTable, teamMembersTable } from "@workspace/db";
import { getAuth } from "@clerk/express";
import { saveProductionConfig } from "../lib/kostr";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

router.get("/skus/:id/production-config", requireAuth, async (req, res): Promise<void> => {
  const skuId = parseInt(req.params.id, 10);
  if (isNaN(skuId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [config] = await db
    .select()
    .from(skuProductionConfigTable)
    .where(eq(skuProductionConfigTable.skuId, skuId))
    .limit(1);

  const teamMemberRows = await db
    .select({ teamMemberId: skuTeamMembersTable.teamMemberId })
    .from(skuTeamMembersTable)
    .where(eq(skuTeamMembersTable.skuId, skuId));

  const teamMemberIds = teamMemberRows.map(r => r.teamMemberId);

  const [daysSetting] = await db
    .select({ value: appSettingsTable.value })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, "operating_days_per_year"))
    .limit(1);
  const operatingDaysPerYear = daysSetting?.value ? parseInt(daysSetting.value, 10) : 250;
  const daysPerMonth = parseFloat((operatingDaysPerYear / 12).toFixed(1));

  if (!config) {
    res.json({ skuId, teamMemberIds, config: null, operatingDaysPerYear, daysPerMonth });
    return;
  }

  res.json({
    skuId,
    teamMemberIds,
    operatingDaysPerYear,
    daysPerMonth,
    config: {
      ...config,
      unitsPerDay: config.unitsPerDay,
      cartonSize: config.cartonSize,
      shiftHours: parseFloat(config.shiftHours),
      productionDaysPerMonth: config.productionDaysPerMonth ?? 20,
      laborCostPerUnit: config.laborCostPerUnit ? parseFloat(config.laborCostPerUnit) : null,
      overheadCostPerUnit: config.overheadCostPerUnit ? parseFloat(config.overheadCostPerUnit) : null,
    }
  });
});

router.post("/skus/:id/production-config", requireAuth, async (req, res): Promise<void> => {
  const skuId = parseInt(req.params.id, 10);
  if (isNaN(skuId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const auth = getAuth(req);
  const { unitsPerDay, cartonSize, shiftHours, productionDaysPerMonth, teamMemberIds, notes, changeReason, changeNote } = req.body;

  const uPD = unitsPerDay != null ? parseInt(unitsPerDay, 10) : null;
  const cS = cartonSize != null ? parseInt(cartonSize, 10) : 1;
  const sH = shiftHours != null ? parseFloat(shiftHours) : 8;
  const dPM = productionDaysPerMonth != null ? parseInt(productionDaysPerMonth, 10) : 20;
  const memberIds: number[] = Array.isArray(teamMemberIds) ? teamMemberIds.map(Number).filter(n => !isNaN(n)) : [];

  const reason = changeReason || "initial";
  const note = changeNote || null;

  const { laborCostPerUnit, overheadCostPerUnit } = await saveProductionConfig(
    skuId,
    { unitsPerDay: uPD, cartonSize: cS, shiftHours: sH, productionDaysPerMonth: dPM, teamMemberIds: memberIds, notes },
    reason,
    note,
    auth.userId
  );

  const [config] = await db
    .select()
    .from(skuProductionConfigTable)
    .where(eq(skuProductionConfigTable.skuId, skuId))
    .limit(1);

  let explanation: string | null = null;
  if (laborCostPerUnit !== null && memberIds.length > 0) {
    const members = await db
      .select({ name: teamMembersTable.name, hourlyWage: teamMembersTable.hourlyWage, oncostPercent: teamMembersTable.oncostPercent })
      .from(teamMembersTable)
      .where(inArray(teamMembersTable.id, memberIds));
    const names = members.map(m => m.name).join(", ");
    const totalRate = members.reduce((s, m) => s + parseFloat(m.hourlyWage) * (1 + parseFloat(m.oncostPercent) / 100), 0);
    const totalUnits = (uPD ?? 0) * cS;
    explanation = `${names} × €${totalRate.toFixed(2)}/hr × ${sH} hrs ÷ ${totalUnits} units = €${laborCostPerUnit.toFixed(4)}/unit`;
  }

  res.json({
    config: config ? {
      ...config,
      unitsPerDay: config.unitsPerDay,
      cartonSize: config.cartonSize,
      shiftHours: parseFloat(config.shiftHours),
      productionDaysPerMonth: config.productionDaysPerMonth ?? 20,
      laborCostPerUnit,
      overheadCostPerUnit,
    } : null,
    teamMemberIds: memberIds,
    laborCostPerUnit,
    overheadCostPerUnit,
    explanation,
  });
});

export default router;
