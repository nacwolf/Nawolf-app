import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, ingredientsTable, ingredientPricesTable, costLinesTable } from "@workspace/db";
import { overheadItemsTable, appSettingsTable } from "@workspace/db";
import { getAuth } from "@clerk/express";
import { recalculateAllSkusUsingIngredient } from "../lib/kostr";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

async function getOrCreateOverheadIngredient(): Promise<number> {
  const [existing] = await db
    .select({ id: ingredientsTable.id })
    .from(ingredientsTable)
    .where(eq(ingredientsTable.name, "Overhead (auto)"))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(ingredientsTable)
    .values({ name: "Overhead (auto)", category: "Overhead", unit: "unit" })
    .returning({ id: ingredientsTable.id });
  return created.id;
}

router.get("/overhead", requireAuth, async (req, res): Promise<void> => {
  const items = await db.select().from(overheadItemsTable).where(eq(overheadItemsTable.isActive, true)).orderBy(overheadItemsTable.sortOrder);
  const [setting] = await db.select({ value: appSettingsTable.value }).from(appSettingsTable).where(eq(appSettingsTable.key, "total_units_per_month")).limit(1);
  const totalUnits = setting?.value ? parseInt(setting.value, 10) : null;
  const totalMonthly = items.reduce((s, i) => s + parseFloat(i.monthlyAmount), 0);
  const overheadPerUnit = totalUnits && totalUnits > 0 ? totalMonthly / totalUnits : null;

  res.json({
    items: items.map(i => ({ ...i, monthlyAmount: parseFloat(i.monthlyAmount) })),
    totalUnitsPerMonth: totalUnits,
    totalMonthly: parseFloat(totalMonthly.toFixed(2)),
    overheadPerUnit: overheadPerUnit ? parseFloat(overheadPerUnit.toFixed(4)) : null,
  });
});

router.patch("/overhead/items/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { name, monthlyAmount, isActive } = req.body;
  const updateData: Record<string, any> = {};
  if (name != null) updateData.name = name.trim();
  if (monthlyAmount != null) updateData.monthlyAmount = parseFloat(monthlyAmount).toFixed(2);
  if (isActive != null) updateData.isActive = isActive;

  const [item] = await db.update(overheadItemsTable).set(updateData).where(eq(overheadItemsTable.id, id)).returning();
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }

  res.json({ ...item, monthlyAmount: parseFloat(item.monthlyAmount) });
});

router.post("/overhead/items", requireAuth, async (req, res): Promise<void> => {
  const { name, monthlyAmount } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: "Name required" }); return; }

  const [max] = await db.select({ m: overheadItemsTable.sortOrder }).from(overheadItemsTable).orderBy(overheadItemsTable.sortOrder).limit(1);
  const nextOrder = ((max?.m ?? 0) as number) + 10;

  const [item] = await db.insert(overheadItemsTable).values({
    name: name.trim(),
    monthlyAmount: parseFloat(monthlyAmount || "0").toFixed(2),
    sortOrder: nextOrder,
  }).returning();

  res.status(201).json({ ...item, monthlyAmount: parseFloat(item.monthlyAmount) });
});

router.patch("/overhead/settings", requireAuth, async (req, res): Promise<void> => {
  const { totalUnitsPerMonth } = req.body;
  const units = parseInt(totalUnitsPerMonth, 10);
  if (isNaN(units) || units < 0) { res.status(400).json({ error: "totalUnitsPerMonth must be >= 0" }); return; }

  await db
    .insert(appSettingsTable)
    .values({ key: "total_units_per_month", value: String(units), updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: String(units), updatedAt: new Date() } });

  res.json({ totalUnitsPerMonth: units });
});

router.post("/overhead/apply", requireAuth, async (req, res): Promise<void> => {
  const items = await db.select().from(overheadItemsTable).where(eq(overheadItemsTable.isActive, true));
  const [setting] = await db.select({ value: appSettingsTable.value }).from(appSettingsTable).where(eq(appSettingsTable.key, "total_units_per_month")).limit(1);
  const totalUnits = setting?.value ? parseInt(setting.value, 10) : 0;
  if (!totalUnits || totalUnits === 0) {
    res.status(400).json({ error: "Set total units per month first" });
    return;
  }

  const totalMonthly = items.reduce((s, i) => s + parseFloat(i.monthlyAmount), 0);
  const overheadPerUnit = totalMonthly / totalUnits;

  const overheadIngId = await getOrCreateOverheadIngredient();
  const today = new Date().toISOString().split("T")[0];
  await db.insert(ingredientPricesTable).values({
    ingredientId: overheadIngId,
    price: overheadPerUnit.toFixed(4),
    effectiveDate: today,
    reason: "Overhead auto-calculated",
  });

  const affectedSkuCount = await recalculateAllSkusUsingIngredient(overheadIngId, "overhead_updated");

  res.json({ overheadPerUnit: parseFloat(overheadPerUnit.toFixed(4)), totalMonthly, affectedSkuCount, overheadIngredientId: overheadIngId });
});

export default router;
