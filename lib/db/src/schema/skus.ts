import { pgTable, serial, text, timestamp, numeric, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ingredientsTable } from "./ingredients";

export const printingBlockSuppliersTable = pgTable("printing_block_suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  pricePerBlock: numeric("price_per_block", { precision: 12, scale: 4 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const skuPrintingBlockConfigsTable = pgTable("sku_printing_block_configs", {
  id: serial("id").primaryKey(),
  skuId: integer("sku_id").notNull().references(() => skusTable.id, { onDelete: "cascade" }),
  supplierId: integer("supplier_id").notNull().references(() => printingBlockSuppliersTable.id, { onDelete: "restrict" }),
  numBlocks: integer("num_blocks").notNull(),
  moq: integer("moq").notNull(),
  status: text("status").notNull().default("active"),
  retiredAt: timestamp("retired_at", { withTimezone: true }),
  retiredReason: text("retired_reason"),
  retiredBy: text("retired_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const skusTable = pgTable("skus", {
  id: serial("id").primaryKey(),
  skuCode: text("sku_code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  unitSize: text("unit_size").notNull(),
  sellPrice: numeric("sell_price", { precision: 12, scale: 4 }).notNull(),
  customerName: text("customer_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const costLinesTable = pgTable("cost_lines", {
  id: serial("id").primaryKey(),
  skuId: integer("sku_id").notNull().references(() => skusTable.id, { onDelete: "cascade" }),
  ingredientId: integer("ingredient_id").notNull().references(() => ingredientsTable.id, { onDelete: "restrict" }),
  quantityPerUnit: numeric("quantity_per_unit", { precision: 12, scale: 4 }).notNull(),
  notes: text("notes"),
});

export const skuSnapshotsTable = pgTable("sku_snapshots", {
  id: serial("id").primaryKey(),
  skuId: integer("sku_id").notNull().references(() => skusTable.id, { onDelete: "cascade" }),
  snapshotDate: date("snapshot_date").notNull(),
  totalCogs: numeric("total_cogs", { precision: 12, scale: 4 }).notNull(),
  sellPrice: numeric("sell_price", { precision: 12, scale: 4 }).notNull(),
  grossMargin: numeric("gross_margin", { precision: 10, scale: 6 }).notNull(),
  triggeredBy: text("triggered_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSkuSchema = createInsertSchema(skusTable).omit({ id: true, createdAt: true });
export type InsertSku = z.infer<typeof insertSkuSchema>;
export type Sku = typeof skusTable.$inferSelect;

export const insertCostLineSchema = createInsertSchema(costLinesTable).omit({ id: true });
export type InsertCostLine = z.infer<typeof insertCostLineSchema>;
export type CostLine = typeof costLinesTable.$inferSelect;

export const insertSkuSnapshotSchema = createInsertSchema(skuSnapshotsTable).omit({ id: true, createdAt: true });
export type InsertSkuSnapshot = z.infer<typeof insertSkuSnapshotSchema>;
export type SkuSnapshot = typeof skuSnapshotsTable.$inferSelect;
