import { pgTable, serial, text, timestamp, numeric, integer, date, pgEnum, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ingredientsTable } from "./ingredients";

export const printingBlockConfigStatusEnum = pgEnum("printing_block_config_status", ["active", "retired"]);

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
  supplierId: integer("supplier_id").notNull().references(() => printingBlockSuppliersTable.id, { onDelete: "cascade" }),
  numBlocks: integer("num_blocks").notNull(),
  moq: integer("moq").notNull(),
  status: printingBlockConfigStatusEnum("status").notNull().default("active"),
  retiredAt: timestamp("retired_at", { withTimezone: true }),
  retiredReason: text("retired_reason"),
  retiredBy: text("retired_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const skusTable = pgTable("skus", {
  id: serial("id").primaryKey(),
  skuCode: text("sku_code").notNull().unique(),

  // Section I — Basic Identity
  name: text("name"),
  nameThai: text("name_thai").notNull(),
  brandName: text("brand_name"),
  category: text("category"),
  customerName: text("customer_name"),
  notes: text("notes"),

  // Section II — Physical Specifications
  unitSize: text("unit_size"),
  netWeight: numeric("net_weight", { precision: 10, scale: 4 }),
  netWeightUnit: text("net_weight_unit"),
  grossWeight: numeric("gross_weight", { precision: 10, scale: 4 }),
  grossWeightUnit: text("gross_weight_unit"),
  unitsPerCarton: integer("units_per_carton"),
  cartonGrossWeight: numeric("carton_gross_weight", { precision: 10, scale: 4 }),
  cartonGrossWeightUnit: text("carton_gross_weight_unit"),
  cartonDimL: numeric("carton_dim_l", { precision: 10, scale: 2 }),
  cartonDimW: numeric("carton_dim_w", { precision: 10, scale: 2 }),
  cartonDimH: numeric("carton_dim_h", { precision: 10, scale: 2 }),
  shelfLife: integer("shelf_life"),
  shelfLifeUnit: text("shelf_life_unit"),
  storageCondition: text("storage_condition"),

  // Section III — Pricing & Commercial
  sellPrice: numeric("sell_price", { precision: 12, scale: 4 }).notNull(),
  exFactoryPrice: numeric("ex_factory_price", { precision: 12, scale: 4 }),
  fobPrice: numeric("fob_price", { precision: 12, scale: 4 }),
  moq: integer("moq"),
  moqUnit: text("moq_unit"),

  // Section IV — Regulatory & Compliance
  fdaNumber: text("fda_number"),
  barcodeEan13: text("barcode_ean13"),
  halalCertified: boolean("halal_certified").default(false),
  gmpCertified: boolean("gmp_certified").default(false),
  haccpCertified: boolean("haccp_certified").default(false),
  organicCertified: boolean("organic_certified").default(false),
  otherCertifications: text("other_certifications"),

  // Section V — Labelling & Files (text / structured fields)
  productDescription: text("product_description"),
  ingredientsListThai: text("ingredients_list_thai"),
  ingredientsListEnglish: text("ingredients_list_english"),
  ingredientLines: jsonb("ingredient_lines").$type<Array<{ nameThai: string; nameEnglish: string; percentage: number }>>(),
  allergenInfo: text("allergen_info"),
  nutritionalInfo: text("nutritional_info"),
  nutritionDocPath: text("nutrition_doc_path"),
  nutritionDocContentType: text("nutrition_doc_content_type"),

  // Section V — Single file uploads
  photoUrl: text("photo_url"),
  photoContentType: text("photo_content_type"),
  labelFileUrl: text("label_file_url"),
  labelFileContentType: text("label_file_content_type"),
  labelFileName: text("label_file_name"),
  specSheetUrl: text("spec_sheet_url"),
  specSheetContentType: text("spec_sheet_content_type"),
  specSheetFileName: text("spec_sheet_name"),
  dielineUrl: text("dieline_url"),
  dielineContentType: text("dieline_content_type"),
  dielineFileName: text("dieline_name"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const skuProductPhotosTable = pgTable("sku_product_photos", {
  id: serial("id").primaryKey(),
  skuId: integer("sku_id").notNull().references(() => skusTable.id, { onDelete: "cascade" }),
  objectPath: text("object_path").notNull(),
  contentType: text("content_type"),
  fileName: text("file_name"),
  sortOrder: integer("sort_order").notNull().default(0),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  uploadedBy: text("uploaded_by"),
});

export const skuCertificateFilesTable = pgTable("sku_certificate_files", {
  id: serial("id").primaryKey(),
  skuId: integer("sku_id").notNull().references(() => skusTable.id, { onDelete: "cascade" }),
  objectPath: text("object_path").notNull(),
  contentType: text("content_type"),
  fileName: text("file_name"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  uploadedBy: text("uploaded_by"),
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
