-- Add department, pay_type, and monthly_salary columns to team_members
-- department: 'production' | 'management'  (default 'production')
-- pay_type:   'hourly'     | 'monthly'     (default 'hourly')
-- monthly_salary: nullable — set when pay_type = 'monthly'
ALTER TABLE "team_members"
  ADD COLUMN IF NOT EXISTS "department"       text NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS "pay_type"         text NOT NULL DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS "monthly_salary"   numeric(10, 2);

-- sku_team_members semantics changed from INCLUSIONS to EXCLUSIONS.
-- Previously: listed which team members work on a SKU.
-- Now:        lists which production members are EXCLUDED from a SKU.
-- All active production members are included by default; only exceptions are stored here.
-- Clear any existing inclusion rows so the new exclusion model starts clean.
DELETE FROM "sku_team_members";
