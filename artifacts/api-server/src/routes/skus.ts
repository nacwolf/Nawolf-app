import { Router, type IRouter } from "express";
import { eq, desc, max, sql } from "drizzle-orm";
import { db, skusTable, costLinesTable, skuSnapshotsTable, ingredientsTable, ingredientPricesTable, skuProductPhotosTable, skuCertificateFilesTable, packagingItemsTable } from "@workspace/db";
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
    .values({
      ...skuData,
      sellPrice: skuData.sellPrice.toFixed(4),
      netWeight: skuData.netWeight != null ? String(skuData.netWeight) : null,
      grossWeight: skuData.grossWeight != null ? String(skuData.grossWeight) : null,
      cartonGrossWeight: skuData.cartonGrossWeight != null ? String(skuData.cartonGrossWeight) : null,
      cartonDimL: skuData.cartonDimL != null ? String(skuData.cartonDimL) : null,
      cartonDimW: skuData.cartonDimW != null ? String(skuData.cartonDimW) : null,
      cartonDimH: skuData.cartonDimH != null ? String(skuData.cartonDimH) : null,
      exFactoryPrice: skuData.exFactoryPrice != null ? String(skuData.exFactoryPrice) : null,
      fobPrice: skuData.fobPrice != null ? String(skuData.fobPrice) : null,
    })
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

  let totalCogs: number | null = null;
  let grossMargin: number | null = null;
  try {
    ({ totalCogs, grossMargin } = await recalculateSkuCogs(sku.id));
  } catch { /* column may not exist yet before migration */ }
  const status = computeMarginStatus(grossMargin);

  let costLinesRows: any[] = [];
  try {
    costLinesRows = await db
      .select({
        id: costLinesTable.id,
        skuId: costLinesTable.skuId,
        ingredientId: costLinesTable.ingredientId,
        packagingItemId: costLinesTable.packagingItemId,
        ingredientName: sql<string>`COALESCE(${ingredientsTable.name}, ${packagingItemsTable.nameEnglish})`.as("ingredient_name"),
        ingredientUnit: sql<string>`COALESCE(${ingredientsTable.unit}, ${packagingItemsTable.unit}::text)`.as("ingredient_unit"),
        ingredientCategory: sql<string>`COALESCE(${ingredientsTable.category}, 'Packaging')`.as("ingredient_category"),
        packagingUnitCost: packagingItemsTable.unitCost,
        quantityPerUnit: costLinesTable.quantityPerUnit,
        notes: costLinesTable.notes,
      })
      .from(costLinesTable)
      .leftJoin(ingredientsTable, eq(costLinesTable.ingredientId, ingredientsTable.id))
      .leftJoin(packagingItemsTable, eq(costLinesTable.packagingItemId, packagingItemsTable.id))
      .where(eq(costLinesTable.skuId, sku.id));
  } catch {
    // packaging_item_id column doesn't exist yet — fall back to ingredient-only query
    const rows = await db
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
      .leftJoin(ingredientsTable, eq(costLinesTable.ingredientId, ingredientsTable.id))
      .where(eq(costLinesTable.skuId, sku.id));
    costLinesRows = rows.map(r => ({ ...r, packagingItemId: null, packagingUnitCost: null }));
  }

  const costLinesWithPrice = await Promise.all(
    costLinesRows.map(async (line) => {
      let currentPrice: number | null = null;
      if (line.packagingItemId != null && line.packagingUnitCost != null) {
        currentPrice = parseFloat(line.packagingUnitCost);
      } else if (line.ingredientId != null) {
        const priceRows = await db
          .select({ price: ingredientPricesTable.price })
          .from(ingredientPricesTable)
          .where(eq(ingredientPricesTable.ingredientId, line.ingredientId))
          .orderBy(desc(ingredientPricesTable.effectiveDate), desc(ingredientPricesTable.createdAt))
          .limit(1);
        currentPrice = priceRows[0] ? parseFloat(priceRows[0].price) : null;
      }
      const qty = parseFloat(line.quantityPerUnit);
      return {
        id: line.id,
        skuId: line.skuId,
        ingredientId: line.ingredientId,
        packagingItemId: line.packagingItemId,
        ingredientName: line.ingredientName,
        ingredientUnit: line.ingredientUnit,
        ingredientCategory: line.ingredientCategory,
        quantityPerUnit: qty,
        notes: line.notes,
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

  const [productPhotos, certificateFiles] = await Promise.all([
    db.select().from(skuProductPhotosTable).where(eq(skuProductPhotosTable.skuId, sku.id)).orderBy(skuProductPhotosTable.sortOrder),
    db.select().from(skuCertificateFilesTable).where(eq(skuCertificateFilesTable.skuId, sku.id)).orderBy(skuCertificateFilesTable.uploadedAt),
  ]);

  res.json({
    ...sku,
    sellPrice: parseFloat(sku.sellPrice),
    netWeight: sku.netWeight != null ? parseFloat(sku.netWeight) : null,
    grossWeight: sku.grossWeight != null ? parseFloat(sku.grossWeight) : null,
    cartonGrossWeight: sku.cartonGrossWeight != null ? parseFloat(sku.cartonGrossWeight) : null,
    cartonDimL: sku.cartonDimL != null ? parseFloat(sku.cartonDimL) : null,
    cartonDimW: sku.cartonDimW != null ? parseFloat(sku.cartonDimW) : null,
    cartonDimH: sku.cartonDimH != null ? parseFloat(sku.cartonDimH) : null,
    exFactoryPrice: sku.exFactoryPrice != null ? parseFloat(sku.exFactoryPrice) : null,
    fobPrice: sku.fobPrice != null ? parseFloat(sku.fobPrice) : null,
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
    productPhotos,
    certificateFiles,
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

  const d = parsed.data;
  const updateData: Record<string, any> = {};
  const setIfPresent = (key: string, val: any) => { if (val !== undefined) updateData[key] = val; };
  setIfPresent("name", d.name);
  setIfPresent("nameThai", d.nameThai);
  setIfPresent("brandName", d.brandName);
  setIfPresent("category", d.category);
  setIfPresent("unitSize", d.unitSize);
  if (d.sellPrice != null) updateData.sellPrice = d.sellPrice.toFixed(4);
  setIfPresent("customerName", d.customerName);
  setIfPresent("notes", d.notes);
  setIfPresent("netWeight", d.netWeight != null ? String(d.netWeight) : d.netWeight);
  setIfPresent("netWeightUnit", d.netWeightUnit);
  setIfPresent("grossWeight", d.grossWeight != null ? String(d.grossWeight) : d.grossWeight);
  setIfPresent("grossWeightUnit", d.grossWeightUnit);
  setIfPresent("unitsPerCarton", d.unitsPerCarton);
  setIfPresent("cartonGrossWeight", d.cartonGrossWeight != null ? String(d.cartonGrossWeight) : d.cartonGrossWeight);
  setIfPresent("cartonGrossWeightUnit", d.cartonGrossWeightUnit);
  setIfPresent("cartonDimL", d.cartonDimL != null ? String(d.cartonDimL) : d.cartonDimL);
  setIfPresent("cartonDimW", d.cartonDimW != null ? String(d.cartonDimW) : d.cartonDimW);
  setIfPresent("cartonDimH", d.cartonDimH != null ? String(d.cartonDimH) : d.cartonDimH);
  setIfPresent("shelfLife", d.shelfLife);
  setIfPresent("shelfLifeUnit", d.shelfLifeUnit);
  setIfPresent("storageCondition", d.storageCondition);
  setIfPresent("exFactoryPrice", d.exFactoryPrice != null ? String(d.exFactoryPrice) : d.exFactoryPrice);
  setIfPresent("fobPrice", d.fobPrice != null ? String(d.fobPrice) : d.fobPrice);
  setIfPresent("moq", d.moq);
  setIfPresent("moqUnit", d.moqUnit);
  setIfPresent("fdaNumber", d.fdaNumber);
  setIfPresent("barcodeEan13", d.barcodeEan13);
  setIfPresent("halalCertified", d.halalCertified);
  setIfPresent("gmpCertified", d.gmpCertified);
  setIfPresent("haccpCertified", d.haccpCertified);
  setIfPresent("organicCertified", d.organicCertified);
  setIfPresent("otherCertifications", d.otherCertifications);
  setIfPresent("productDescription", d.productDescription);
  setIfPresent("ingredientsListThai", d.ingredientsListThai);
  setIfPresent("ingredientsListEnglish", d.ingredientsListEnglish);
  setIfPresent("ingredientLines", d.ingredientLines !== undefined ? (d.ingredientLines ?? null) : undefined);
  setIfPresent("allergenInfo", d.allergenInfo);
  setIfPresent("nutritionalInfo", d.nutritionalInfo);

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

  let lines: any[] = [];
  try {
    lines = await db
      .select({
        id: costLinesTable.id,
        skuId: costLinesTable.skuId,
        ingredientId: costLinesTable.ingredientId,
        packagingItemId: costLinesTable.packagingItemId,
        ingredientName: sql<string>`COALESCE(${ingredientsTable.name}, ${packagingItemsTable.nameEnglish})`.as("ingredient_name"),
        ingredientUnit: sql<string>`COALESCE(${ingredientsTable.unit}, ${packagingItemsTable.unit}::text)`.as("ingredient_unit"),
        ingredientCategory: sql<string>`COALESCE(${ingredientsTable.category}, 'Packaging')`.as("ingredient_category"),
        packagingUnitCost: packagingItemsTable.unitCost,
        quantityPerUnit: costLinesTable.quantityPerUnit,
        notes: costLinesTable.notes,
      })
      .from(costLinesTable)
      .leftJoin(ingredientsTable, eq(costLinesTable.ingredientId, ingredientsTable.id))
      .leftJoin(packagingItemsTable, eq(costLinesTable.packagingItemId, packagingItemsTable.id))
      .where(eq(costLinesTable.skuId, params.data.id));
  } catch {
    const rows = await db
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
      .leftJoin(ingredientsTable, eq(costLinesTable.ingredientId, ingredientsTable.id))
      .where(eq(costLinesTable.skuId, params.data.id));
    lines = rows.map(r => ({ ...r, packagingItemId: null, packagingUnitCost: null }));
  }

  const result = await Promise.all(
    lines.map(async (line) => {
      let currentPrice: number | null = null;
      if (line.packagingItemId != null && line.packagingUnitCost != null) {
        currentPrice = parseFloat(line.packagingUnitCost);
      } else if (line.ingredientId != null) {
        const priceRows = await db
          .select({ price: ingredientPricesTable.price })
          .from(ingredientPricesTable)
          .where(eq(ingredientPricesTable.ingredientId, line.ingredientId))
          .orderBy(desc(ingredientPricesTable.effectiveDate), desc(ingredientPricesTable.createdAt))
          .limit(1);
        currentPrice = priceRows[0] ? parseFloat(priceRows[0].price) : null;
      }
      const qty = parseFloat(line.quantityPerUnit);
      return {
        id: line.id,
        skuId: line.skuId,
        ingredientId: line.ingredientId,
        packagingItemId: line.packagingItemId,
        ingredientName: line.ingredientName,
        ingredientUnit: line.ingredientUnit,
        ingredientCategory: line.ingredientCategory,
        quantityPerUnit: qty,
        notes: line.notes,
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

  const { ingredientId, packagingItemId, quantityPerUnit, notes } = req.body;
  const qty = parseFloat(quantityPerUnit);
  if (isNaN(qty) || qty <= 0) {
    res.status(400).json({ error: "quantityPerUnit must be a positive number" });
    return;
  }
  if (!ingredientId && !packagingItemId) {
    res.status(400).json({ error: "Either ingredientId or packagingItemId is required" });
    return;
  }

  const insertValues: any = {
    skuId: params.data.id,
    quantityPerUnit: qty.toFixed(4),
    notes: notes ?? null,
  };
  if (ingredientId) insertValues.ingredientId = parseInt(ingredientId, 10);
  if (packagingItemId) insertValues.packagingItemId = parseInt(packagingItemId, 10);

  let line: any;
  try {
    [line] = await db.insert(costLinesTable).values(insertValues).returning();
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? "Failed to insert cost line. Run the DB migration first." });
    return;
  }

  try { await snapshotSku(params.data.id, "cost_line_added"); } catch { /* non-blocking */ }

  let itemName = "";
  let itemUnit = "";
  let itemCategory = "";
  let currentPrice: number | null = null;

  if (line.packagingItemId != null) {
    const [pkg] = await db.select().from(packagingItemsTable).where(eq(packagingItemsTable.id, line.packagingItemId)).limit(1);
    itemName = pkg?.nameEnglish ?? "";
    itemUnit = pkg?.unit ?? "";
    itemCategory = "Packaging";
    currentPrice = pkg ? parseFloat(pkg.unitCost) : null;
  } else if (line.ingredientId != null) {
    const [ing] = await db.select().from(ingredientsTable).where(eq(ingredientsTable.id, line.ingredientId)).limit(1);
    itemName = ing?.name ?? "";
    itemUnit = ing?.unit ?? "";
    itemCategory = ing?.category ?? "";
    const [priceRow] = await db
      .select({ price: ingredientPricesTable.price })
      .from(ingredientPricesTable)
      .where(eq(ingredientPricesTable.ingredientId, line.ingredientId))
      .orderBy(desc(ingredientPricesTable.effectiveDate), desc(ingredientPricesTable.createdAt))
      .limit(1);
    currentPrice = priceRow ? parseFloat(priceRow.price) : null;
  }

  const storedQty = parseFloat(line.quantityPerUnit);
  res.status(201).json({
    ...line,
    ingredientName: itemName,
    ingredientUnit: itemUnit,
    ingredientCategory: itemCategory,
    quantityPerUnit: storedQty,
    currentPrice,
    lineCost: currentPrice != null ? currentPrice * storedQty : null,
  });
});

router.patch("/skus/:id/cost-lines/:costLineId", requireAuth, async (req, res): Promise<void> => {
  const skuId = parseInt(req.params.id, 10);
  const costLineId = parseInt(req.params.costLineId, 10);

  if (isNaN(skuId) || isNaN(costLineId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const { ingredientId, packagingItemId, quantityPerUnit, notes } = req.body;
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
    updateData.packagingItemId = null;
  }
  if (packagingItemId != null && !isNaN(parseInt(packagingItemId, 10))) {
    updateData.packagingItemId = parseInt(packagingItemId, 10);
    updateData.ingredientId = null;
  }

  let line: any;
  try {
    [line] = await db
      .update(costLinesTable)
      .set(updateData)
      .where(eq(costLinesTable.id, costLineId))
      .returning();
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? "Failed to update cost line. Run the DB migration first." });
    return;
  }

  if (!line) {
    res.status(404).json({ error: "Cost line not found" });
    return;
  }

  try { await snapshotSku(skuId, "cost_line_updated"); } catch { /* non-blocking */ }

  let itemName = "";
  let itemUnit = "";
  let itemCategory: string | null = null;
  let currentPrice: number | null = null;

  if (line.packagingItemId != null) {
    const [pkg] = await db.select().from(packagingItemsTable).where(eq(packagingItemsTable.id, line.packagingItemId)).limit(1);
    itemName = pkg?.nameEnglish ?? "";
    itemUnit = pkg?.unit ?? "";
    itemCategory = "Packaging";
    currentPrice = pkg ? parseFloat(pkg.unitCost) : null;
  } else if (line.ingredientId != null) {
    const [ingredient] = await db.select().from(ingredientsTable).where(eq(ingredientsTable.id, line.ingredientId)).limit(1);
    itemName = ingredient?.name ?? "";
    itemUnit = ingredient?.unit ?? "";
    itemCategory = ingredient?.category ?? null;
    const [priceRow] = await db
      .select({ price: ingredientPricesTable.price })
      .from(ingredientPricesTable)
      .where(eq(ingredientPricesTable.ingredientId, line.ingredientId))
      .orderBy(desc(ingredientPricesTable.effectiveDate), desc(ingredientPricesTable.createdAt))
      .limit(1);
    currentPrice = priceRow ? parseFloat(priceRow.price) : null;
  }

  const storedQty = parseFloat(line.quantityPerUnit);
  res.json({
    ...line,
    ingredientName: itemName,
    ingredientUnit: itemUnit,
    ingredientCategory: itemCategory,
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
