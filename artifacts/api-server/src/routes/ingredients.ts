import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, ingredientsTable, ingredientPricesTable, costLinesTable, skusTable, ingredientAttachmentsTable } from "@workspace/db";
import {
  CreateIngredientBody,
  GetIngredientParams,
  UpdateIngredientPriceParams,
  UpdateIngredientPriceBody,
  GetIngredientPriceHistoryParams,
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

  const { initialPrice, ...ingredientData } = parsed.data;

  const [ingredient] = await db.insert(ingredientsTable).values({
    ...ingredientData,
    priceTier1: ingredientData.priceTier1 != null ? String(ingredientData.priceTier1) : null,
    priceTier2: ingredientData.priceTier2 != null ? String(ingredientData.priceTier2) : null,
  }).returning();

  if (initialPrice != null) {
    const auth = getAuth(req);
    const today = new Date().toISOString().split("T")[0];
    await db.insert(ingredientPricesTable).values({
      ingredientId: ingredient.id,
      price: initialPrice.toFixed(4),
      effectiveDate: today,
      reason: "Initial price",
      loggedBy: auth?.userId ?? null,
    });
  }

  res.status(201).json({
    ...ingredient,
    priceTier1: ingredient.priceTier1 ? parseFloat(ingredient.priceTier1) : null,
    priceTier2: ingredient.priceTier2 ? parseFloat(ingredient.priceTier2) : null,
  });
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

  const currentPrice = await getCurrentPrice(ingredient.id);

  const priceRows = await db
    .select({ effectiveDate: ingredientPricesTable.effectiveDate, price: ingredientPricesTable.price })
    .from(ingredientPricesTable)
    .where(eq(ingredientPricesTable.ingredientId, ingredient.id))
    .orderBy(desc(ingredientPricesTable.effectiveDate), desc(ingredientPricesTable.createdAt))
    .limit(2);

  const [countRow] = await db
    .select({ count: sql<number>`count(distinct ${costLinesTable.skuId})` })
    .from(costLinesTable)
    .where(eq(costLinesTable.ingredientId, ingredient.id));

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

  const { name, supplier, subCategory, description, priceTier1, priceTier1Description, priceTier2, priceTier2Description, notes } = req.body;

  const updateData: Record<string, any> = {};
  if (name !== undefined) {
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "Name cannot be empty" });
      return;
    }
    updateData.name = name.trim();
  }
  if (supplier !== undefined) updateData.supplier = supplier?.trim() || null;
  if (subCategory !== undefined) updateData.subCategory = subCategory?.trim() || null;
  if (description !== undefined) updateData.description = description?.trim() || null;
  if (priceTier1 !== undefined) updateData.priceTier1 = priceTier1 != null ? String(priceTier1) : null;
  if (priceTier1Description !== undefined) updateData.priceTier1Description = priceTier1Description || null;
  if (priceTier2 !== undefined) updateData.priceTier2 = priceTier2 != null ? String(priceTier2) : null;
  if (priceTier2Description !== undefined) updateData.priceTier2Description = priceTier2Description || null;
  if (notes !== undefined) updateData.notes = notes || null;

  const [updated] = await db
    .update(ingredientsTable)
    .set(updateData)
    .where(eq(ingredientsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Ingredient not found" });
    return;
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
  const [ingredientPrice] = await db
    .insert(ingredientPricesTable)
    .values({
      ingredientId: params.data.id,
      price: parsed.data.price.toFixed(4),
      effectiveDate: parsed.data.effectiveDate,
      reason: parsed.data.reason ?? null,
      loggedBy: auth?.userId ?? null,
    })
    .returning();

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

router.post("/ingredients/:id/attachments", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ingredient id" });
    return;
  }

  const { fileName, objectPath, fileType } = req.body;
  if (!fileName || !objectPath) {
    res.status(400).json({ error: "fileName and objectPath are required" });
    return;
  }

  const auth = getAuth(req);

  const [attachment] = await db
    .insert(ingredientAttachmentsTable)
    .values({
      ingredientId: id,
      fileName,
      objectPath,
      fileType: fileType ?? null,
      uploadedBy: auth?.userId ?? null,
    })
    .returning();

  res.status(201).json(attachment);
});

export default router;
