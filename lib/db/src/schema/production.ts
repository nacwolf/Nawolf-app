import { pgTable, serial, text, timestamp, numeric, integer, boolean, primaryKey, date, index } from "drizzle-orm/pg-core";
import { orgIdColumn, orgIsolation } from "./tenancy";
import { skusTable } from "./skus";

export const teamMembersTable = pgTable("team_members", {
  orgId: orgIdColumn(),
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  roleDescription: text("role_description"),
  department: text("department").notNull().default("production"),
  payType: text("pay_type").notNull().default("hourly"),
  hourlyWage: numeric("hourly_wage", { precision: 8, scale: 2 }).notNull().default("0"),
  monthlySalary: numeric("monthly_salary", { precision: 10, scale: 2 }),
  oncostPercent: numeric("oncost_percent", { precision: 5, scale: 2 }).notNull().default("25"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  ...orgIsolation("team_members", t.orgId),
]);

export const skuProductionConfigTable = pgTable("sku_production_config", {
  orgId: orgIdColumn(),
  id: serial("id").primaryKey(),
  skuId: integer("sku_id").notNull().unique().references(() => skusTable.id, { onDelete: "cascade" }),
  unitsPerDay: integer("units_per_day"),
  cartonSize: integer("carton_size").notNull().default(1),
  shiftHours: numeric("shift_hours", { precision: 4, scale: 2 }).notNull().default("8"),
  productionDaysPerMonth: integer("production_days_per_month").notNull().default(20),
  notes: text("notes"),
  laborCostPerUnit: numeric("labor_cost_per_unit", { precision: 12, scale: 6 }),
  overheadCostPerUnit: numeric("overhead_cost_per_unit", { precision: 12, scale: 6 }),
  kwhPerUnit: numeric("kwh_per_unit", { precision: 10, scale: 4 }),
  litersPerUnit: numeric("liters_per_unit", { precision: 10, scale: 4 }),
  utilitiesCostPerUnit: numeric("utilities_cost_per_unit", { precision: 12, scale: 6 }),
  waterCostPerUnit: numeric("water_cost_per_unit", { precision: 12, scale: 6 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  ...orgIsolation("sku_production_config", t.orgId),
]);

export const skuTeamMembersTable = pgTable("sku_team_members", {
  orgId: orgIdColumn(),
  skuId: integer("sku_id").notNull().references(() => skusTable.id, { onDelete: "cascade" }),
  teamMemberId: integer("team_member_id").notNull().references(() => teamMembersTable.id, { onDelete: "cascade" }),
}, (t) => [
  ...orgIsolation("sku_team_members", t.orgId),
  primaryKey({ columns: [t.skuId, t.teamMemberId] }),
  index("sku_team_members_member_idx").on(t.teamMemberId),
]);

export const overheadItemsTable = pgTable("overhead_items", {
  orgId: orgIdColumn(),
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  monthlyAmount: numeric("monthly_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  frequency: text("frequency").notNull().default("monthly"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [
  ...orgIsolation("overhead_items", t.orgId),
]);

export const appSettingsTable = pgTable("app_settings", {
  orgId: orgIdColumn(),
  key: text("key").notNull(),
  value: text("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  ...orgIsolation("app_settings", t.orgId),
  primaryKey({ columns: [t.orgId, t.key] }),
]);

export const productionConfigHistoryTable = pgTable("production_config_history", {
  orgId: orgIdColumn(),
  id: serial("id").primaryKey(),
  skuId: integer("sku_id").notNull().references(() => skusTable.id, { onDelete: "cascade" }),
  effectiveDate: text("effective_date").notNull(),
  unitsPerDay: integer("units_per_day"),
  cartonSize: integer("carton_size").notNull().default(1),
  shiftHours: numeric("shift_hours", { precision: 4, scale: 2 }).notNull().default("8"),
  productionDaysPerMonth: integer("production_days_per_month").notNull().default(20),
  teamMemberIds: text("team_member_ids"),
  laborPerUnit: numeric("labor_per_unit", { precision: 12, scale: 6 }),
  overheadPerUnit: numeric("overhead_per_unit", { precision: 12, scale: 6 }),
  totalDayCost: numeric("total_day_cost", { precision: 12, scale: 4 }),
  changeReason: text("change_reason"),
  changeNote: text("change_note"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  ...orgIsolation("production_config_history", t.orgId),
  index("production_config_history_sku_idx").on(t.skuId),
]);
