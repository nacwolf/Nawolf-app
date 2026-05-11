import { db, ingredientsTable, ingredientPricesTable, skusTable, costLinesTable, skuSnapshotsTable } from "@workspace/db";
import { teamMembersTable, skuProductionConfigTable, skuTeamMembersTable, overheadItemsTable, appSettingsTable, productionConfigHistoryTable } from "@workspace/db";
import { printingBlockSuppliersTable, skuPrintingBlockConfigsTable } from "@workspace/db";
import { eq, desc, sql, inArray, and } from "drizzle-orm";
import { logger } from "./logger";

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

  const members = await db
    .select({ hourlyWage: teamMembersTable.hourlyWage, oncostPercent: teamMembersTable.oncostPercent })
    .from(skuTeamMembersTable)
    .innerJoin(teamMembersTable, eq(skuTeamMembersTable.teamMemberId, teamMembersTable.id))
    .where(eq(skuTeamMembersTable.skuId, skuId));

  if (members.length === 0) return null;

  const totalLoadedRate = members.reduce((sum, m) => {
    const wage = parseFloat(m.hourlyWage);
    const oncost = parseFloat(m.oncostPercent) / 100;
    return sum + wage * (1 + oncost);
  }, 0);

  const shiftHours = parseFloat(config.shiftHours ?? "8");
  const totalDayUnits = config.unitsPerDay * (config.cartonSize ?? 1);
  const laborPerUnit = (totalLoadedRate * shiftHours) / totalDayUnits;

  return laborPerUnit;
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

  const costLines = await db
    .select({
      ingredientId: costLinesTable.ingredientId,
      quantityPerUnit: costLinesTable.quantityPerUnit,
    })
    .from(costLinesTable)
    .where(eq(costLinesTable.skuId, skuId));

  const [prodConfig] = await db
    .select({ laborCostPerUnit: skuProductionConfigTable.laborCostPerUnit, overheadCostPerUnit: skuProductionConfigTable.overheadCostPerUnit })
    .from(skuProductionConfigTable)
    .where(eq(skuProductionConfigTable.skuId, skuId))
    .limit(1);

  const laborCost = prodConfig?.laborCostPerUnit ? parseFloat(prodConfig.laborCostPerUnit) : null;
  const overheadCost = prodConfig?.overheadCostPerUnit ? parseFloat(prodConfig.overheadCostPerUnit) : null;

  const activeBlockConfigs = await db
    .select({
      numBlocks: skuPrintingBlockConfigsTable.numBlocks,
      moq: skuPrintingBlockConfigsTable.moq,
      pricePerBlock: printingBlockSuppliersTable.pricePerBlock,
    })
    .from(skuPrintingBlockConfigsTable)
    .innerJoin(printingBlockSuppliersTable, eq(skuPrintingBlockConfigsTable.supplierId, printingBlockSuppliersTable.id))
    .where(and(eq(skuPrintingBlockConfigsTable.skuId, skuId), eq(skuPrintingBlockConfigsTable.status, "active")));

  if (costLines.length === 0 && laborCost === null && overheadCost === null && activeBlockConfigs.length === 0) return { totalCogs: null, grossMargin: null };

  let totalCogs = 0;
  for (const line of costLines) {
    const price = await getCurrentPrice(line.ingredientId);
    if (price === null) return { totalCogs: null, grossMargin: null };
    totalCogs += price * parseFloat(line.quantityPerUnit);
  }

  if (laborCost !== null) totalCogs += laborCost;
  if (overheadCost !== null) totalCogs += overheadCost;

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
    teamMemberIds: number[];
    notes?: string | null;
  },
  changeReason: string,
  changeNote: string | null,
  createdBy?: string
): Promise<{ laborCostPerUnit: number | null; overheadCostPerUnit: number | null }> {
  const { unitsPerDay, cartonSize, shiftHours, productionDaysPerMonth, teamMemberIds, notes } = inputs;

  const [existing] = await db.select().from(skuProductionConfigTable).where(eq(skuProductionConfigTable.skuId, skuId)).limit(1);

  if (existing) {
    await db.update(skuProductionConfigTable).set({
      unitsPerDay,
      cartonSize,
      shiftHours: shiftHours.toFixed(2),
      productionDaysPerMonth,
      notes: notes || null,
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
    });
  }

  await db.delete(skuTeamMembersTable).where(eq(skuTeamMembersTable.skuId, skuId));
  if (teamMemberIds.length > 0) {
    await db.insert(skuTeamMembersTable).values(teamMemberIds.map(tid => ({ skuId, teamMemberId: tid })));
  }

  const laborCost = await calculateLaborCostPerUnit(skuId);
  const overheadCost = await calculateOverheadPerUnit(skuId);

  await db.update(skuProductionConfigTable).set({
    laborCostPerUnit: laborCost !== null ? laborCost.toFixed(6) : null,
    overheadCostPerUnit: overheadCost !== null ? overheadCost.toFixed(6) : null,
    updatedAt: new Date(),
  }).where(eq(skuProductionConfigTable.skuId, skuId));

  const today = new Date().toISOString().split("T")[0];
  const totalDayUnits = (unitsPerDay ?? 0) * cartonSize;
  const totalDayCost = totalDayUnits > 0 && laborCost !== null
    ? (laborCost * totalDayUnits).toFixed(4)
    : null;

  await db.insert(productionConfigHistoryTable).values({
    skuId,
    effectiveDate: today,
    unitsPerDay,
    cartonSize,
    shiftHours: shiftHours.toFixed(2),
    productionDaysPerMonth,
    teamMemberIds: JSON.stringify(teamMemberIds),
    laborPerUnit: laborCost !== null ? laborCost.toFixed(6) : null,
    overheadPerUnit: overheadCost !== null ? overheadCost.toFixed(6) : null,
    totalDayCost,
    changeReason,
    changeNote,
    createdBy: createdBy || null,
  });

  await snapshotSku(skuId, "production_config_updated");

  return { laborCostPerUnit: laborCost, overheadCostPerUnit: overheadCost };
}

export async function recalculateOverheadForAllSkus(triggeredBy: string): Promise<number> {
  const configs = await db.select().from(skuProductionConfigTable);
  let count = 0;
  for (const config of configs) {
    if (!config.unitsPerDay) continue;
    const overheadCost = await calculateOverheadPerUnit(config.skuId);
    await db.update(skuProductionConfigTable).set({
      overheadCostPerUnit: overheadCost !== null ? overheadCost.toFixed(6) : null,
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

export async function recalculateAllSkusUsingTeamMember(teamMemberId: number, triggeredBy: string): Promise<number> {
  const affected = await db
    .selectDistinct({ skuId: skuTeamMembersTable.skuId })
    .from(skuTeamMembersTable)
    .where(eq(skuTeamMembersTable.teamMemberId, teamMemberId));

  const skuIds = affected.map((r) => r.skuId);
  logger.info({ teamMemberId, skuIds, count: skuIds.length }, "Recalculating SKUs after team member wage update");

  for (const skuId of skuIds) {
    const laborCost = await calculateLaborCostPerUnit(skuId);
    if (laborCost !== null) {
      await db.update(skuProductionConfigTable).set({
        laborCostPerUnit: laborCost.toFixed(6),
        updatedAt: new Date(),
      }).where(eq(skuProductionConfigTable.skuId, skuId));
    }
    await snapshotSku(skuId, triggeredBy);
  }

  return skuIds.length;
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
