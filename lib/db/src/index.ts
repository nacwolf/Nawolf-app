import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// shortcut: one pooled connection per in-flight request, pool max 10.
// Raise DB_POOL_MAX or put PgBouncer (session mode) in front when traffic grows.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 10),
});

const baseDb = drizzle(pool, { schema });
// $client differs (Pool vs PoolClient); routes only use the shared query API.
type Db = NodePgDatabase<typeof schema>;

const requestDb = new AsyncLocalStorage<Db>();

// Inside withOrg, `db` is the request's own connection tagged with app.org_id,
// so row-level security scopes every query to that company. Outside withOrg it
// is the plain pool, where org-scoped tables return nothing and inserts fail.
export const db = new Proxy(baseDb, {
  get(target, prop) {
    const current = requestDb.getStore() ?? target;
    const value = Reflect.get(current, prop, current);
    return typeof value === "function" ? value.bind(current) : value;
  },
}) as Db;

export async function withOrg<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let released = false;
  // A query after release would run on a connection another request may own.
  const guarded = new Proxy(client, {
    get(target, prop) {
      if (prop === "query" && released) {
        throw new Error("DB query after the request ended");
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  try {
    await client.query("select set_config('app.org_id', $1, false)", [orgId]);
    return await requestDb.run(drizzle(guarded, { schema }), fn);
  } finally {
    released = true;
    try {
      await client.query("reset app.org_id");
      client.release();
    } catch (err) {
      client.release(err as Error); // destroy rather than reuse a connection in unknown state
    }
  }
}

export * from "./schema";
