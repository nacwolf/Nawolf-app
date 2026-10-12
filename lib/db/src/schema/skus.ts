import { pgTable, serial, text, timestamp, numeric, integer, date, boolean, jsonb, unique, index, foreignKey } from "drizzle-orm/pg-core";
import { orgIdColumn, orgIsolation } from "./tenancy";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ingredientsTable } from "./ingredients";
import { packagingItemsTable } from "./packaging";

export const skusTable = pgTable("skus", {
  orgId: orgIdColumn(),
  id: serial("id").primaryKey(),
  skuCode: text("sku_code").notNull(),

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
  ingredientLines: jsonb("ingredient_lines").$type<Array<{ name: string; percentage: number }>>(),
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
}, (t) => [
  unique("skus_org_id_id_unique").on(t.orgId, t.id),
  ...orgIsolation("skus", t.orgId),
  unique("skus_org_sku_code_unique").on(t.orgId, t.skuCode),
]);

export const skuProductPhotosTable = pgTable("sku_product_photos", {
  orgId: orgIdColumn(),
  id: serial("id").primaryKey(),
  skuId: integer("sku_id").notNull(),
  objectPath: text("object_path").notNull(),
  contentType: text("content_type"),
  fileName: text("file_name"),
  sortOrder: integer("sort_order").notNull().default(0),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  uploadedBy: text("uploaded_by"),
}, (t) => [
  foreignKey({ name: "sku_product_photos_sku_id_fk", columns: [t.orgId, t.skuId], foreignColumns: [skusTable.orgId, skusTable.id] }).onDelete("cascade"),
  ...orgIsolation("sku_product_photos", t.orgId),
  index("sku_product_photos_sku_idx").on(t.skuId),
]);

export const skuCertificateFilesTable = pgTable("sku_certificate_files", {
  orgId: orgIdColumn(),
  id: serial("id").primaryKey(),
  skuId: integer("sku_id").notNull(),
  objectPath: text("object_path").notNull(),
  contentType: text("content_type"),
  fileName: text("file_name"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  uploadedBy: text("uploaded_by"),
}, (t) => [
  foreignKey({ name: "sku_certificate_files_sku_id_fk", columns: [t.orgId, t.skuId], foreignColumns: [skusTable.orgId, skusTable.id] }).onDelete("cascade"),
  ...orgIsolation("sku_certificate_files", t.orgId),
  index("sku_certificate_files_sku_idx").on(t.skuId),
]);

export const costLinesTable = pgTable("cost_lines", {
  orgId: orgIdColumn(),
  id: serial("id").primaryKey(),
  skuId: integer("sku_id").notNull(),
  ingredientId: integer("ingredient_id"),
  packagingItemId: integer("packaging_item_id"),
  quantityPerUnit: numeric("quantity_per_unit", { precision: 12, scale: 4 }).notNull(),
  notes: text("notes"),
}, (t) => [
  foreignKey({ name: "cost_lines_sku_id_fk", columns: [t.orgId, t.skuId], foreignColumns: [skusTable.orgId, skusTable.id] }).onDelete("cascade"),
  foreignKey({ name: "cost_lines_ingredient_id_fk", columns: [t.orgId, t.ingredientId], foreignColumns: [ingredientsTable.orgId, ingredientsTable.id] }).onDelete("restrict"),
  foreignKey({ name: "cost_lines_packaging_item_id_fk", columns: [t.orgId, t.packagingItemId], foreignColumns: [packagingItemsTable.orgId, packagingItemsTable.id] }).onDelete("restrict"),
  ...orgIsolation("cost_lines", t.orgId),
  index("cost_lines_sku_idx").on(t.skuId),
  index("cost_lines_ingredient_idx").on(t.ingredientId),
  index("cost_lines_packaging_idx").on(t.packagingItemId),
]);

export const skuSnapshotsTable = pgTable("sku_snapshots", {
  orgId: orgIdColumn(),
  id: serial("id").primaryKey(),
  skuId: integer("sku_id").notNull(),
  snapshotDate: date("snapshot_date").notNull(),
  totalCogs: numeric("total_cogs", { precision: 12, scale: 4 }).notNull(),
  sellPrice: numeric("sell_price", { precision: 12, scale: 4 }).notNull(),
  grossMargin: numeric("gross_margin", { precision: 10, scale: 6 }).notNull(),
  triggeredBy: text("triggered_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: "sku_snapshots_sku_id_fk", columns: [t.orgId, t.skuId], foreignColumns: [skusTable.orgId, skusTable.id] }).onDelete("cascade"),
  ...orgIsolation("sku_snapshots", t.orgId),
  index("sku_snapshots_sku_date_idx").on(t.skuId, t.snapshotDate),
]);

export const insertSkuSchema = createInsertSchema(skusTable).omit({ id: true, createdAt: true });
export type InsertSku = z.infer<typeof insertSkuSchema>;
export type Sku = typeof skusTable.$inferSelect;

export const insertCostLineSchema = createInsertSchema(costLinesTable).omit({ id: true });
export type InsertCostLine = z.infer<typeof insertCostLineSchema>;
export type CostLine = typeof costLinesTable.$inferSelect;

export const insertSkuSnapshotSchema = createInsertSchema(skuSnapshotsTable).omit({ id: true, createdAt: true });
export type InsertSkuSnapshot = z.infer<typeof insertSkuSnapshotSchema>;
export type SkuSnapshot = typeof skuSnapshotsTable.$inferSelect;
