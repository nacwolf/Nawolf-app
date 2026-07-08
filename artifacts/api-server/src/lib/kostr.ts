import { db, ingredientsTable, ingredientPricesTable, skusTable, costLinesTable, skuSnapshotsTable, packagingItemsTable } from "@workspace/db";
import { teamMembersTable, skuProductionConfigTable, skuTeamMembersTable, overheadItemsTable, appSettingsTable, productionConfigHistoryTable } from "@workspace/db";
import { printingBlockSuppliersTable, skuPrintingBlockConfigsTable } from "@workspace/db";
import { eq, desc, sql, inArray, and, notInArray } from "drizzle-orm";
import { logger } from "./logger";

async function getAppSetting(key: string): Promise<string | null> {
  const [row] = await db.select({ value: appSettingsTable.value }).from(appSettingsTable).where(eq(appSettingsTable.key, key)).limit(1);
  return row?.value ?? null;
}

export function computeMarginStatus(grossMargin: number | null): "healthy" | "review" | "critical" | "unknown" {
  if (grossMargin === null) return "unknown";
  if (grossMargin > 0.25) return "healthy";
  if (grossMargin >= 0.10) return "review";
  return "critical";
}

export async function getCurrentPrice(ingredientId: number): Promise<number | null> {
  const [row] = await db
    .select({ price: ingredientPricesTable.price })
    .from(ingredientPricesTable)
    .where(eq(ingredientPricesTable.ingredientId, ingredientId))
    .orderBy(desc(ingredientPricesTable.effectiveDate), desc(ingredientPricesTable.createdAt))
    .limit(1);
  return row ? parseFloat(row.price) : null;
}

export async function calculateLaborCostPerUnit(skuId: number): Promise<number | null> {
  const [config] = await db
    .select()
    .from(skuProductionConfigTable)
    .where(eq(skuProductionConfigTable.skuId, skuId))
    .limit(1);

  if (!config || !config.unitsPerDay) return null;

  const excludedRows = await db
    .select({ teamMemberId: skuTeamMembersTable.teamMemberId })
    .from(skuTeamMembersTable)
    .where(eq(skuTeamMembersTable.skuId, skuId));
  const excludedIds = excludedRows.map(r => r.teamMemberId);

  let membersQuery = db
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

  const members = await membersQuery;
  if (members.length === 0) return null;

  const shiftHours = parseFloat(config.shiftHours ?? "8");
  const totalDayUnits = config.unitsPerDay * (config.cartonSize ?? 1);
  const daysPerMonth = config.productionDaysPerMonth ?? 20;

  let totalLaborPerUnit = 0;
  for (const m of members) {
    const oncost = parseFloat(m.oncostPercent) / 100;
    if ((m.payType ?? "hourly") === "monthly" && m.monthlySalary) {
      const dailyCost = parseFloat(m.monthlySalary) * (1 + oncost) / daysPerMonth;
      totalLaborPerUnit += dailyCost / totalDayUnits;
    } else {
      const loadedRate = parseFloat(m.hourlyWage) * (1 + oncost);
      totalLaborPerUnit += (loadedRate * shiftHours) / totalDayUnits;
    }
  }

  return totalLaborPerUnit;
}

export async function calculateOverheadPerUnit(skuId: number): Promise<number | null> {
  const [config] = await db
    .select()
    .from(skuProductionConfigTable)
    .where(eq(skuProductionConfigTable.skuId, skuId))
    .limit(1);

  if (!config || !config.unitsPerDay) return null;

  const daysPerMonth = config.productionDaysPerMonth ?? 20;
  const unitsPerMonth = config.unitsPerDay * (config.cartonSize ?? 1) * daysPerMonth;
  if (unitsPerMonth === 0) return null;

  const items = await db
    .select()
    .from(overheadItemsTable)
    .where(eq(overheadItemsTable.isActive, true));

  if (items.length === 0) return null;

  const totalMonthly = items.reduce((sum, item) => {
    const amount = parseFloat(item.monthlyAmount);
    const freq = item.frequency ?? "monthly";
    return sum + (freq === "annual" ? amount / 12 : amount);
  }, 0);

  if (totalMonthly === 0) return null;

  return totalMonthly / unitsPerMonth;
}

export async function calculateUtilitiesCostPerUnit(skuId: number): Promise<number | null> {
  const [config] = await db.select().from(skuProductionConfigTable).where(eq(skuProductionConfigTable.skuId, skuId)).limit(1);
  if (!config || !config.unitsPerDay) return null;

  if (config.kwhPerUnit != null) {
    const rateStr = await getAppSetting("electricity_rate_per_kwh");
    if (!rateStr) return null;
    return parseFloat(config.kwhPerUnit) * parseFloat(rateStr);
  }

  const monthlyStr = await getAppSetting("utilities_monthly_cost");
  if (!monthlyStr) return null;
  const monthly = parseFloat(monthlyStr);
  if (monthly === 0) return null;
  const daysPerMonth = config.productionDaysPerMonth ?? 20;
  const unitsPerMonth = config.unitsPerDay * (config.cartonSize ?? 1) * daysPerMonth;
  if (unitsPerMonth === 0) return null;
  return monthly / unitsPerMonth;
}

export async function calculateWaterCostPerUnit(skuId: number): Promise<number | null> {
  const [config] = await db.select().from(skuProductionConfigTable).where(eq(skuProductionConfigTable.skuId, skuId)).limit(1);
  if (!config || !config.unitsPerDay) return null;

  if (config.litersPerUnit != null) {
    const rateStr = await getAppSetting("water_rate_per_liter");
    if (!rateStr) return null;
    return parseFloat(config.litersPerUnit) * parseFloat(rateStr);
  }

  const monthlyStr = await getAppSetting("water_monthly_cost");
  if (!monthlyStr) return null;
  const monthly = parseFloat(monthlyStr);
  if (monthly === 0) return null;
  const daysPerMonth = config.productionDaysPerMonth ?? 20;
  const unitsPerMonth = config.unitsPerDay * (config.cartonSize ?? 1) * daysPerMonth;
  if (unitsPerMonth === 0) return null;
  return monthly / unitsPerMonth;
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

  const activeBlockConfigs = await db
    .select({
      numBlocks: skuPrintingBlockConfigsTable.numBlocks,
      moq: skuPrintingBlockConfigsTable.moq,
      pricePerBlock: printingBlockSuppliersTable.pricePerBlock,
    })
    .from(skuPrintingBlockConfigsTable)
    .innerJoin(printingBlockSuppliersTable, eq(skuPrintingBlockConfigsTable.supplierId, printingBlockSuppliersTable.id))
    .where(and(eq(skuPrintingBlockConfigsTable.skuId, skuId), eq(skuPrintingBlockConfigsTable.status, "active")));

  if (costLines.length === 0 && laborCost === null && overheadCost === null && utilitiesCost === null && waterCost === null && activeBlockConfigs.length === 0) return { totalCogs: null, grossMargin: null };

  let totalCogs = 0;
  for (const line of costLines) {
    const qty = parseFloat(line.quantityPerUnit);
    if (line.packagingItemId != null) {
      const [pkg] = await db.select({ unitCost: packagingItemsTable.unitCost }).from(packagingItemsTable).where(eq(packagingItemsTable.id, line.packagingItemId)).limit(1);
      if (!pkg) return { totalCogs: null, grossMargin: null };
      totalCogs += parseFloat(pkg.unitCost) * qty;
    } else if (line.ingredientId != null) {
      const price = await getCurrentPrice(line.ingredientId);
      if (price === null) return { totalCogs: null, grossMargin: null };
      totalCogs += price * qty;
    }
  }

  if (laborCost !== null) totalCogs += laborCost;
  if (overheadCost !== null) totalCogs += overheadCost;
  if (utilitiesCost !== null) totalCogs += utilitiesCost;
  if (waterCost !== null) totalCogs += waterCost;

  for (const config of activeBlockConfigs) {
    const amortized = (config.numBlocks * parseFloat(config.pricePerBlock)) / config.moq;
    totalCogs += amortized;
  }

  const sellPrice = parseFloat(sku[0].sellPrice);
  if (sellPrice === 0) return { totalCogs, grossMargin: null };

  const grossMargin = (sellPrice - totalCogs) / sellPrice;
  return { totalCogs, grossMargin };
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
  createdBy?: string
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
