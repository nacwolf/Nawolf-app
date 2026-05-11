import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, skusTable, printingBlockSuppliersTable, skuPrintingBlockConfigsTable } from "@workspace/db";
import { getAuth } from "@clerk/express";
import { snapshotSku, getSkuWithMargin } from "../lib/kostr";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

function parseSupplier(row: typeof printingBlockSuppliersTable.$inferSelect) {
  return {
    ...row,
    pricePerBlock: parseFloat(row.pricePerBlock),
  };
}

function parseConfig(row: typeof skuPrintingBlockConfigsTable.$inferSelect) {
  return {
    ...row,
    retiredAt: row.retiredAt ? row.retiredAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/printing-block-suppliers", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(printingBlockSuppliersTable)
    .orderBy(printingBlockSuppliersTable.name);
  res.json(rows.map(parseSupplier));
});

router.post("/printing-block-suppliers", requireAuth, async (req, res): Promise<void> => {
  const { name, pricePerBlock, notes } = req.body;

  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (pricePerBlock == null || typeof pricePerBlock !== "number" || pricePerBlock < 0) {
    res.status(400).json({ error: "pricePerBlock must be a non-negative number" });
    return;
  }

  const [row] = await db
    .insert(printingBlockSuppliersTable)
    .values({
      name: name.trim(),
      pricePerBlock: pricePerBlock.toFixed(4),
      notes: notes?.trim() || null,
    })
    .returning();

  res.status(201).json(parseSupplier(row));
});

router.patch("/printing-block-suppliers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const { name, pricePerBlock, notes } = req.body;

  const [existing] = await db
    .select()
    .from(printingBlockSuppliersTable)
    .where(eq(printingBlockSuppliersTable.id, id));

  if (!existing) {
    res.status(404).json({ error: "Supplier not found" });
    return;
  }

  type UpdateData = Partial<typeof printingBlockSuppliersTable.$inferInsert>;
  const updateData: UpdateData = {};

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name cannot be empty" });
      return;
    }
    updateData.name = name.trim();
  }
  if (pricePerBlock !== undefined) {
    if (typeof pricePerBlock !== "number" || pricePerBlock < 0) {
      res.status(400).json({ error: "pricePerBlock must be a non-negative number" });
      return;
    }
    updateData.pricePerBlock = pricePerBlock.toFixed(4);
  }
  if (notes !== undefined) {
    updateData.notes = notes?.trim() || null;
  }

  const [updated] = await db
    .update(printingBlockSuppliersTable)
    .set(updateData)
    .where(eq(printingBlockSuppliersTable.id, id))
    .returning();

  res.json(parseSupplier(updated));
});

router.delete("/printing-block-suppliers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [existing] = await db
    .select()
    .from(printingBlockSuppliersTable)
    .where(eq(printingBlockSuppliersTable.id, id));

  if (!existing) {
    res.status(404).json({ error: "Supplier not found" });
    return;
  }

  const [activeRef] = await db
    .select({ id: skuPrintingBlockConfigsTable.id })
    .from(skuPrintingBlockConfigsTable)
    .where(
      and(
        eq(skuPrintingBlockConfigsTable.supplierId, id),
        eq(skuPrintingBlockConfigsTable.status, "active")
      )
    )
    .limit(1);

  if (activeRef) {
    res.status(409).json({ error: "Cannot delete supplier: it has active SKU printing block configs" });
    return;
  }

  try {
    await db.delete(printingBlockSuppliersTable).where(eq(printingBlockSuppliersTable.id, id));
    res.status(204).send();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("foreign key") || msg.includes("violates")) {
      res.status(409).json({ error: "Cannot delete supplier: it is referenced by existing configs" });
    } else {
      throw err;
    }
  }
});

router.get("/skus/:id/printing-block-configs", requireAuth, async (req, res): Promise<void> => {
  const skuId = parseInt(req.params.id, 10);
  if (isNaN(skuId)) {
    res.status(400).json({ error: "Invalid SKU id" });
    return;
  }

  const [sku] = await db.select({ id: skusTable.id }).from(skusTable).where(eq(skusTable.id, skuId)).limit(1);
  if (!sku) {
    res.status(404).json({ error: "SKU not found" });
    return;
  }

  const configs = await db
    .select({
      config: skuPrintingBlockConfigsTable,
      supplierName: printingBlockSuppliersTable.name,
      pricePerBlock: printingBlockSuppliersTable.pricePerBlock,
    })
    .from(skuPrintingBlockConfigsTable)
    .innerJoin(printingBlockSuppliersTable, eq(skuPrintingBlockConfigsTable.supplierId, printingBlockSuppliersTable.id))
    .where(eq(skuPrintingBlockConfigsTable.skuId, skuId))
    .orderBy(desc(skuPrintingBlockConfigsTable.createdAt));

  res.json(
    configs.map(({ config, supplierName, pricePerBlock }) => ({
      ...parseConfig(config),
      supplierName,
      pricePerBlock: parseFloat(pricePerBlock),
      amortizedCostPerUnit: (config.numBlocks * parseFloat(pricePerBlock)) / config.moq,
    }))
  );
});

router.get("/skus/:id/printing-block-config", requireAuth, async (req, res): Promise<void> => {
  const skuId = parseInt(req.params.id, 10);
  if (isNaN(skuId)) {
    res.status(400).json({ error: "Invalid SKU id" });
    return;
  }

  const [sku] = await db.select({ id: skusTable.id }).from(skusTable).where(eq(skusTable.id, skuId)).limit(1);
  if (!sku) {
    res.status(404).json({ error: "SKU not found" });
    return;
  }

  const [row] = await db
    .select({
      config: skuPrintingBlockConfigsTable,
      supplierName: printingBlockSuppliersTable.name,
      pricePerBlock: printingBlockSuppliersTable.pricePerBlock,
    })
    .from(skuPrintingBlockConfigsTable)
    .innerJoin(printingBlockSuppliersTable, eq(skuPrintingBlockConfigsTable.supplierId, printingBlockSuppliersTable.id))
    .where(and(eq(skuPrintingBlockConfigsTable.skuId, skuId), eq(skuPrintingBlockConfigsTable.status, "active")))
    .limit(1);

  if (!row) {
    res.json(null);
    return;
  }

  res.json({
    ...parseConfig(row.config),
    supplierName: row.supplierName,
    pricePerBlock: parseFloat(row.pricePerBlock),
    amortizedCostPerUnit: (row.config.numBlocks * parseFloat(row.pricePerBlock)) / row.config.moq,
  });
});

router.post("/skus/:id/printing-block-config", requireAuth, async (req, res): Promise<void> => {
  const skuId = parseInt(req.params.id, 10);
  if (isNaN(skuId)) {
    res.status(400).json({ error: "Invalid SKU id" });
    return;
  }

  const auth = getAuth(req);
  const { supplierId, numBlocks, moq } = req.body;

  const [sku] = await db.select({ id: skusTable.id }).from(skusTable).where(eq(skusTable.id, skuId)).limit(1);
  if (!sku) {
    res.status(404).json({ error: "SKU not found" });
    return;
  }

  if (!supplierId || typeof supplierId !== "number") {
    res.status(400).json({ error: "supplierId is required and must be a number" });
    return;
  }
  if (!numBlocks || typeof numBlocks !== "number" || numBlocks < 1) {
    res.status(400).json({ error: "numBlocks must be a positive integer" });
    return;
  }
  if (!moq || typeof moq !== "number" || moq < 1) {
    res.status(400).json({ error: "moq must be a positive integer" });
    return;
  }

  const [supplier] = await db
    .select()
    .from(printingBlockSuppliersTable)
    .where(eq(printingBlockSuppliersTable.id, supplierId))
    .limit(1);

  if (!supplier) {
    res.status(400).json({ error: "Supplier not found" });
    return;
  }

  const newConfig = await db.transaction(async (tx) => {
    const now = new Date();

    await tx
      .update(skuPrintingBlockConfigsTable)
      .set({ status: "retired", retiredAt: now, retiredBy: auth?.userId ?? null, retiredReason: "replaced" })
      .where(and(eq(skuPrintingBlockConfigsTable.skuId, skuId), eq(skuPrintingBlockConfigsTable.status, "active")));

    const [created] = await tx
      .insert(skuPrintingBlockConfigsTable)
      .values({
        skuId,
        supplierId,
        numBlocks,
        moq,
        status: "active",
      })
      .returning();

    return created;
  });

  await snapshotSku(skuId, `printing_block_config_set:sku_${skuId}`);

  res.status(201).json({
    ...parseConfig(newConfig),
    supplierName: supplier.name,
    pricePerBlock: parseFloat(supplier.pricePerBlock),
    amortizedCostPerUnit: (numBlocks * parseFloat(supplier.pricePerBlock)) / moq,
  });
});

router.post("/skus/:id/printing-block-config/retire", requireAuth, async (req, res): Promise<void> => {
  const skuId = parseInt(req.params.id, 10);
  if (isNaN(skuId)) {
    res.status(400).json({ error: "Invalid SKU id" });
    return;
  }

  const auth = getAuth(req);
  const { reason } = req.body;

  const [sku] = await db.select({ id: skusTable.id }).from(skusTable).where(eq(skusTable.id, skuId)).limit(1);
  if (!sku) {
    res.status(404).json({ error: "SKU not found" });
    return;
  }

  const [activeConfig] = await db
    .select()
    .from(skuPrintingBlockConfigsTable)
    .where(and(eq(skuPrintingBlockConfigsTable.skuId, skuId), eq(skuPrintingBlockConfigsTable.status, "active")))
    .limit(1);

  if (!activeConfig) {
    res.status(404).json({ error: "No active printing block config found for this SKU" });
    return;
  }

  const now = new Date();
  await db
    .update(skuPrintingBlockConfigsTable)
    .set({
      status: "retired",
      retiredAt: now,
      retiredReason: reason?.trim() || null,
      retiredBy: auth?.userId ?? null,
    })
    .where(eq(skuPrintingBlockConfigsTable.id, activeConfig.id));

  await snapshotSku(skuId, `printing_block_config_retired:sku_${skuId}`);

  const skuWithMargin = await getSkuWithMargin(skuId);
  res.json(skuWithMargin ?? { id: skuId, totalCogs: null, grossMargin: null, status: "unknown" });
});

router.delete("/skus/:id/printing-block-config", requireAuth, async (req, res): Promise<void> => {
  const skuId = parseInt(req.params.id, 10);
  if (isNaN(skuId)) {
    res.status(400).json({ error: "Invalid SKU id" });
    return;
  }

  const auth = getAuth(req);

  const [sku] = await db.select({ id: skusTable.id }).from(skusTable).where(eq(skusTable.id, skuId)).limit(1);
  if (!sku) {
    res.status(404).json({ error: "SKU not found" });
    return;
  }

  const [activeConfig] = await db
    .select()
    .from(skuPrintingBlockConfigsTable)
    .where(and(eq(skuPrintingBlockConfigsTable.skuId, skuId), eq(skuPrintingBlockConfigsTable.status, "active")))
    .limit(1);

  if (!activeConfig) {
    res.status(404).json({ error: "No active printing block config found for this SKU" });
    return;
  }

  const now = new Date();
  await db
    .update(skuPrintingBlockConfigsTable)
    .set({ status: "retired", retiredAt: now, retiredBy: auth?.userId ?? null, retiredReason: "deleted" })
    .where(eq(skuPrintingBlockConfigsTable.id, activeConfig.id));

  await snapshotSku(skuId, `printing_block_config_deleted:sku_${skuId}`);

  const skuWithMargin = await getSkuWithMargin(skuId);
  res.json(skuWithMargin ?? { id: skuId, totalCogs: null, grossMargin: null, status: "unknown" });
});

export default router;
