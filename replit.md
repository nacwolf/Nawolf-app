# Kostr

## Overview

Kostr is a cost and margin tracking web app for food manufacturer/repacking SMEs. It helps production managers and factory accountants track ingredient costs, build SKU bills of materials, and monitor gross margins over time.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifact: `kostr`, previewPath: `/`)
- **API framework**: Express 5 (artifact: `api-server`)
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: Clerk (`@clerk/react@6.x`, `@clerk/express@2.x`)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Charts**: Recharts
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/kostr run dev` — run frontend locally

## Database Schema

- `ingredients` — ingredient catalog with name, category, unit, supplier
- `ingredient_prices` — price history per ingredient with effective_date, reason, logged_by
- `skus` — product SKUs with sku_code, sell_price, category, customer_name
- `cost_lines` — BOM (bill of materials) lines: sku_id + ingredient_id + quantity_per_unit
- `sku_snapshots` — historical COGS + margin snapshots per SKU, auto-created on price changes

## Business Logic

- **Gross margin**: `(sell_price - total_cogs) / sell_price`
- **Status**: Healthy (>25%), Review (10–25%), Critical (<10%), Unknown (no cost data)
- **Auto-recalculate**: When an ingredient price is updated, all SKUs using that ingredient get a new `sku_snapshots` row

## Key Files

- `lib/api-spec/openapi.yaml` — single source of truth for API contracts
- `lib/db/src/schema/` — Drizzle table definitions
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/kostr.ts` — business logic (margin calc, snapshot)
- `artifacts/kostr/src/` — React frontend pages and components
