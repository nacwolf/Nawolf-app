import { pgTable, serial, text, timestamp, numeric, integer, pgEnum, jsonb } from "drizzle-orm/pg-core";

export const packagingCategoryEnum = pgEnum("packaging_category", [
  "sachet_primary_bag",
  "inner_bag",
  "box_carton",
  "sticker_label",
  "oxygen_absorber",
  "desiccant",
  "shrink_wrap",
  "tray_insert",
  "printing_block",
  "other",
]);

export const packagingUnitEnum = pgEnum("packaging_unit", ["piece", "roll", "kg", "meter"]);

export const packagingItemsTable = pgTable("packaging_items", {
  id: serial("id").primaryKey(),
  nameEnglish: text("name_english").notNull(),
  nameThai: text("name_thai"),
  category: packagingCategoryEnum("category").notNull(),
  supplier: text("supplier"),
  unit: packagingUnitEnum("unit").notNull().default("piece"),
  unitCost: numeric("unit_cost", { precision: 12, scale: 4 }).notNull().default("0"),
  moq: integer("moq"),
  leadTimeDays: integer("lead_time_days"),
  notes: text("notes"),
  photoObjectPath: text("photo_object_path"),
  photoContentType: text("photo_content_type"),
  photoFileName: text("photo_file_name"),
  specs: jsonb("specs"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PackagingItem = typeof packagingItemsTable.$inferSelect;
export type InsertPackagingItem = typeof packagingItemsTable.$inferInsert;
