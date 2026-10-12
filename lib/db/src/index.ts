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

// Requests borrow a connection only once they query, and give it back when the
// response ends. Slow clients (uploads) never hold one; a full pool fails fast.
// shortcut: pool max 10; raise DB_POOL_MAX or add PgBouncer (session mode) when traffic grows.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 10),
  connectionTimeoutMillis: 5_000,
  statement_timeout: 30_000,
  idle_in_transaction_session_timeout: 30_000,
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
  let connecting: Promise<pg.PoolClient> | undefined;
  let released = false;
  const connect = () =>
    (connecting ??= pool.connect().then(async (client) => {
      try {
        await client.query("select set_config('app.org_id', $1, false)", [orgId]);
        return client;
      } catch (err) {
        client.release(err as Error);
        throw err;
      }
    }));
  // Drizzle only calls query(). After release the connection may belong to
  // another request, so late queries are refused rather than run there.
  const lazyClient = {
    async query(...args: unknown[]) {
      if (released) throw new Error("DB query after the request ended");
      const client = await connect();
      return (client.query as (...a: unknown[]) => Promise<unknown>)(...args);
    },
  } as unknown as pg.PoolClient;

  try {
    return await requestDb.run(drizzle(lazyClient, { schema }), fn);
  } finally {
    released = true;
    if (connecting) {
      const client = await connecting.catch(() => undefined);
      if (client) {
        try {
          await client.query("reset app.org_id");
          client.release();
        } catch (err) {
          client.release(err as Error); // destroy rather than reuse a connection in unknown state
        }
      }
    }
  }
}

export * from "./schema";
