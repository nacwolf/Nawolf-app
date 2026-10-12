import { sql } from "drizzle-orm";
import { text, pgPolicy, index, type AnyPgColumn } from "drizzle-orm/pg-core";

// Multi-company isolation. Every table has org_id, filled from the per-request
// setting app.org_id (set by withOrg in ../index.ts). Row-level security then
// hides other companies' rows from every query, even one that forgets a WHERE.
// A pooled connection that once had the setting reports '' after RESET, so
// treat '' as unset: the default becomes NULL (insert fails) and nothing matches.
// FK checks ignore RLS, so every foreign key is composite (org_id, id): a row
// can only reference a row of the same company.
const currentOrg = sql`nullif(current_setting('app.org_id', true), '')`;

export const orgIdColumn = () => text("org_id").notNull().default(currentOrg);

const sameOrg = sql`org_id = ${currentOrg}`;

export const orgIsolation = (table: string, orgId: AnyPgColumn) => [
  pgPolicy(`${table}_org_isolation`, { as: "permissive", for: "all", using: sameOrg, withCheck: sameOrg }),
  index(`${table}_org_id_idx`).on(orgId),
];
