import { Router, type IRouter } from "express";
import { db, skusTable, ingredientsTable, ingredientPricesTable, costLinesTable, skuSnapshotsTable } from "@workspace/db";
import { desc, sql, gte } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { recalculateSkuCogs, computeMarginStatus } from "../lib/kostr";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const skus = await db.select().from(skusTable);
  const totalIngredients = await db.select({ count: sql<number>`count(*)` }).from(ingredientsTable);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString().split("T")[0];

  const recentPriceChanges = await db
    .select({ count: sql<number>`count(*)` })
    .from(ingredientPricesTable)
    .where(gte(ingredientPricesTable.effectiveDate, cutoff));

  let healthyCount = 0;
  let reviewCount = 0;
  let criticalCount = 0;
  let unknownCount = 0;
  let totalMargin = 0;
  let marginCount = 0;

  for (const sku of skus) {
    const { grossMargin } = await recalculateSkuCogs(sku.id);
    const status = computeMarginStatus(grossMargin);
    if (status === "healthy") healthyCount++;
    else if (status === "review") reviewCount++;
    else if (status === "critical") criticalCount++;
    else unknownCount++;

    if (grossMargin !== null) {
      totalMargin += grossMargin;
      marginCount++;
    }
  }

  res.json({
    totalSkus: skus.length,
    healthyCount,
    reviewCount,
    criticalCount,
    unknownCount,
    avgMargin: marginCount > 0 ? totalMargin / marginCount : null,
    totalIngredients: Number(totalIngredients[0]?.count ?? 0),
    recentPriceChanges: Number(recentPriceChanges[0]?.count ?? 0),
  });
});

router.get("/dashboard/margin-trends", requireAuth, async (req, res): Promise<void> => {
  const snapshots = await db
    .select({
      snapshotDate: skuSnapshotsTable.snapshotDate,
      grossMargin: skuSnapshotsTable.grossMargin,
      sellPrice: skuSnapshotsTable.sellPrice,
    })
    .from(skuSnapshotsTable)
    .orderBy(skuSnapshotsTable.snapshotDate);

  const byDate = new Map<string, { margins: number[]; statuses: ReturnType<typeof computeMarginStatus>[] }>();

  for (const s of snapshots) {
    const margin = parseFloat(s.grossMargin);
    const status = computeMarginStatus(margin);
    if (!byDate.has(s.snapshotDate)) {
      byDate.set(s.snapshotDate, { margins: [], statuses: [] });
    }
    byDate.get(s.snapshotDate)!.margins.push(margin);
    byDate.get(s.snapshotDate)!.statuses.push(status);
  }

  const trends = Array.from(byDate.entries()).map(([date, data]) => {
    const avgMargin = data.margins.reduce((a, b) => a + b, 0) / data.margins.length;
    const healthyCount = data.statuses.filter((s) => s === "healthy").length;
    const reviewCount = data.statuses.filter((s) => s === "review").length;
    const criticalCount = data.statuses.filter((s) => s === "critical").length;
    return { date, avgMargin, healthyCount, reviewCount, criticalCount };
  });

  res.json(trends);
});

export default router;
