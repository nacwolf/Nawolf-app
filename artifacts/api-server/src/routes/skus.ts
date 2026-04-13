import { Router, type IRouter } from "express";
import { eq, desc, max, sql } from "drizzle-orm";
import { db, skusTable, costLinesTable, skuSnapshotsTable, ingredientsTable, ingredientPricesTable } from "@workspace/db";
import {
  CreateSkuBody,
  GetSkuParams,
  UpdateSkuParams,
  UpdateSkuBody,
  DeleteSkuParams,
  GetSkuCostLinesParams,
  AddSkuCostLineParams,
  AddSkuCostLineBody,
  DeleteSkuCostLineParams,
  GetSkuSnapshotsParams,
} from "@workspace/api-zod";
import { getAuth } from "@clerk/express";
import { recalculateSkuCogs, computeMarginStatus, snapshotSku, getSkuWithMargin } from "../lib/kostr";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.get("/skus", requireAuth, async (req, res): Promise<void> => {
  const skus = await db.select().from(skusTable).orderBy(desc(skusTable.createdAt));

  const result = await Promise.all(
    skus.map(async (sku) => {
      const { totalCogs, grossMargin } = await recalculateSkuCogs(sku.id);
      const status = computeMarginStatus(grossMargin);

      const [lastSnap] = await db
        .select({ lastChangedDate: max(skuSnapshotsTable.snapshotDate) })
        .from(skuSnapshotsTable)
        .where(eq(skuSnapshotsTable.skuId, sku.id));

      return {
        ...sku,
        sellPrice: parseFloat(sku.sellPrice),
        totalCogs,
        grossMargin,
        status,
        lastChangedDate: lastSnap?.lastChangedDate ?? null,
      };
    })
  );

  res.json(result);
});

router.post("/skus", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateSkuBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { costLines, ...skuData } = parsed.data;

  const [sku] = await db
    .insert(skusTable)
    .values({ ...skuData, sellPrice: skuData.sellPrice.toFixed(4) })
    .returning();

  if (costLines && costLines.length > 0) {
    for (const line of costLines) {
      await db.insert(costLinesTable).values({
        skuId: sku.id,
        ingredientId: line.ingredientId,
        quantityPerUnit: line.quantityPerUnit.toFixed(4),
        notes: line.notes ?? null,
      });
    }
  }

  await snapshotSku(sku.id, "sku_created");

  const skuWithMargin = await getSkuWithMargin(sku.id);
  res.status(201).json(skuWithMargin ?? { ...sku, sellPrice: parseFloat(sku.sellPrice), totalCogs: null, grossMargin: null, status: "unknown" });
});

router.get("/skus/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetSkuParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [sku] = await db.select().from(skusTable).where(eq(skusTable.id, params.data.id));
  if (!sku) {
    res.status(404).json({ error: "SKU not found" });
    return;
  }

  const { totalCogs, grossMargin } = await recalculateSkuCogs(sku.id);
  const status = computeMarginStatus(grossMargin);

  const costLinesRows = await db
    .select({
      id: costLinesTable.id,
      skuId: costLinesTable.skuId,
      ingredientId: costLinesTable.ingredientId,
      ingredientName: ingredientsTable.name,
      ingredientUnit: ingredientsTable.unit,
      ingredientCategory: ingredientsTable.category,
      quantityPerUnit: costLinesTable.quantityPerUnit,
      notes: costLinesTable.notes,
    })
    .from(costLinesTable)
    .innerJoin(ingredientsTable, eq(costLinesTable.ingredientId, ingredientsTable.id))
    .where(eq(costLinesTable.skuId, sku.id));

  const costLinesWithPrice = await Promise.all(
    costLinesRows.map(async (line) => {
      const priceRows = await db
        .select({ price: ingredientPricesTable.price })
        .from(ingredientPricesTable)
        .where(eq(ingredientPricesTable.ingredientId, line.ingredientId))
        .orderBy(desc(ingredientPricesTable.effectiveDate), desc(ingredientPricesTable.createdAt))
        .limit(1);
      const currentPrice = priceRows[0] ? parseFloat(priceRows[0].price) : null;
      const qty = parseFloat(line.quantityPerUnit);
      return {
        ...line,
        quantityPerUnit: qty,
        currentPrice,
        lineCost: currentPrice != null ? currentPrice * qty : null,
      };
    })
  );

  const snapshots = await db
    .select()
    .from(skuSnapshotsTable)
    .where(eq(skuSnapshotsTable.skuId, sku.id))
    .orderBy(desc(skuSnapshotsTable.snapshotDate), desc(skuSnapshotsTable.createdAt));

  res.json({
    ...sku,
    sellPrice: parseFloat(sku.sellPrice),
    totalCogs,
    grossMargin,
    status,
    costLines: costLinesWithPrice,
    snapshots: snapshots.map((s) => ({
      ...s,
      totalCogs: parseFloat(s.totalCogs),
      sellPrice: parseFloat(s.sellPrice),
      grossMargin: parseFloat(s.grossMargin),
    })),
  });
});

router.patch("/skus/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateSkuParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateSkuBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, any> = {};
  if (parsed.data.name != null) updateData.name = parsed.data.name;
  if (parsed.data.category != null) updateData.category = parsed.data.category;
  if (parsed.data.unitSize != null) updateData.unitSize = parsed.data.unitSize;
  if (parsed.data.sellPrice != null) updateData.sellPrice = parsed.data.sellPrice.toFixed(4);
  if (parsed.data.customerName !== undefined) updateData.customerName = parsed.data.customerName;

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [sku] = await db.update(skusTable).set(updateData).where(eq(skusTable.id, params.data.id)).returning();
  if (!sku) {
    res.status(404).json({ error: "SKU not found" });
    return;
  }

  if (parsed.data.sellPrice != null) {
    await snapshotSku(sku.id, "sell_price_updated");
  }

  const skuWithMargin = await getSkuWithMargin(sku.id);
  res.json(skuWithMargin ?? { ...sku, sellPrice: parseFloat(sku.sellPrice), totalCogs: null, grossMargin: null, status: "unknown" });
});

router.delete("/skus/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteSkuParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [sku] = await db.delete(skusTable).where(eq(skusTable.id, params.data.id)).returning();
  if (!sku) {
    res.status(404).json({ error: "SKU not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/skus/:id/cost-lines", requireAuth, async (req, res): Promise<void> => {
  const params = GetSkuCostLinesParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const lines = await db
    .select({
      id: costLinesTable.id,
      skuId: costLinesTable.skuId,
      ingredientId: costLinesTable.ingredientId,
      ingredientName: ingredientsTable.name,
      ingredientUnit: ingredientsTable.unit,
      quantityPerUnit: costLinesTable.quantityPerUnit,
      notes: costLinesTable.notes,
    })
    .from(costLinesTable)
    .innerJoin(ingredientsTable, eq(costLinesTable.ingredientId, ingredientsTable.id))
    .where(eq(costLinesTable.skuId, params.data.id));

  const result = await Promise.all(
    lines.map(async (line) => {
      const priceRows = await db
        .select({ price: ingredientPricesTable.price })
        .from(ingredientPricesTable)
        .where(eq(ingredientPricesTable.ingredientId, line.ingredientId))
        .orderBy(desc(ingredientPricesTable.effectiveDate), desc(ingredientPricesTable.createdAt))
        .limit(1);
      const currentPrice = priceRows[0] ? parseFloat(priceRows[0].price) : null;
      const qty = parseFloat(line.quantityPerUnit);
      return {
        ...line,
        quantityPerUnit: qty,
        currentPrice,
        lineCost: currentPrice != null ? currentPrice * qty : null,
      };
    })
  );

  res.json(result);
});

router.post("/skus/:id/cost-lines", requireAuth, async (req, res): Promise<void> => {
  const params = AddSkuCostLineParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = AddSkuCostLineBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [line] = await db
    .insert(costLinesTable)
    .values({
      skuId: params.data.id,
      ingredientId: parsed.data.ingredientId,
      quantityPerUnit: parsed.data.quantityPerUnit.toFixed(4),
      notes: parsed.data.notes ?? null,
    })
    .returning();

  await snapshotSku(params.data.id, "cost_line_added");

  const ingredient = await db.select().from(ingredientsTable).where(eq(ingredientsTable.id, line.ingredientId)).limit(1);
  const priceRows = await db
    .select({ price: ingredientPricesTable.price })
    .from(ingredientPricesTable)
    .where(eq(ingredientPricesTable.ingredientId, line.ingredientId))
    .orderBy(desc(ingredientPricesTable.effectiveDate), desc(ingredientPricesTable.createdAt))
    .limit(1);

  const currentPrice = priceRows[0] ? parseFloat(priceRows[0].price) : null;
  const qty = parseFloat(line.quantityPerUnit);

  res.status(201).json({
    ...line,
    ingredientName: ingredient[0]?.name ?? "",
    ingredientUnit: ingredient[0]?.unit ?? "",
    quantityPerUnit: qty,
    currentPrice,
    lineCost: currentPrice != null ? currentPrice * qty : null,
  });
});

router.patch("/skus/:id/cost-lines/:costLineId", requireAuth, async (req, res): Promise<void> => {
  const skuId = parseInt(req.params.id, 10);
  const costLineId = parseInt(req.params.costLineId, 10);

  if (isNaN(skuId) || isNaN(costLineId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const { ingredientId, quantityPerUnit, notes } = req.body;
  const qty = parseFloat(quantityPerUnit);
  if (isNaN(qty) || qty <= 0) {
    res.status(400).json({ error: "quantityPerUnit must be a positive number" });
    return;
  }

  const updateData: Record<string, any> = {
    quantityPerUnit: qty.toFixed(6),
    notes: notes ?? null,
  };
  if (ingredientId != null && !isNaN(parseInt(ingredientId, 10))) {
    updateData.ingredientId = parseInt(ingredientId, 10);
  }

  const [line] = await db
    .update(costLinesTable)
    .set(updateData)
    .where(eq(costLinesTable.id, costLineId))
    .returning();

  if (!line) {
    res.status(404).json({ error: "Cost line not found" });
    return;
  }

  await snapshotSku(skuId, "cost_line_updated");

  const [ingredient] = await db.select().from(ingredientsTable).where(eq(ingredientsTable.id, line.ingredientId)).limit(1);
  const [priceRow] = await db
    .select({ price: ingredientPricesTable.price })
    .from(ingredientPricesTable)
    .where(eq(ingredientPricesTable.ingredientId, line.ingredientId))
    .orderBy(desc(ingredientPricesTable.effectiveDate), desc(ingredientPricesTable.createdAt))
    .limit(1);

  const currentPrice = priceRow ? parseFloat(priceRow.price) : null;
  const storedQty = parseFloat(line.quantityPerUnit);

  res.json({
    ...line,
    ingredientName: ingredient?.name ?? "",
    ingredientUnit: ingredient?.unit ?? "",
    ingredientCategory: ingredient?.category ?? null,
    quantityPerUnit: storedQty,
    currentPrice,
    lineCost: currentPrice != null ? currentPrice * storedQty : null,
  });
});

router.delete("/skus/:id/cost-lines/:costLineId", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteSkuCostLineParams.safeParse({ id: req.params.id, costLineId: req.params.costLineId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [line] = await db.delete(costLinesTable).where(eq(costLinesTable.id, params.data.costLineId)).returning();
  if (!line) {
    res.status(404).json({ error: "Cost line not found" });
    return;
  }

  await snapshotSku(params.data.id, "cost_line_removed");
  res.sendStatus(204);
});

router.get("/skus/:id/snapshots", requireAuth, async (req, res): Promise<void> => {
  const params = GetSkuSnapshotsParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const snapshots = await db
    .select()
    .from(skuSnapshotsTable)
    .where(eq(skuSnapshotsTable.skuId, params.data.id))
    .orderBy(desc(skuSnapshotsTable.snapshotDate), desc(skuSnapshotsTable.createdAt));

  res.json(
    snapshots.map((s) => ({
      ...s,
      totalCogs: parseFloat(s.totalCogs),
      sellPrice: parseFloat(s.sellPrice),
      grossMargin: parseFloat(s.grossMargin),
    }))
  );
});

export default router;
