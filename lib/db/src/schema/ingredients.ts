import { pgTable, serial, text, timestamp, numeric, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ingredientsTable = pgTable("ingredients", {
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
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ingredientPricesTable = pgTable("ingredient_prices", {
  id: serial("id").primaryKey(),
  ingredientId: integer("ingredient_id").notNull().references(() => ingredientsTable.id, { onDelete: "cascade" }),
  price: numeric("price", { precision: 12, scale: 4 }).notNull(),
  effectiveDate: date("effective_date").notNull(),
  reason: text("reason"),
  loggedBy: text("logged_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ingredientAttachmentsTable = pgTable("ingredient_attachments", {
  id: serial("id").primaryKey(),
  ingredientId: integer("ingredient_id").notNull().references(() => ingredientsTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  objectPath: text("object_path").notNull(),
  fileType: text("file_type"),
  uploadedBy: text("uploaded_by"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertIngredientSchema = createInsertSchema(ingredientsTable).omit({ id: true, createdAt: true });
export type InsertIngredient = z.infer<typeof insertIngredientSchema>;
export type Ingredient = typeof ingredientsTable.$inferSelect;

export const insertIngredientPriceSchema = createInsertSchema(ingredientPricesTable).omit({ id: true, createdAt: true });
export type InsertIngredientPrice = z.infer<typeof insertIngredientPriceSchema>;
export type IngredientPrice = typeof ingredientPricesTable.$inferSelect;

export const insertIngredientAttachmentSchema = createInsertSchema(ingredientAttachmentsTable).omit({ id: true, uploadedAt: true });
export type InsertIngredientAttachment = z.infer<typeof insertIngredientAttachmentSchema>;
export type IngredientAttachment = typeof ingredientAttachmentsTable.$inferSelect;
