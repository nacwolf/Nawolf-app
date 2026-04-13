import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, ingredientsTable, ingredientPricesTable, costLinesTable, skusTable } from "@workspace/db";
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

  const [ingredient] = await db.insert(ingredientsTable).values(ingredientData).returning();

  if (initialPrice != null) {
    const today = new Date().toISOString().split("T")[0];
    await db.insert(ingredientPricesTable).values({
      ingredientId: ingredient.id,
      price: initialPrice.toFixed(4),
      effectiveDate: today,
      reason: "Initial price",
    });
  }

  res.status(201).json(ingredient);
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

  const [priceRow] = await db
    .select({ effectiveDate: ingredientPricesTable.effectiveDate })
    .from(ingredientPricesTable)
    .where(eq(ingredientPricesTable.ingredientId, ingredient.id))
    .orderBy(desc(ingredientPricesTable.effectiveDate), desc(ingredientPricesTable.createdAt))
    .limit(1);

  const [countRow] = await db
    .select({ count: sql<number>`count(distinct ${costLinesTable.skuId})` })
    .from(costLinesTable)
    .where(eq(costLinesTable.ingredientId, ingredient.id));

  res.json({
    ...ingredient,
    currentPrice,
    priceEffectiveDate: priceRow?.effectiveDate ?? null,
    skuCount: Number(countRow?.count ?? 0),
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

export default router;
