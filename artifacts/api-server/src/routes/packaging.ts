import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, packagingItemsTable } from "@workspace/db";
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

function parseItem(row: typeof packagingItemsTable.$inferSelect) {
  return {
    ...row,
    unitCost: parseFloat(row.unitCost),
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/packaging", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(packagingItemsTable).orderBy(asc(packagingItemsTable.nameEnglish));
  res.json(rows.map(parseItem));
});

router.post("/packaging", requireAuth, async (req, res): Promise<void> => {
  const { nameEnglish, nameThai, category, supplier, unit, unitCost, moq, leadTimeDays, notes, specs } = req.body;

  if (!nameEnglish || typeof nameEnglish !== "string" || !nameEnglish.trim()) {
    res.status(400).json({ error: "nameEnglish is required" });
    return;
  }
  if (!category) {
    res.status(400).json({ error: "category is required" });
    return;
  }

  const [row] = await db.insert(packagingItemsTable).values({
    nameEnglish: nameEnglish.trim(),
    nameThai: nameThai?.trim() || null,
    category,
    supplier: supplier?.trim() || null,
    unit: unit || "piece",
    unitCost: ((unitCost ?? 0) as number).toFixed(4),
    moq: moq ?? null,
    leadTimeDays: leadTimeDays ?? null,
    notes: notes?.trim() || null,
    specs: specs ?? null,
  }).returning();

  res.status(201).json(parseItem(row));
});

router.get("/packaging/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db.select().from(packagingItemsTable).where(eq(packagingItemsTable.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  res.json(parseItem(row));
});

router.patch("/packaging/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(packagingItemsTable).where(eq(packagingItemsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const { nameEnglish, nameThai, category, supplier, unit, unitCost, moq, leadTimeDays, notes, specs } = req.body;

  type UpdateData = Partial<typeof packagingItemsTable.$inferInsert>;
  const update: UpdateData = {};

  if (nameEnglish !== undefined) {
    if (!nameEnglish?.trim()) { res.status(400).json({ error: "nameEnglish cannot be empty" }); return; }
    update.nameEnglish = nameEnglish.trim();
  }
  if (nameThai !== undefined) update.nameThai = nameThai?.trim() || null;
  if (category !== undefined) update.category = category;
  if (supplier !== undefined) update.supplier = supplier?.trim() || null;
  if (unit !== undefined) update.unit = unit;
  if (unitCost !== undefined) update.unitCost = ((unitCost ?? 0) as number).toFixed(4);
  if (moq !== undefined) update.moq = moq;
  if (leadTimeDays !== undefined) update.leadTimeDays = leadTimeDays;
  if (notes !== undefined) update.notes = notes?.trim() || null;
  if (specs !== undefined) update.specs = specs;

  if (Object.keys(update).length === 0) {
    res.json(parseItem(existing));
    return;
  }

  const [updated] = await db.update(packagingItemsTable).set(update).where(eq(packagingItemsTable.id, id)).returning();
  res.json(parseItem(updated));
});

router.delete("/packaging/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(packagingItemsTable).where(eq(packagingItemsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  await db.delete(packagingItemsTable).where(eq(packagingItemsTable.id, id));
  res.status(204).send();
});

router.patch("/packaging/:id/photo", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { objectPath, contentType, fileName } = req.body;
  if (!objectPath) { res.status(400).json({ error: "objectPath is required" }); return; }

  const [existing] = await db.select().from(packagingItemsTable).where(eq(packagingItemsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const [updated] = await db.update(packagingItemsTable).set({
    photoObjectPath: objectPath,
    photoContentType: contentType || null,
    photoFileName: fileName || null,
  }).where(eq(packagingItemsTable.id, id)).returning();

  res.json(parseItem(updated));
});

router.delete("/packaging/:id/photo", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(packagingItemsTable).where(eq(packagingItemsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const [updated] = await db.update(packagingItemsTable).set({
    photoObjectPath: null,
    photoContentType: null,
    photoFileName: null,
  }).where(eq(packagingItemsTable.id, id)).returning();

  res.json(parseItem(updated));
});

export default router;
