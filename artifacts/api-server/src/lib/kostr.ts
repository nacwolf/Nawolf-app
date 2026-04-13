import { db, ingredientsTable, ingredientPricesTable, skusTable, costLinesTable, skuSnapshotsTable } from "@workspace/db";
import { eq, desc, sql, inArray } from "drizzle-orm";
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

  if (costLines.length === 0) return { totalCogs: null, grossMargin: null };

  let totalCogs = 0;
  for (const line of costLines) {
    const price = await getCurrentPrice(line.ingredientId);
    if (price === null) return { totalCogs: null, grossMargin: null };
    totalCogs += price * parseFloat(line.quantityPerUnit);
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
