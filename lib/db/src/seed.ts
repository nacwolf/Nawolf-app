// Sample data for one company: `pnpm --filter @workspace/db seed`.
// Targets SEED_ORG_ID (default "dev-org", the local mock's company). Refuses to
// run if that company already has SKUs, so it never duplicates data.
import { db, pool, withOrg, ingredientsTable, ingredientPricesTable, packagingItemsTable, teamMembersTable, overheadItemsTable, skusTable, costLinesTable } from "./index";

const orgId = process.env.SEED_ORG_ID ?? "dev-org";
const today = new Date().toISOString().slice(0, 10);

await withOrg(orgId, async () => {
  if ((await db.select({ id: skusTable.id }).from(skusTable).limit(1)).length > 0) {
    console.log(`Company ${orgId} already has SKUs; not seeding.`);
    return;
  }

  const [banana, oil, salt] = await db.insert(ingredientsTable).values([
    { name: "Nam Wah banana", category: "raw_material", unit: "kg", supplier: "Chanthaburi farm" },
    { name: "Palm oil", category: "raw_material", unit: "l", supplier: "Oleen" },
    { name: "Sea salt", category: "raw_material", unit: "kg" },
  ]).returning();
  await db.insert(ingredientPricesTable).values([
    { ingredientId: banana.id, price: "18", effectiveDate: today, reason: "seed" },
    { ingredientId: oil.id, price: "52", effectiveDate: today, reason: "seed" },
    { ingredientId: salt.id, price: "12", effectiveDate: today, reason: "seed" },
  ]);

  const [bag] = await db.insert(packagingItemsTable).values([
    { nameEnglish: "Stand-up pouch 100 g", category: "sachet_primary_bag", unitCost: "1.8", supplier: "PackThai" },
  ]).returning();

  await db.insert(teamMembersTable).values([
    { name: "Line operator", hourlyWage: "45", oncostPercent: "25" },
    { name: "Line operator 2", hourlyWage: "45", oncostPercent: "25" },
  ]);
  await db.insert(overheadItemsTable).values([
    { name: "Factory rent", monthlyAmount: "30000" },
    { name: "Insurance", monthlyAmount: "24000", frequency: "annual" },
  ]);

  const [sku] = await db.insert(skusTable).values({
    skuCode: "FG-001", nameThai: "กล้วยทอดกรอบ", name: "Crispy banana chips 100 g", sellPrice: "45", category: "Snacks",
  }).returning();
  await db.insert(costLinesTable).values([
    { skuId: sku.id, ingredientId: banana.id, quantityPerUnit: "0.25" },
    { skuId: sku.id, ingredientId: oil.id, quantityPerUnit: "0.03" },
    { skuId: sku.id, ingredientId: salt.id, quantityPerUnit: "0.002" },
    { skuId: sku.id, packagingItemId: bag.id, quantityPerUnit: "1" },
  ]);

  console.log(`Seeded company ${orgId}: 3 ingredients, 1 packaging item, 2 team members, 2 overhead items, 1 SKU.`);
});

await pool.end();
