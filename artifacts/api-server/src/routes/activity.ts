import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, skuSnapshotsTable, skusTable } from "@workspace/db";
import { getAuth } from "@clerk/express";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.get("/activity", requireAuth, async (req, res): Promise<void> => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10), 200);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);
  const triggerType = req.query.triggerType as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;

  const rows = await db
    .select({
      id: skuSnapshotsTable.id,
      skuId: skuSnapshotsTable.skuId,
      skuCode: skusTable.skuCode,
      skuName: skusTable.name,
      snapshotDate: skuSnapshotsTable.snapshotDate,
      totalCogs: skuSnapshotsTable.totalCogs,
      sellPrice: skuSnapshotsTable.sellPrice,
      grossMargin: skuSnapshotsTable.grossMargin,
      triggeredBy: skuSnapshotsTable.triggeredBy,
      createdAt: skuSnapshotsTable.createdAt,
    })
    .from(skuSnapshotsTable)
    .innerJoin(skusTable, eq(skuSnapshotsTable.skuId, skusTable.id))
    .orderBy(desc(skuSnapshotsTable.snapshotDate), desc(skuSnapshotsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const filtered = rows.filter((row) => {
    if (triggerType && triggerType !== "all") {
      const t = row.triggeredBy ?? "";
      if (triggerType === "ingredient_cost" && !t.startsWith("price_update")) return false;
      if (triggerType === "sell_price" && t !== "sell_price_updated") return false;
      if (triggerType === "cost_line" && !t.startsWith("cost_line")) return false;
      if (triggerType === "sku_created" && t !== "sku_created") return false;
    }
    if (dateFrom && row.snapshotDate < dateFrom) return false;
    if (dateTo && row.snapshotDate > dateTo) return false;
    return true;
  });

  const result = filtered.map((row, idx, arr) => {
    const prev = arr[idx + 1];
    return {
      ...row,
      totalCogs: parseFloat(row.totalCogs),
      sellPrice: parseFloat(row.sellPrice),
      grossMargin: parseFloat(row.grossMargin),
      prevTotalCogs: prev && prev.skuId === row.skuId ? parseFloat(prev.totalCogs) : null,
      prevGrossMargin: prev && prev.skuId === row.skuId ? parseFloat(prev.grossMargin) : null,
    };
  });

  res.json(result);
});

export default router;
