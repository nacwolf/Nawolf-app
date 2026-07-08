import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
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

  const excludedRows = await db
    .select({ teamMemberId: skuTeamMembersTable.teamMemberId })
    .from(skuTeamMembersTable)
    .where(eq(skuTeamMembersTable.skuId, skuId));
  const excludedMemberIds = excludedRows.map(r => r.teamMemberId);

  const allProductionMembers = await db
    .select()
    .from(teamMembersTable)
    .where(and(eq(teamMembersTable.isActive, true), eq(teamMembersTable.department, "production")))
    .orderBy(teamMembersTable.createdAt);

  const [daysSetting] = await db
    .select({ value: appSettingsTable.value })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, "operating_days_per_year"))
    .limit(1);
  const operatingDaysPerYear = daysSetting?.value ? parseInt(daysSetting.value, 10) : 250;
  const daysPerMonth = parseFloat((operatingDaysPerYear / 12).toFixed(1));

  const formattedMembers = allProductionMembers.map(m => {
    const wage = parseFloat(m.hourlyWage);
    const salary = m.monthlySalary ? parseFloat(m.monthlySalary) : null;
    const oncost = parseFloat(m.oncostPercent);
    const payType = m.payType ?? "hourly";
    let loadedRate: number;
    if (payType === "monthly" && salary !== null) {
      const dpm = config?.productionDaysPerMonth ?? 20;
      loadedRate = (salary * (1 + oncost / 100)) / dpm / 8;
    } else {
      loadedRate = wage * (1 + oncost / 100);
    }
    return {
      id: m.id,
      name: m.name,
      roleDescription: m.roleDescription,
      payType,
      hourlyWage: wage,
      monthlySalary: salary,
      oncostPercent: oncost,
      loadedRate: parseFloat(loadedRate.toFixed(2)),
      excluded: excludedMemberIds.includes(m.id),
    };
  });

  if (!config) {
    res.json({ skuId, excludedMemberIds, allProductionMembers: formattedMembers, config: null, operatingDaysPerYear, daysPerMonth });
    return;
  }

  res.json({
    skuId,
    excludedMemberIds,
    allProductionMembers: formattedMembers,
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
      kwhPerUnit: config.kwhPerUnit ? parseFloat(config.kwhPerUnit) : null,
      litersPerUnit: config.litersPerUnit ? parseFloat(config.litersPerUnit) : null,
      utilitiesCostPerUnit: config.utilitiesCostPerUnit ? parseFloat(config.utilitiesCostPerUnit) : null,
      waterCostPerUnit: config.waterCostPerUnit ? parseFloat(config.waterCostPerUnit) : null,
    }
  });
});

router.post("/skus/:id/production-config", requireAuth, async (req, res): Promise<void> => {
  const skuId = parseInt(req.params.id, 10);
  if (isNaN(skuId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const auth = getAuth(req);
  const { unitsPerDay, cartonSize, shiftHours, productionDaysPerMonth, excludedMemberIds, notes, changeReason, changeNote, kwhPerUnit, litersPerUnit } = req.body;

  const uPD = unitsPerDay != null ? parseInt(unitsPerDay, 10) : null;
  const cS = cartonSize != null ? parseInt(cartonSize, 10) : 1;
  const sH = shiftHours != null ? parseFloat(shiftHours) : 8;
  const dPM = productionDaysPerMonth != null ? parseInt(productionDaysPerMonth, 10) : 20;
  const excludedIds: number[] = Array.isArray(excludedMemberIds) ? excludedMemberIds.map(Number).filter(n => !isNaN(n)) : [];
  const kPU = kwhPerUnit != null ? parseFloat(kwhPerUnit) : null;
  const lPU = litersPerUnit != null ? parseFloat(litersPerUnit) : null;

  const reason = changeReason || "initial";
  const note = changeNote || null;

  const { laborCostPerUnit, overheadCostPerUnit, utilitiesCostPerUnit, waterCostPerUnit } = await saveProductionConfig(
    skuId,
    { unitsPerDay: uPD, cartonSize: cS, shiftHours: sH, productionDaysPerMonth: dPM, excludedMemberIds: excludedIds, notes, kwhPerUnit: kPU, litersPerUnit: lPU },
    reason,
    note,
    auth.userId
  );

  const [config] = await db
    .select()
    .from(skuProductionConfigTable)
    .where(eq(skuProductionConfigTable.skuId, skuId))
    .limit(1);

  const allProductionMembers = await db
    .select()
    .from(teamMembersTable)
    .where(and(eq(teamMembersTable.isActive, true), eq(teamMembersTable.department, "production")))
    .orderBy(teamMembersTable.createdAt);

  const formattedMembers = allProductionMembers.map(m => {
    const wage = parseFloat(m.hourlyWage);
    const salary = m.monthlySalary ? parseFloat(m.monthlySalary) : null;
    const oncost = parseFloat(m.oncostPercent);
    const payType = m.payType ?? "hourly";
    let loadedRate: number;
    if (payType === "monthly" && salary !== null) {
      const dpm = config?.productionDaysPerMonth ?? 20;
      loadedRate = (salary * (1 + oncost / 100)) / dpm / 8;
    } else {
      loadedRate = wage * (1 + oncost / 100);
    }
    return {
      id: m.id,
      name: m.name,
      roleDescription: m.roleDescription,
      payType,
      hourlyWage: wage,
      monthlySalary: salary,
      oncostPercent: oncost,
      loadedRate: parseFloat(loadedRate.toFixed(2)),
      excluded: excludedIds.includes(m.id),
    };
  });

  let explanation: string | null = null;
  const includedMembers = allProductionMembers.filter(m => !excludedIds.includes(m.id));
  if (laborCostPerUnit !== null && includedMembers.length > 0) {
    const names = includedMembers.map(m => m.name).join(", ");
    explanation = `${names} · labor ฿${laborCostPerUnit.toFixed(4)}/unit`;
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
      utilitiesCostPerUnit,
      waterCostPerUnit,
    } : null,
    excludedMemberIds: excludedIds,
    allProductionMembers: formattedMembers,
    laborCostPerUnit,
    overheadCostPerUnit,
    utilitiesCostPerUnit,
    waterCostPerUnit,
    explanation,
  });
});

export default router;
