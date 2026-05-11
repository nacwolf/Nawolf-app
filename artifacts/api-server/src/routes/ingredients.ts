import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import {
  db,
  ingredientsTable,
  ingredientPricesTable,
  costLinesTable,
  skusTable,
  ingredientAttachmentsTable,
  ingredientTierPriceHistoryTable,
} from "@workspace/db";
import {
  CreateIngredientBody,
  GetIngredientParams,
  UpdateIngredientPriceParams,
  UpdateIngredientPriceBody,
  GetIngredientPriceHistoryParams,
  EditIngredientPriceParams,
  EditIngredientPriceBody,
  DeleteIngredientPriceParams,
} from "@workspace/api-zod";
import { getCurrentPrice, recalculateAllSkusUsingIngredient } from "../lib/kostr";
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

router.get("/ingredients", requireAuth, async (req, res): Promise<void> => {
  const ingredients = await db.select().from(ingredientsTable).orderBy(ingredientsTable.name);

  const result = await Promise.all(
    ingredients.map(async (ing) => {
      const currentPrice = await getCurrentPrice(ing.id);

      const priceRows = await db
        .select({ effectiveDate: ingredientPricesTable.effectiveDate, price: ingredientPricesTable.price })
        .from(ingredientPricesTable)
        .where(eq(ingredientPricesTable.ingredientId, ing.id))
        .orderBy(desc(ingredientPricesTable.effectiveDate), desc(ingredientPricesTable.createdAt))
        .limit(2);

      const [countRow] = await db
        .select({ count: sql<number>`count(distinct ${costLinesTable.skuId})` })
        .from(costLinesTable)
        .where(eq(costLinesTable.ingredientId, ing.id));

      const previousPrice = priceRows[1] ? parseFloat(priceRows[1].price) : null;
      const priceChangePct =
        previousPrice && currentPrice !== null && previousPrice !== 0
          ? ((currentPrice - previousPrice) / previousPrice) * 100
          : null;

      return {
        ...ing,
        priceTier1: ing.priceTier1 ? parseFloat(ing.priceTier1) : null,
        priceTier2: ing.priceTier2 ? parseFloat(ing.priceTier2) : null,
        currentPrice,
        priceEffectiveDate: priceRows[0]?.effectiveDate ?? null,
        skuCount: Number(countRow?.count ?? 0),
        previousPrice,
        priceChangePct,
      };
    })
  );

  res.json(result);
});

router.post("/ingredients", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateIngredientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const auth = getAuth(req);
  const { initialPrice, ...ingredientData } = parsed.data;

  const [ingredient] = await db.insert(ingredientsTable).values({
    ...ingredientData,
    createdBy: auth?.userId ?? null,
    priceTier1: ingredientData.priceTier1 != null ? String(ingredientData.priceTier1) : null,
    priceTier2: ingredientData.priceTier2 != null ? String(ingredientData.priceTier2) : null,
  }).returning();

  if (initialPrice != null) {
    const today = new Date().toISOString().split("T")[0];
    await db.insert(ingredientPricesTable).values({
      ingredientId: ingredient.id,
      price: initialPrice.toFixed(4),
      effectiveDate: today,
      reason: "Initial price",
      loggedBy: auth?.userId ?? null,
    });
  }

  if (ingredientData.priceTier1 != null) {
    await db.insert(ingredientTierPriceHistoryTable).values({
      ingredientId: ingredient.id,
      tier: "tier1",
      oldPrice: null,
      newPrice: String(ingredientData.priceTier1),
      oldDescription: null,
      newDescription: ingredientData.priceTier1Description ?? null,
      changedBy: auth?.userId ?? null,
    });
  }

  if (ingredientData.priceTier2 != null) {
    await db.insert(ingredientTierPriceHistoryTable).values({
      ingredientId: ingredient.id,
      tier: "tier2",
      oldPrice: null,
      newPrice: String(ingredientData.priceTier2),
      oldDescription: null,
      newDescription: ingredientData.priceTier2Description ?? null,
      changedBy: auth?.userId ?? null,
    });
  }

  res.status(201).json({
    ...ingredient,
    priceTier1: ingredient.priceTier1 ? parseFloat(ingredient.priceTier1) : null,
    priceTier2: ingredient.priceTier2 ? parseFloat(ingredient.priceTier2) : null,
  });
});

router.get("/ingredients/subcategories", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db
    .selectDistinct({ subCategory: ingredientsTable.subCategory })
    .from(ingredientsTable)
    .orderBy(ingredientsTable.subCategory);

  const subcategories = rows
    .map(r => r.subCategory)
    .filter((s): s is string => s != null && s.trim() !== "");

  res.json(subcategories);
});

router.get("/ingredients/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetIngredientParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [ingredient] = await db.select().from(ingredientsTable).where(eq(ingredientsTable.id, params.data.id));
  if (!ingredient) {
    res.status(404).json({ error: "Ingredient not found" });
    return;
  }

  const [currentPrice, priceRows, countRow, attachments] = await Promise.all([
    getCurrentPrice(ingredient.id),
    db
      .select({ effectiveDate: ingredientPricesTable.effectiveDate, price: ingredientPricesTable.price })
      .from(ingredientPricesTable)
      .where(eq(ingredientPricesTable.ingredientId, ingredient.id))
      .orderBy(desc(ingredientPricesTable.effectiveDate), desc(ingredientPricesTable.createdAt))
      .limit(2),
    db
      .select({ count: sql<number>`count(distinct ${costLinesTable.skuId})` })
      .from(costLinesTable)
      .where(eq(costLinesTable.ingredientId, ingredient.id))
      .then(r => r[0]),
    db
      .select()
      .from(ingredientAttachmentsTable)
      .where(eq(ingredientAttachmentsTable.ingredientId, ingredient.id))
      .orderBy(desc(ingredientAttachmentsTable.uploadedAt)),
  ]);

  const previousPrice = priceRows[1] ? parseFloat(priceRows[1].price) : null;
  const priceChangePct =
    previousPrice && currentPrice !== null && previousPrice !== 0
      ? ((currentPrice - previousPrice) / previousPrice) * 100
      : null;

  res.json({
    ...ingredient,
    priceTier1: ingredient.priceTier1 ? parseFloat(ingredient.priceTier1) : null,
    priceTier2: ingredient.priceTier2 ? parseFloat(ingredient.priceTier2) : null,
    currentPrice,
    priceEffectiveDate: priceRows[0]?.effectiveDate ?? null,
    skuCount: Number(countRow?.count ?? 0),
    previousPrice,
    priceChangePct,
    attachments,
  });
});

router.get("/ingredients/:id/skus", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ingredient id" });
    return;
  }

  const rows = await db
    .selectDistinct({ id: skusTable.id, name: skusTable.name, skuCode: skusTable.skuCode })
    .from(costLinesTable)
    .innerJoin(skusTable, eq(costLinesTable.skuId, skusTable.id))
    .where(eq(costLinesTable.ingredientId, id));

  res.json(rows);
});

router.patch("/ingredients/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ingredient id" });
    return;
  }

  const auth = getAuth(req);

  const ALLOWED_CATEGORIES = ["Raw Materials", "Packaging", "Quality & Compliance", "Delivery"] as const;
  const ALLOWED_UNITS = ["g", "kg", "liter", "ml", "piece", "box", "bag", "roll", "unit", "hr"] as const;

  interface PatchBody {
    name?: string;
    category?: string;
    unit?: string;
    supplier?: string | null;
    subCategory?: string | null;
    description?: string | null;
    notes?: string | null;
    priceTier1?: number | null;
    priceTier1Description?: string | null;
    priceTier2?: number | null;
    priceTier2Description?: string | null;
  }
  const body = req.body as PatchBody;

  if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) {
    res.status(400).json({ error: "Name cannot be empty" });
    return;
  }
  if (body.category !== undefined && !(ALLOWED_CATEGORIES as readonly string[]).includes(body.category)) {
    res.status(400).json({ error: `category must be one of: ${ALLOWED_CATEGORIES.join(", ")}` });
    return;
  }
  if (body.unit !== undefined && !(ALLOWED_UNITS as readonly string[]).includes(body.unit)) {
    res.status(400).json({ error: `unit must be one of: ${ALLOWED_UNITS.join(", ")}` });
    return;
  }

  const [current] = await db.select().from(ingredientsTable).where(eq(ingredientsTable.id, id));
  if (!current) {
    res.status(404).json({ error: "Ingredient not found" });
    return;
  }

  type IngredientUpdate = Partial<typeof ingredientsTable.$inferInsert>;
  const updateData: IngredientUpdate = {};

  if (body.name !== undefined) updateData.name = body.name;
  if (body.category !== undefined) updateData.category = body.category;
  if (body.unit !== undefined) updateData.unit = body.unit;
  if (body.supplier !== undefined) updateData.supplier = body.supplier?.trim() || null;
  if (body.subCategory !== undefined) updateData.subCategory = body.subCategory?.trim() || null;
  if (body.description !== undefined) updateData.description = body.description?.trim() || null;
  if (body.notes !== undefined) updateData.notes = body.notes || null;

  const tierChanges: Array<{ tier: string; oldPrice: string | null; newPrice: string | null; oldDesc: string | null; newDesc: string | null }> = [];

  const newTier1Price = body.priceTier1 !== undefined ? (body.priceTier1 != null ? String(body.priceTier1) : null) : undefined;
  const newTier1Desc = body.priceTier1Description !== undefined ? (body.priceTier1Description || null) : undefined;
  const newTier2Price = body.priceTier2 !== undefined ? (body.priceTier2 != null ? String(body.priceTier2) : null) : undefined;
  const newTier2Desc = body.priceTier2Description !== undefined ? (body.priceTier2Description || null) : undefined;

  if (newTier1Price !== undefined) updateData.priceTier1 = newTier1Price;
  if (newTier1Desc !== undefined) updateData.priceTier1Description = newTier1Desc;
  if (newTier2Price !== undefined) updateData.priceTier2 = newTier2Price;
  if (newTier2Desc !== undefined) updateData.priceTier2Description = newTier2Desc;

  const effectiveTier1Price = newTier1Price !== undefined ? newTier1Price : current.priceTier1;
  const effectiveTier1Desc = newTier1Desc !== undefined ? newTier1Desc : current.priceTier1Description;
  const effectiveTier2Price = newTier2Price !== undefined ? newTier2Price : current.priceTier2;
  const effectiveTier2Desc = newTier2Desc !== undefined ? newTier2Desc : current.priceTier2Description;

  const tier1Changed = (newTier1Price !== undefined && newTier1Price !== current.priceTier1) ||
    (newTier1Desc !== undefined && newTier1Desc !== current.priceTier1Description);
  const tier2Changed = (newTier2Price !== undefined && newTier2Price !== current.priceTier2) ||
    (newTier2Desc !== undefined && newTier2Desc !== current.priceTier2Description);

  if (tier1Changed) {
    tierChanges.push({ tier: "tier1", oldPrice: current.priceTier1, newPrice: effectiveTier1Price, oldDesc: current.priceTier1Description, newDesc: effectiveTier1Desc });
  }
  if (tier2Changed) {
    tierChanges.push({ tier: "tier2", oldPrice: current.priceTier2, newPrice: effectiveTier2Price, oldDesc: current.priceTier2Description, newDesc: effectiveTier2Desc });
  }

  const [updated] = await db
    .update(ingredientsTable)
    .set(updateData)
    .where(eq(ingredientsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Ingredient not found" });
    return;
  }

  if (tierChanges.length > 0) {
    await db.insert(ingredientTierPriceHistoryTable).values(
      tierChanges.map(tc => ({
        ingredientId: id,
        tier: tc.tier,
        oldPrice: tc.oldPrice,
        newPrice: tc.newPrice,
        oldDescription: tc.oldDesc,
        newDescription: tc.newDesc,
        changedBy: auth?.userId ?? null,
      }))
    );
  }

  res.json({
    ...updated,
    priceTier1: updated.priceTier1 ? parseFloat(updated.priceTier1) : null,
    priceTier2: updated.priceTier2 ? parseFloat(updated.priceTier2) : null,
  });
});

router.post("/ingredients/:id/price", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateIngredientPriceParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateIngredientPriceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [ingredient] = await db.select().from(ingredientsTable).where(eq(ingredientsTable.id, params.data.id));
  if (!ingredient) {
    res.status(404).json({ error: "Ingredient not found" });
    return;
  }

  const auth = getAuth(req);

  const hasTierUpdates = parsed.data.priceTier1 !== undefined || parsed.data.priceTier2 !== undefined;

  const newTier1 = parsed.data.priceTier1 !== undefined
    ? (parsed.data.priceTier1 != null ? parsed.data.priceTier1.toFixed(4) : null)
    : undefined;
  const newTier2 = parsed.data.priceTier2 !== undefined
    ? (parsed.data.priceTier2 != null ? parsed.data.priceTier2.toFixed(4) : null)
    : undefined;

  const tierChanges: Array<{ tier: string; oldPrice: string | null; newPrice: string | null }> = [];
  if (newTier1 !== undefined && newTier1 !== (ingredient.priceTier1 ?? null)) {
    tierChanges.push({ tier: "tier1", oldPrice: ingredient.priceTier1 ?? null, newPrice: newTier1 });
  }
  if (newTier2 !== undefined && newTier2 !== (ingredient.priceTier2 ?? null)) {
    tierChanges.push({ tier: "tier2", oldPrice: ingredient.priceTier2 ?? null, newPrice: newTier2 });
  }

  const ingredientPrice = await db.transaction(async (tx) => {
    const [priceRow] = await tx
      .insert(ingredientPricesTable)
      .values({
        ingredientId: params.data.id,
        price: parsed.data.price.toFixed(4),
        effectiveDate: parsed.data.effectiveDate,
        reason: parsed.data.reason ?? null,
        loggedBy: auth?.userId ?? null,
      })
      .returning();

    if (hasTierUpdates) {
      await tx
        .update(ingredientsTable)
        .set({
          ...(newTier1 !== undefined ? { priceTier1: newTier1 } : {}),
          ...(newTier2 !== undefined ? { priceTier2: newTier2 } : {}),
        })
        .where(eq(ingredientsTable.id, params.data.id));

      if (tierChanges.length > 0) {
        await tx.insert(ingredientTierPriceHistoryTable).values(
          tierChanges.map(tc => ({
            ingredientId: params.data.id,
            tier: tc.tier,
            oldPrice: tc.oldPrice,
            newPrice: tc.newPrice,
            changedBy: auth?.userId ?? null,
          }))
        );
      }
    }

    return priceRow;
  });

  const triggeredBy = `price_update:ingredient_${params.data.id}`;
  const affectedSkuCount = await recalculateAllSkusUsingIngredient(params.data.id, triggeredBy);

  res.json({
    ingredientPrice: {
      ...ingredientPrice,
      price: parseFloat(ingredientPrice.price),
    },
    affectedSkuCount,
  });
});

router.patch("/ingredients/:id/prices/:priceId", requireAuth, async (req, res): Promise<void> => {
  const params = EditIngredientPriceParams.safeParse({ id: req.params.id, priceId: req.params.priceId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = EditIngredientPriceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(ingredientPricesTable)
    .where(eq(ingredientPricesTable.id, params.data.priceId));

  if (!existing || existing.ingredientId !== params.data.id) {
    res.status(404).json({ error: "Price record not found" });
    return;
  }

  const [updated] = await db
    .update(ingredientPricesTable)
    .set({
      price: parsed.data.price.toFixed(4),
      effectiveDate: parsed.data.effectiveDate,
      reason: parsed.data.reason ?? null,
    })
    .where(eq(ingredientPricesTable.id, params.data.priceId))
    .returning();

  res.json({
    ...updated,
    price: parseFloat(updated.price),
  });
});

router.delete("/ingredients/:id/prices/:priceId", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteIngredientPriceParams.safeParse({ id: req.params.id, priceId: req.params.priceId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(ingredientPricesTable)
    .where(eq(ingredientPricesTable.id, params.data.priceId));

  if (!existing || existing.ingredientId !== params.data.id) {
    res.status(404).json({ error: "Price record not found" });
    return;
  }

  await db.delete(ingredientPricesTable).where(eq(ingredientPricesTable.id, params.data.priceId));

  res.status(204).send();
});

router.get("/ingredients/:id/price-history", requireAuth, async (req, res): Promise<void> => {
  const params = GetIngredientPriceHistoryParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const history = await db
    .select()
    .from(ingredientPricesTable)
    .where(eq(ingredientPricesTable.ingredientId, params.data.id))
    .orderBy(desc(ingredientPricesTable.effectiveDate), desc(ingredientPricesTable.createdAt));

  res.json(
    history.map((h) => ({
      ...h,
      price: parseFloat(h.price),
    }))
  );
});

router.get("/ingredients/:id/tier-price-history", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ingredient id" });
    return;
  }

  const history = await db
    .select()
    .from(ingredientTierPriceHistoryTable)
    .where(eq(ingredientTierPriceHistoryTable.ingredientId, id))
    .orderBy(desc(ingredientTierPriceHistoryTable.changedAt));

  res.json(
    history.map(h => ({
      ...h,
      oldPrice: h.oldPrice ? parseFloat(h.oldPrice) : null,
      newPrice: h.newPrice ? parseFloat(h.newPrice) : null,
    }))
  );
});

router.get("/ingredients/:id/attachments", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ingredient id" });
    return;
  }

  const attachments = await db
    .select()
    .from(ingredientAttachmentsTable)
    .where(eq(ingredientAttachmentsTable.ingredientId, id))
    .orderBy(desc(ingredientAttachmentsTable.uploadedAt));

  res.json(attachments);
});

const ALLOWED_ATTACHMENT_MIME_TYPES = ["application/pdf", "image/jpeg"] as const;

router.post("/ingredients/:id/attachments", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ingredient id" });
    return;
  }

  interface AttachmentBody { fileName?: string; objectPath?: string; fileType?: string; }
  const { fileName, objectPath, fileType } = req.body as AttachmentBody;

  if (!fileName || typeof fileName !== "string" || !fileName.trim()) {
    res.status(400).json({ error: "fileName is required" });
    return;
  }
  if (!objectPath || typeof objectPath !== "string" || !objectPath.startsWith("/objects/")) {
    res.status(400).json({ error: "objectPath is required and must be a valid object path" });
    return;
  }
  if (fileType !== undefined && !(ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(fileType)) {
    res.status(400).json({ error: `fileType must be one of: ${ALLOWED_ATTACHMENT_MIME_TYPES.join(", ")}` });
    return;
  }

  const auth = getAuth(req);

  const [ingredient] = await db.select({ id: ingredientsTable.id }).from(ingredientsTable).where(eq(ingredientsTable.id, id));
  if (!ingredient) {
    res.status(404).json({ error: "Ingredient not found" });
    return;
  }

  const [attachment] = await db
    .insert(ingredientAttachmentsTable)
    .values({
      ingredientId: id,
      fileName: fileName.trim(),
      objectPath,
      fileType: fileType ?? null,
      uploadedBy: auth?.userId ?? null,
    })
    .returning();

  res.status(201).json(attachment);
});

export default router;
