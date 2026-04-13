import { pgTable, serial, text, timestamp, numeric, integer, boolean, primaryKey } from "drizzle-orm/pg-core";
import { skusTable } from "./skus";

export const teamMembersTable = pgTable("team_members", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  roleDescription: text("role_description"),
  hourlyWage: numeric("hourly_wage", { precision: 8, scale: 2 }).notNull(),
  oncostPercent: numeric("oncost_percent", { precision: 5, scale: 2 }).notNull().default("25"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const skuProductionConfigTable = pgTable("sku_production_config", {
  id: serial("id").primaryKey(),
  skuId: integer("sku_id").notNull().unique().references(() => skusTable.id, { onDelete: "cascade" }),
  unitsPerDay: integer("units_per_day"),
  cartonSize: integer("carton_size").notNull().default(1),
  shiftHours: numeric("shift_hours", { precision: 4, scale: 2 }).notNull().default("8"),
  notes: text("notes"),
  laborCostPerUnit: numeric("labor_cost_per_unit", { precision: 12, scale: 6 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const skuTeamMembersTable = pgTable("sku_team_members", {
  skuId: integer("sku_id").notNull().references(() => skusTable.id, { onDelete: "cascade" }),
  teamMemberId: integer("team_member_id").notNull().references(() => teamMembersTable.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.skuId, t.teamMemberId] })]);

export const overheadItemsTable = pgTable("overhead_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  monthlyAmount: numeric("monthly_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const appSettingsTable = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
