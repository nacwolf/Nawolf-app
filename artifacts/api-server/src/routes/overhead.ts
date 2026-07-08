import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { overheadItemsTable, appSettingsTable } from "@workspace/db";
import { getAuth } from "@clerk/express";
import { recalculateOverheadForAllSkus } from "../lib/kostr";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

async function getOperatingDaysPerYear(): Promise<number> {
  const [setting] = await db
    .select({ value: appSettingsTable.value })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, "operating_days_per_year"))
    .limit(1);
  return setting?.value ? parseInt(setting.value, 10) : 250;
}

router.get("/overhead", requireAuth, async (req, res): Promise<void> => {
  const items = await db
    .select()
    .from(overheadItemsTable)
    .where(eq(overheadItemsTable.isActive, true))
    .orderBy(overheadItemsTable.sortOrder);

  const operatingDaysPerYear = await getOperatingDaysPerYear();
  const daysPerMonth = parseFloat((operatingDaysPerYear / 12).toFixed(1));

  const totalMonthly = items.reduce((s, i) => {
    const amount = parseFloat(i.monthlyAmount);
    const freq = i.frequency ?? "monthly";
    return s + (freq === "annual" ? amount / 12 : amount);
  }, 0);

  const utilitySettings = await db.select().from(appSettingsTable)
    .where(inArray(appSettingsTable.key, ["utilities_monthly_cost", "water_monthly_cost", "electricity_rate_per_kwh", "water_rate_per_liter"]));
  const settingsMap = Object.fromEntries(utilitySettings.map(s => [s.key, s.value ? parseFloat(s.value) : null]));

  res.json({
    items: items.map(i => ({
      ...i,
      monthlyAmount: parseFloat(i.monthlyAmount),
      frequency: i.frequency ?? "monthly",
    })),
    operatingDaysPerYear,
    daysPerMonth,
    totalMonthly: parseFloat(totalMonthly.toFixed(2)),
    utilitiesMonthly: settingsMap["utilities_monthly_cost"] ?? null,
    waterMonthly: settingsMap["water_monthly_cost"] ?? null,
    electricityRatePerKwh: settingsMap["electricity_rate_per_kwh"] ?? null,
    waterRatePerLiter: settingsMap["water_rate_per_liter"] ?? null,
  });
});

router.patch("/overhead/items/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { name, monthlyAmount, isActive, frequency } = req.body;
  const updateData: Record<string, any> = {};
  if (name != null) updateData.name = name.trim();
  if (monthlyAmount != null) updateData.monthlyAmount = parseFloat(monthlyAmount).toFixed(2);
  if (isActive != null) updateData.isActive = isActive;
  if (frequency != null && (frequency === "monthly" || frequency === "annual")) updateData.frequency = frequency;

  const [item] = await db.update(overheadItemsTable).set(updateData).where(eq(overheadItemsTable.id, id)).returning();
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }

  const affectedSkuCount = await recalculateOverheadForAllSkus(`overhead_item_updated:${id}`);

  res.json({
    item: { ...item, monthlyAmount: parseFloat(item.monthlyAmount), frequency: item.frequency ?? "monthly" },
    affectedSkuCount,
  });
});

router.post("/overhead/items", requireAuth, async (req, res): Promise<void> => {
  const { name, monthlyAmount, frequency } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: "Name required" }); return; }

  const [max] = await db
    .select({ m: overheadItemsTable.sortOrder })
    .from(overheadItemsTable)
    .orderBy(overheadItemsTable.sortOrder)
    .limit(1);
  const nextOrder = ((max?.m ?? 0) as number) + 10;

  const freq = frequency === "annual" ? "annual" : "monthly";

  const [item] = await db.insert(overheadItemsTable).values({
    name: name.trim(),
    monthlyAmount: parseFloat(monthlyAmount || "0").toFixed(2),
    frequency: freq,
    sortOrder: nextOrder,
  }).returning();

  const affectedSkuCount = await recalculateOverheadForAllSkus("overhead_item_added");

  res.status(201).json({
    item: { ...item, monthlyAmount: parseFloat(item.monthlyAmount), frequency: item.frequency ?? "monthly" },
    affectedSkuCount,
  });
});

router.patch("/overhead/settings", requireAuth, async (req, res): Promise<void> => {
  const { operatingDaysPerYear } = req.body;
  const days = parseInt(operatingDaysPerYear, 10);
  if (isNaN(days) || days < 1 || days > 365) {
    res.status(400).json({ error: "operatingDaysPerYear must be between 1 and 365" });
    return;
  }

  await db
    .insert(appSettingsTable)
    .values({ key: "operating_days_per_year", value: String(days), updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: String(days), updatedAt: new Date() } });

  const affectedSkuCount = await recalculateOverheadForAllSkus("operating_days_updated");
  const daysPerMonth = parseFloat((days / 12).toFixed(1));

  res.json({ operatingDaysPerYear: days, daysPerMonth, affectedSkuCount });
});

router.patch("/overhead/utilities", requireAuth, async (req, res): Promise<void> => {
  const { utilitiesMonthly, waterMonthly, electricityRatePerKwh, waterRatePerLiter } = req.body;
  const pairs: Array<{ key: string; val: number }> = [];
  if (utilitiesMonthly != null) pairs.push({ key: "utilities_monthly_cost", val: parseFloat(utilitiesMonthly) });
  if (waterMonthly != null) pairs.push({ key: "water_monthly_cost", val: parseFloat(waterMonthly) });
  if (electricityRatePerKwh != null) pairs.push({ key: "electricity_rate_per_kwh", val: parseFloat(electricityRatePerKwh) });
  if (waterRatePerLiter != null) pairs.push({ key: "water_rate_per_liter", val: parseFloat(waterRatePerLiter) });

  for (const { key, val } of pairs) {
    await db.insert(appSettingsTable).values({ key, value: String(val), updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: String(val), updatedAt: new Date() } });
  }

  const affectedSkuCount = await recalculateOverheadForAllSkus("utilities_settings_updated");
  res.json({ affectedSkuCount });
});

export default router;
