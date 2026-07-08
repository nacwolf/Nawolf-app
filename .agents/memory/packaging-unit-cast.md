---
name: packaging_items.unit enum cast
description: packaging_items.unit is a PostgreSQL enum type — must cast ::text when COALESCEd with text columns
---

The `packaging_items.unit` column in the DB is a PostgreSQL enum (`packaging_unit`), not `text`.

**Why:** COALESCE requires all arguments to be the same type. When the server used
`COALESCE(ingredients.unit, packaging_items.unit)`, PostgreSQL threw "types text and
packaging_unit cannot be matched", causing the try-block to fail silently and the fallback
(ingredients-only) query to run instead. Packaging cost lines then had `ingredientCategory = null`
and were invisible in the BOM table.

**How to apply:** Whenever joining or COALESCEing `packaging_items.unit` with a `text` column,
always cast: `packaging_items.unit::text` (or in Drizzle SQL template: `${packagingItemsTable.unit}::text`).
Affected routes at time of fix: GET /skus/:id and GET /skus/:id/cost-lines in `artifacts/api-server/src/routes/skus.ts`.
