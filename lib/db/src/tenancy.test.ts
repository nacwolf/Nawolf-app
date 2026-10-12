// Integration test: needs DATABASE_URL pointing at a migrated database,
// connected as a non-superuser (superusers skip row-level security).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool, withOrg, ingredientsTable, ingredientPricesTable } from "./index";

const orgA = `test-a-${randomUUID()}`;
const orgB = `test-b-${randomUUID()}`;

after(async () => {
  for (const org of [orgA, orgB]) {
    await withOrg(org, async () => {
      await db.delete(ingredientPricesTable);
      await db.delete(ingredientsTable);
    });
  }
  await pool.end();
});

test("connection is not a superuser", async () => {
  const { rows } = await pool.query("select rolsuper, rolbypassrls from pg_roles where rolname = current_user");
  assert.deepEqual(rows[0], { rolsuper: false, rolbypassrls: false });
});

test("insert fills org_id from the request's org", async () => {
  const [row] = await withOrg(orgA, () =>
    db.insert(ingredientsTable).values({ name: "Salt", category: "raw", unit: "kg" }).returning(),
  );
  assert.equal(row.orgId, orgA);
});

test("another org cannot read, update or delete it", async () => {
  const [a] = await withOrg(orgA, () => db.select().from(ingredientsTable));
  assert.ok(a);

  await withOrg(orgB, async () => {
    assert.equal((await db.select().from(ingredientsTable)).length, 0);
    assert.equal((await db.update(ingredientsTable).set({ name: "hacked" }).where(eq(ingredientsTable.id, a.id)).returning()).length, 0);
    assert.equal((await db.delete(ingredientsTable).where(eq(ingredientsTable.id, a.id)).returning()).length, 0);
  });

  const [still] = await withOrg(orgA, () => db.select().from(ingredientsTable).where(eq(ingredientsTable.id, a.id)));
  assert.equal(still.name, "Salt");
});

test("cannot write a row tagged with another org", async () => {
  await assert.rejects(
    withOrg(orgB, () => db.insert(ingredientsTable).values({ orgId: orgA, name: "x", category: "raw", unit: "kg" })),
    (err: any) => /row-level security/.test(String(err?.cause ?? err)),
  );
});

test("cannot reference another org's row (composite foreign keys)", async () => {
  const [a] = await withOrg(orgA, () => db.select().from(ingredientsTable));
  await assert.rejects(
    withOrg(orgB, () => db.insert(ingredientPricesTable).values({ ingredientId: a.id, price: "1", effectiveDate: "2026-01-01" })),
    (err: any) => /foreign key/.test(String(err?.cause ?? err)),
  );
});

test("outside a request: reads see nothing, inserts fail", async () => {
  assert.equal((await db.select().from(ingredientsTable)).length, 0);
  await assert.rejects(
    db.insert(ingredientsTable).values({ name: "x", category: "raw", unit: "kg" }),
    (err: any) => /null value in column "org_id"|row-level security/.test(String(err?.cause ?? err)),
  );
});

test("org setting does not leak to the next request on a reused connection", async () => {
  await withOrg(orgA, async () => {});
  const { rows } = await pool.query("select current_setting('app.org_id', true) as org");
  assert.ok(!rows[0].org, `leaked org: ${rows[0].org}`);
});

test("slow requests that never query hold no connection (uploads cannot exhaust the pool)", async () => {
  const busy = () => pool.totalCount - pool.idleCount;
  const before = busy();
  let during = -1;
  await Promise.all(Array.from({ length: 25 }, () =>
    withOrg(orgA, () => new Promise<void>((resolve) => setTimeout(() => { during = busy(); resolve(); }, 30))),
  ));
  assert.equal(during, before);
});
