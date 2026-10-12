import { pgTable, serial, text, timestamp, numeric, integer, date, index, foreignKey, unique } from "drizzle-orm/pg-core";
import { orgIdColumn, orgIsolation } from "./tenancy";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ingredientsTable = pgTable("ingredients", {
  orgId: orgIdColumn(),
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  subCategory: text("sub_category"),
  description: text("description"),
  unit: text("unit").notNull(),
  supplier: text("supplier"),
  priceTier1: numeric("price_tier1", { precision: 12, scale: 4 }),
  priceTier1Description: text("price_tier1_description"),
  priceTier2: numeric("price_tier2", { precision: 12, scale: 4 }),
  priceTier2Description: text("price_tier2_description"),
  notes: text("notes"),
  countryOfOrigin: text("country_of_origin"),
  createdBy: text("created_by"),
  photoUrl: text("photo_url"),
  photoContentType: text("photo_content_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("ingredients_org_id_id_unique").on(t.orgId, t.id),
  ...orgIsolation("ingredients", t.orgId),
]);

export const ingredientPricesTable = pgTable("ingredient_prices", {
  orgId: orgIdColumn(),
  id: serial("id").primaryKey(),
  ingredientId: integer("ingredient_id").notNull(),
  price: numeric("price", { precision: 12, scale: 4 }).notNull(),
  effectiveDate: date("effective_date").notNull(),
  reason: text("reason"),
  loggedBy: text("logged_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: "ingredient_prices_ingredient_id_fk", columns: [t.orgId, t.ingredientId], foreignColumns: [ingredientsTable.orgId, ingredientsTable.id] }).onDelete("cascade"),
  ...orgIsolation("ingredient_prices", t.orgId),
  index("ingredient_prices_ingredient_date_idx").on(t.ingredientId, t.effectiveDate),
]);

export const ingredientAttachmentsTable = pgTable("ingredient_attachments", {
  orgId: orgIdColumn(),
  id: serial("id").primaryKey(),
  ingredientId: integer("ingredient_id").notNull(),
  fileName: text("file_name").notNull(),
  objectPath: text("object_path").notNull(),
  fileType: text("file_type"),
  uploadedBy: text("uploaded_by"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: "ingredient_attachments_ingredient_id_fk", columns: [t.orgId, t.ingredientId], foreignColumns: [ingredientsTable.orgId, ingredientsTable.id] }).onDelete("cascade"),
  ...orgIsolation("ingredient_attachments", t.orgId),
  index("ingredient_attachments_ingredient_idx").on(t.ingredientId),
]);

export const ingredientTierPriceHistoryTable = pgTable("ingredient_tier_price_history", {
  orgId: orgIdColumn(),
  id: serial("id").primaryKey(),
  ingredientId: integer("ingredient_id").notNull(),
  tier: text("tier").notNull(),
  oldPrice: numeric("old_price", { precision: 12, scale: 4 }),
  newPrice: numeric("new_price", { precision: 12, scale: 4 }),
  oldDescription: text("old_description"),
  newDescription: text("new_description"),
  changedBy: text("changed_by"),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: "ingredient_tier_price_history_ingredient_id_fk", columns: [t.orgId, t.ingredientId], foreignColumns: [ingredientsTable.orgId, ingredientsTable.id] }).onDelete("cascade"),
  ...orgIsolation("ingredient_tier_price_history", t.orgId),
  index("ingredient_tier_history_ingredient_idx").on(t.ingredientId),
]);

export const insertIngredientSchema = createInsertSchema(ingredientsTable).omit({ id: true, createdAt: true });
export type InsertIngredient = z.infer<typeof insertIngredientSchema>;
export type Ingredient = typeof ingredientsTable.$inferSelect;

export const insertIngredientPriceSchema = createInsertSchema(ingredientPricesTable).omit({ id: true, createdAt: true });
export type InsertIngredientPrice = z.infer<typeof insertIngredientPriceSchema>;
export type IngredientPrice = typeof ingredientPricesTable.$inferSelect;

export const insertIngredientAttachmentSchema = createInsertSchema(ingredientAttachmentsTable).omit({ id: true, uploadedAt: true });
export type InsertIngredientAttachment = z.infer<typeof insertIngredientAttachmentSchema>;
export type IngredientAttachment = typeof ingredientAttachmentsTable.$inferSelect;

export const insertIngredientTierPriceHistorySchema = createInsertSchema(ingredientTierPriceHistoryTable).omit({ id: true, changedAt: true });
export type InsertIngredientTierPriceHistory = z.infer<typeof insertIngredientTierPriceHistorySchema>;
export type IngredientTierPriceHistory = typeof ingredientTierPriceHistoryTable.$inferSelect;

export const ingredientComponentsTable = pgTable("ingredient_components", {
  orgId: orgIdColumn(),
  id: serial("id").primaryKey(),
  parentIngredientId: integer("parent_ingredient_id").notNull(),
  childIngredientId: integer("child_ingredient_id").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull(),
  unit: text("unit").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: "ingredient_components_parent_ingredient_id_fk", columns: [t.orgId, t.parentIngredientId], foreignColumns: [ingredientsTable.orgId, ingredientsTable.id] }).onDelete("cascade"),
  foreignKey({ name: "ingredient_components_child_ingredient_id_fk", columns: [t.orgId, t.childIngredientId], foreignColumns: [ingredientsTable.orgId, ingredientsTable.id] }).onDelete("cascade"),
  ...orgIsolation("ingredient_components", t.orgId),
  index("ingredient_components_parent_idx").on(t.parentIngredientId),
]);

export type IngredientComponent = typeof ingredientComponentsTable.$inferSelect;
export type InsertIngredientComponent = typeof ingredientComponentsTable.$inferInsert;
