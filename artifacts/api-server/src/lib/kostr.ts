import { db, ingredientsTable, ingredientPricesTable, skusTable, costLinesTable, skuSnapshotsTable, packagingItemsTable } from "@workspace/db";
import { teamMembersTable, skuProductionConfigTable, skuTeamMembersTable, overheadItemsTable, appSettingsTable, productionConfigHistoryTable } from "@workspace/db";
import { eq, desc, sql, inArray, and, notInArray } from "drizzle-orm";
import { logger } from "./logger";
import { computeMarginStatus, laborCostPerUnit, overheadCostPerUnit, meteredCostPerUnit, computeCogs, type ProductionInputs } from "./costing";

async function getAppSetting(key: string): Promise<string | null> {
  const [row] = await db.select({ value: appSettingsTable.value }).from(appSettingsTable).where(eq(appSettingsTable.key, key)).limit(1);
  return row?.value ?? null;
}

export { computeMarginStatus } from "./costing";

export async function getCurrentPrice(ingredientId: number): Promise<number | null> {
  const [row] = await db
    .select({ price: ingredientPricesTable.price })
    .from(ingredientPricesTable)
    .where(eq(ingredientPricesTable.ingredientId, ingredientId))
    .orderBy(desc(ingredientPricesTable.effectiveDate), desc(ingredientPricesTable.createdAt))
    .limit(1);
  return row ? parseFloat(row.price) : null;
}

async function loadProductionInputs(skuId: number) {
  const [config] = await db.select().from(skuProductionConfigTable).where(eq(skuProductionConfigTable.skuId, skuId)).limit(1);
  if (!config || !config.unitsPerDay) return null;
  return {
    config,
    inputs: {
      unitsPerDay: config.unitsPerDay,
      cartonSize: config.cartonSize ?? 1,
      shiftHours: parseFloat(config.shiftHours ?? "8"),
      productionDaysPerMonth: config.productionDaysPerMonth ?? 20,
    } satisfies ProductionInputs,
  };
}

const num = (v: string | null | undefined) => (v == null || v === "" ? null : parseFloat(v));

export async function calculateLaborCostPerUnit(skuId: number): Promise<number | null> {
  const loaded = await loadProductionInputs(skuId);
  if (!loaded) return null;

  const excludedRows = await db
    .select({ teamMemberId: skuTeamMembersTable.teamMemberId })
    .from(skuTeamMembersTable)
    .where(eq(skuTeamMembersTable.skuId, skuId));
  const excludedIds = excludedRows.map(r => r.teamMemberId);

  const members = await db
    .select({
      hourlyWage: teamMembersTable.hourlyWage,
      monthlySalary: teamMembersTable.monthlySalary,
      oncostPercent: teamMembersTable.oncostPercent,
      payType: teamMembersTable.payType,
    })
    .from(teamMembersTable)
    .where(
      and(
        eq(teamMembersTable.isActive, true),
        eq(teamMembersTable.department, "production"),
        ...(excludedIds.length > 0 ? [notInArray(teamMembersTable.id, excludedIds)] : [])
      )
    );

  return laborCostPerUnit(loaded.inputs, members.map(m => ({
    payType: m.payType,
    hourlyWage: parseFloat(m.hourlyWage),
    monthlySalary: num(m.monthlySalary),
    oncostPercent: parseFloat(m.oncostPercent),
  })));
}

export async function calculateOverheadPerUnit(skuId: number): Promise<number | null> {
  const loaded = await loadProductionInputs(skuId);
  if (!loaded) return null;
  const items = await db.select().from(overheadItemsTable).where(eq(overheadItemsTable.isActive, true));
  return overheadCostPerUnit(loaded.inputs, items.map(i => ({ monthlyAmount: parseFloat(i.monthlyAmount), frequency: i.frequency })));
}

export async function calculateUtilitiesCostPerUnit(skuId: number): Promise<number | null> {
  const loaded = await loadProductionInputs(skuId);
  if (!loaded) return null;
  return meteredCostPerUnit(
    loaded.inputs,
    num(loaded.config.kwhPerUnit),
    num(await getAppSetting("electricity_rate_per_kwh")),
    num(await getAppSetting("utilities_monthly_cost")),
  );
}

export async function calculateWaterCostPerUnit(skuId: number): Promise<number | null> {
  const loaded = await loadProductionInputs(skuId);
  if (!loaded) return null;
  return meteredCostPerUnit(
    loaded.inputs,
    num(loaded.config.litersPerUnit),
    num(await getAppSetting("water_rate_per_liter")),
    num(await getAppSetting("water_monthly_cost")),
  );
}

export async function updateProductionConfigLabor(skuId: number): Promise<number | null> {
  const labor = await calculateLaborCostPerUnit(skuId);
  if (labor !== null) {
    await db
      .update(skuProductionConfigTable)
      .set({ laborCostPerUnit: labor.toFixed(6), updatedAt: new Date() })
      .where(eq(skuProductionConfigTable.skuId, skuId));
  }
  return labor;
}

export async function recalculateSkuCogs(skuId: number): Promise<{ totalCogs: number | null; grossMargin: number | null }> {
  const sku = await db.select().from(skusTable).where(eq(skusTable.id, skuId)).limit(1);
  if (!sku[0]) return { totalCogs: null, grossMargin: null };

  let costLines: { ingredientId: number | null; packagingItemId: number | null; quantityPerUnit: string }[] = [];
  try {
    costLines = await db
      .select({
        ingredientId: costLinesTable.ingredientId,
        packagingItemId: costLinesTable.packagingItemId,
        quantityPerUnit: costLinesTable.quantityPerUnit,
      })
      .from(costLinesTable)
      .where(eq(costLinesTable.skuId, skuId));
  } catch {
    const rows = await db
      .select({ ingredientId: costLinesTable.ingredientId, quantityPerUnit: costLinesTable.quantityPerUnit })
      .from(costLinesTable)
      .where(eq(costLinesTable.skuId, skuId));
    costLines = rows.map(r => ({ ...r, packagingItemId: null }));
  }

  const [prodConfig] = await db
    .select({ laborCostPerUnit: skuProductionConfigTable.laborCostPerUnit, overheadCostPerUnit: skuProductionConfigTable.overheadCostPerUnit, utilitiesCostPerUnit: skuProductionConfigTable.utilitiesCostPerUnit, waterCostPerUnit: skuProductionConfigTable.waterCostPerUnit })
    .from(skuProductionConfigTable)
    .where(eq(skuProductionConfigTable.skuId, skuId))
    .limit(1);

  const laborCost = prodConfig?.laborCostPerUnit ? parseFloat(prodConfig.laborCostPerUnit) : null;
  const overheadCost = prodConfig?.overheadCostPerUnit ? parseFloat(prodConfig.overheadCostPerUnit) : null;
  const utilitiesCost = prodConfig?.utilitiesCostPerUnit ? parseFloat(prodConfig.utilitiesCostPerUnit) : null;
  const waterCost = prodConfig?.waterCostPerUnit ? parseFloat(prodConfig.waterCostPerUnit) : null;

  const materialLines: { unitPrice: number | null; quantityPerUnit: number }[] = [];
  for (const line of costLines) {
    let unitPrice: number | null = null;
    if (line.packagingItemId != null) {
      const [pkg] = await db.select({ unitCost: packagingItemsTable.unitCost }).from(packagingItemsTable).where(eq(packagingItemsTable.id, line.packagingItemId)).limit(1);
      unitPrice = pkg ? parseFloat(pkg.unitCost) : null;
    } else if (line.ingredientId != null) {
      unitPrice = await getCurrentPrice(line.ingredientId);
    } else continue;
    materialLines.push({ unitPrice, quantityPerUnit: parseFloat(line.quantityPerUnit) });
  }

  return computeCogs({
    materialLines,
    perUnitCosts: [laborCost, overheadCost, utilitiesCost, waterCost],
    sellPrice: parseFloat(sku[0].sellPrice),
  });
}

export async function snapshotSku(skuId: number, triggeredBy: string): Promise<void> {
  const { totalCogs, grossMargin } = await recalculateSkuCogs(skuId);
  if (totalCogs === null || grossMargin === null) return;

  const sku = await db.select().from(skusTable).where(eq(skusTable.id, skuId)).limit(1);
  if (!sku[0]) return;

  const today = new Date().toISOString().split("T")[0];

  await db.insert(skuSnapshotsTable).values({
    skuId,
    snapshotDate: today,
    totalCogs: totalCogs.toFixed(4),
    sellPrice: sku[0].sellPrice,
    grossMargin: grossMargin.toFixed(6),
    triggeredBy,
  });
}

export async function saveProductionConfig(
  skuId: number,
  inputs: {
    unitsPerDay: number | null;
    cartonSize: number;
    shiftHours: number;
    productionDaysPerMonth: number;
    excludedMemberIds: number[];
    notes?: string | null;
    kwhPerUnit?: number | null;
    litersPerUnit?: number | null;
  },
  changeReason: string,
  changeNote: string | null,
  createdBy?: string | null
): Promise<{ laborCostPerUnit: number | null; overheadCostPerUnit: number | null; utilitiesCostPerUnit: number | null; waterCostPerUnit: number | null }> {
  const { unitsPerDay, cartonSize, shiftHours, productionDaysPerMonth, excludedMemberIds, notes, kwhPerUnit, litersPerUnit } = inputs;

  const [existing] = await db.select().from(skuProductionConfigTable).where(eq(skuProductionConfigTable.skuId, skuId)).limit(1);

  if (existing) {
    await db.update(skuProductionConfigTable).set({
      unitsPerDay,
      cartonSize,
      shiftHours: shiftHours.toFixed(2),
      productionDaysPerMonth,
      notes: notes || null,
      kwhPerUnit: kwhPerUnit != null ? kwhPerUnit.toFixed(4) : null,
      litersPerUnit: litersPerUnit != null ? litersPerUnit.toFixed(4) : null,
      updatedAt: new Date(),
    }).where(eq(skuProductionConfigTable.skuId, skuId));
  } else {
    await db.insert(skuProductionConfigTable).values({
      skuId,
      unitsPerDay,
      cartonSize,
      shiftHours: shiftHours.toFixed(2),
      productionDaysPerMonth,
      notes: notes || null,
      kwhPerUnit: kwhPerUnit != null ? kwhPerUnit.toFixed(4) : null,
      litersPerUnit: litersPerUnit != null ? litersPerUnit.toFixed(4) : null,
    });
  }

  await db.delete(skuTeamMembersTable).where(eq(skuTeamMembersTable.skuId, skuId));
  if (excludedMemberIds.length > 0) {
    await db.insert(skuTeamMembersTable).values(excludedMemberIds.map(tid => ({ skuId, teamMemberId: tid })));
  }

  const laborCost = await calculateLaborCostPerUnit(skuId);
  const overheadCost = await calculateOverheadPerUnit(skuId);
  const utilitiesCostComputed = await calculateUtilitiesCostPerUnit(skuId);
  const waterCostComputed = await calculateWaterCostPerUnit(skuId);

  await db.update(skuProductionConfigTable).set({
    laborCostPerUnit: laborCost !== null ? laborCost.toFixed(6) : null,
    overheadCostPerUnit: overheadCost !== null ? overheadCost.toFixed(6) : null,
    utilitiesCostPerUnit: utilitiesCostComputed !== null ? utilitiesCostComputed.toFixed(6) : null,
    waterCostPerUnit: waterCostComputed !== null ? waterCostComputed.toFixed(6) : null,
    updatedAt: new Date(),
  }).where(eq(skuProductionConfigTable.skuId, skuId));

  const today = new Date().toISOString().split("T")[0];
  const totalDayUnits = (unitsPerDay ?? 0) * cartonSize;
  const totalDayCost = totalDayUnits > 0 && laborCost !== null
    ? (laborCost * totalDayUnits).toFixed(4)
    : null;

  const allProductionMembers = await db
    .select({ id: teamMembersTable.id })
    .from(teamMembersTable)
    .where(and(eq(teamMembersTable.isActive, true), eq(teamMembersTable.department, "production")));
  const includedIds = allProductionMembers.map(m => m.id).filter(id => !excludedMemberIds.includes(id));

  await db.insert(productionConfigHistoryTable).values({
    skuId,
    effectiveDate: today,
    unitsPerDay,
    cartonSize,
    shiftHours: shiftHours.toFixed(2),
    productionDaysPerMonth,
    teamMemberIds: JSON.stringify(includedIds),
    laborPerUnit: laborCost !== null ? laborCost.toFixed(6) : null,
    overheadPerUnit: overheadCost !== null ? overheadCost.toFixed(6) : null,
    totalDayCost,
    changeReason,
    changeNote,
    createdBy: createdBy || null,
  });

  await snapshotSku(skuId, "production_config_updated");

  return { laborCostPerUnit: laborCost, overheadCostPerUnit: overheadCost, utilitiesCostPerUnit: utilitiesCostComputed, waterCostPerUnit: waterCostComputed };
}

export async function recalculateOverheadForAllSkus(triggeredBy: string): Promise<number> {
  const configs = await db.select().from(skuProductionConfigTable);
  let count = 0;
  for (const config of configs) {
    if (!config.unitsPerDay) continue;
    const overheadCost = await calculateOverheadPerUnit(config.skuId);
    const utilitiesCost = await calculateUtilitiesCostPerUnit(config.skuId);
    const waterCost = await calculateWaterCostPerUnit(config.skuId);
    await db.update(skuProductionConfigTable).set({
      overheadCostPerUnit: overheadCost !== null ? overheadCost.toFixed(6) : null,
      utilitiesCostPerUnit: utilitiesCost !== null ? utilitiesCost.toFixed(6) : null,
      waterCostPerUnit: waterCost !== null ? waterCost.toFixed(6) : null,
      updatedAt: new Date(),
    }).where(eq(skuProductionConfigTable.skuId, config.skuId));
    await snapshotSku(config.skuId, triggeredBy);
    count++;
  }
  return count;
}

export async function recalculateAllSkusUsingIngredient(ingredientId: number, triggeredBy: string): Promise<number> {
  const affectedLines = await db
    .selectDistinct({ skuId: costLinesTable.skuId })
    .from(costLinesTable)
    .where(eq(costLinesTable.ingredientId, ingredientId));

  const skuIds = affectedLines.map((l) => l.skuId);
  logger.info({ ingredientId, skuIds, count: skuIds.length }, "Recalculating SKUs after ingredient price update");

  for (const skuId of skuIds) {
    await snapshotSku(skuId, triggeredBy);
  }

  return skuIds.length;
}

export async function recalculateAllSkusForTeamChange(triggeredBy: string): Promise<number> {
  const configs = await db.select({ skuId: skuProductionConfigTable.skuId }).from(skuProductionConfigTable);
  const skuIds = configs.map(c => c.skuId);
  logger.info({ skuIds, count: skuIds.length }, "Recalculating all SKUs after team member change");

  for (const skuId of skuIds) {
    const laborCost = await calculateLaborCostPerUnit(skuId);
    await db.update(skuProductionConfigTable).set({
      laborCostPerUnit: laborCost !== null ? laborCost.toFixed(6) : null,
      updatedAt: new Date(),
    }).where(eq(skuProductionConfigTable.skuId, skuId));
    await snapshotSku(skuId, triggeredBy);
  }

  return skuIds.length;
}

export async function recalculateAllSkusUsingTeamMember(teamMemberId: number, triggeredBy: string): Promise<number> {
  return recalculateAllSkusForTeamChange(triggeredBy);
}

export async function getSkuWithMargin(skuId: number) {
  const sku = await db.select().from(skusTable).where(eq(skusTable.id, skuId)).limit(1);
  if (!sku[0]) return null;

  const { totalCogs, grossMargin } = await recalculateSkuCogs(skuId);
  const status = computeMarginStatus(grossMargin);

  return {
    ...sku[0],
    sellPrice: parseFloat(sku[0].sellPrice),
    totalCogs,
    grossMargin,
    status,
  };
}
