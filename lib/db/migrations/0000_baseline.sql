CREATE TYPE "public"."packaging_category" AS ENUM('sachet_primary_bag', 'inner_bag', 'box_carton', 'sticker_label', 'oxygen_absorber', 'desiccant', 'shrink_wrap', 'tray_insert', 'printing_block', 'other');--> statement-breakpoint
CREATE TYPE "public"."packaging_unit" AS ENUM('piece', 'roll', 'kg', 'meter');--> statement-breakpoint
CREATE TABLE "ingredient_attachments" (
	"org_id" text DEFAULT nullif(current_setting('app.org_id', true), '') NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"ingredient_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"object_path" text NOT NULL,
	"file_type" text,
	"uploaded_by" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingredient_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ingredient_components" (
	"org_id" text DEFAULT nullif(current_setting('app.org_id', true), '') NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"parent_ingredient_id" integer NOT NULL,
	"child_ingredient_id" integer NOT NULL,
	"quantity" numeric(12, 4) NOT NULL,
	"unit" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingredient_components" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ingredient_prices" (
	"org_id" text DEFAULT nullif(current_setting('app.org_id', true), '') NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"ingredient_id" integer NOT NULL,
	"price" numeric(12, 4) NOT NULL,
	"effective_date" date NOT NULL,
	"reason" text,
	"logged_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingredient_prices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ingredient_tier_price_history" (
	"org_id" text DEFAULT nullif(current_setting('app.org_id', true), '') NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"ingredient_id" integer NOT NULL,
	"tier" text NOT NULL,
	"old_price" numeric(12, 4),
	"new_price" numeric(12, 4),
	"old_description" text,
	"new_description" text,
	"changed_by" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingredient_tier_price_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ingredients" (
	"org_id" text DEFAULT nullif(current_setting('app.org_id', true), '') NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"sub_category" text,
	"description" text,
	"unit" text NOT NULL,
	"supplier" text,
	"price_tier1" numeric(12, 4),
	"price_tier1_description" text,
	"price_tier2" numeric(12, 4),
	"price_tier2_description" text,
	"notes" text,
	"country_of_origin" text,
	"created_by" text,
	"photo_url" text,
	"photo_content_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingredients_org_id_id_unique" UNIQUE("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "ingredients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cost_lines" (
	"org_id" text DEFAULT nullif(current_setting('app.org_id', true), '') NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"sku_id" integer NOT NULL,
	"ingredient_id" integer,
	"packaging_item_id" integer,
	"quantity_per_unit" numeric(12, 4) NOT NULL,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "cost_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sku_certificate_files" (
	"org_id" text DEFAULT nullif(current_setting('app.org_id', true), '') NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"sku_id" integer NOT NULL,
	"object_path" text NOT NULL,
	"content_type" text,
	"file_name" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_by" text
);
--> statement-breakpoint
ALTER TABLE "sku_certificate_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sku_product_photos" (
	"org_id" text DEFAULT nullif(current_setting('app.org_id', true), '') NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"sku_id" integer NOT NULL,
	"object_path" text NOT NULL,
	"content_type" text,
	"file_name" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_by" text
);
--> statement-breakpoint
ALTER TABLE "sku_product_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sku_snapshots" (
	"org_id" text DEFAULT nullif(current_setting('app.org_id', true), '') NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"sku_id" integer NOT NULL,
	"snapshot_date" date NOT NULL,
	"total_cogs" numeric(12, 4) NOT NULL,
	"sell_price" numeric(12, 4) NOT NULL,
	"gross_margin" numeric(10, 6) NOT NULL,
	"triggered_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sku_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "skus" (
	"org_id" text DEFAULT nullif(current_setting('app.org_id', true), '') NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"sku_code" text NOT NULL,
	"name" text,
	"name_thai" text NOT NULL,
	"brand_name" text,
	"category" text,
	"customer_name" text,
	"notes" text,
	"unit_size" text,
	"net_weight" numeric(10, 4),
	"net_weight_unit" text,
	"gross_weight" numeric(10, 4),
	"gross_weight_unit" text,
	"units_per_carton" integer,
	"carton_gross_weight" numeric(10, 4),
	"carton_gross_weight_unit" text,
	"carton_dim_l" numeric(10, 2),
	"carton_dim_w" numeric(10, 2),
	"carton_dim_h" numeric(10, 2),
	"shelf_life" integer,
	"shelf_life_unit" text,
	"storage_condition" text,
	"sell_price" numeric(12, 4) NOT NULL,
	"ex_factory_price" numeric(12, 4),
	"fob_price" numeric(12, 4),
	"moq" integer,
	"moq_unit" text,
	"fda_number" text,
	"barcode_ean13" text,
	"halal_certified" boolean DEFAULT false,
	"gmp_certified" boolean DEFAULT false,
	"haccp_certified" boolean DEFAULT false,
	"organic_certified" boolean DEFAULT false,
	"other_certifications" text,
	"product_description" text,
	"ingredients_list_thai" text,
	"ingredients_list_english" text,
	"ingredient_lines" jsonb,
	"allergen_info" text,
	"nutritional_info" text,
	"nutrition_doc_path" text,
	"nutrition_doc_content_type" text,
	"photo_url" text,
	"photo_content_type" text,
	"label_file_url" text,
	"label_file_content_type" text,
	"label_file_name" text,
	"spec_sheet_url" text,
	"spec_sheet_content_type" text,
	"spec_sheet_name" text,
	"dieline_url" text,
	"dieline_content_type" text,
	"dieline_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skus_org_id_id_unique" UNIQUE("org_id","id"),
	CONSTRAINT "skus_org_sku_code_unique" UNIQUE("org_id","sku_code")
);
--> statement-breakpoint
ALTER TABLE "skus" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_settings" (
	"org_id" text DEFAULT nullif(current_setting('app.org_id', true), '') NOT NULL,
	"key" text NOT NULL,
	"value" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_org_id_key_pk" PRIMARY KEY("org_id","key")
);
--> statement-breakpoint
ALTER TABLE "app_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "overhead_items" (
	"org_id" text DEFAULT nullif(current_setting('app.org_id', true), '') NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"monthly_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"frequency" text DEFAULT 'monthly' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "overhead_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "production_config_history" (
	"org_id" text DEFAULT nullif(current_setting('app.org_id', true), '') NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"sku_id" integer NOT NULL,
	"effective_date" text NOT NULL,
	"units_per_day" integer,
	"carton_size" integer DEFAULT 1 NOT NULL,
	"shift_hours" numeric(4, 2) DEFAULT '8' NOT NULL,
	"production_days_per_month" integer DEFAULT 20 NOT NULL,
	"team_member_ids" text,
	"labor_per_unit" numeric(12, 6),
	"overhead_per_unit" numeric(12, 6),
	"total_day_cost" numeric(12, 4),
	"change_reason" text,
	"change_note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "production_config_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sku_production_config" (
	"org_id" text DEFAULT nullif(current_setting('app.org_id', true), '') NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"sku_id" integer NOT NULL,
	"units_per_day" integer,
	"carton_size" integer DEFAULT 1 NOT NULL,
	"shift_hours" numeric(4, 2) DEFAULT '8' NOT NULL,
	"production_days_per_month" integer DEFAULT 20 NOT NULL,
	"notes" text,
	"labor_cost_per_unit" numeric(12, 6),
	"overhead_cost_per_unit" numeric(12, 6),
	"kwh_per_unit" numeric(10, 4),
	"liters_per_unit" numeric(10, 4),
	"utilities_cost_per_unit" numeric(12, 6),
	"water_cost_per_unit" numeric(12, 6),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sku_production_config_sku_id_unique" UNIQUE("sku_id")
);
--> statement-breakpoint
ALTER TABLE "sku_production_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sku_team_members" (
	"org_id" text DEFAULT nullif(current_setting('app.org_id', true), '') NOT NULL,
	"sku_id" integer NOT NULL,
	"team_member_id" integer NOT NULL,
	CONSTRAINT "sku_team_members_sku_id_team_member_id_pk" PRIMARY KEY("sku_id","team_member_id")
);
--> statement-breakpoint
ALTER TABLE "sku_team_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "team_members" (
	"org_id" text DEFAULT nullif(current_setting('app.org_id', true), '') NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role_description" text,
	"department" text DEFAULT 'production' NOT NULL,
	"pay_type" text DEFAULT 'hourly' NOT NULL,
	"hourly_wage" numeric(8, 2) DEFAULT '0' NOT NULL,
	"monthly_salary" numeric(10, 2),
	"oncost_percent" numeric(5, 2) DEFAULT '25' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_org_id_id_unique" UNIQUE("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "team_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "packaging_items" (
	"org_id" text DEFAULT nullif(current_setting('app.org_id', true), '') NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"name_english" text NOT NULL,
	"name_thai" text,
	"category" "packaging_category" NOT NULL,
	"supplier" text,
	"unit" "packaging_unit" DEFAULT 'piece' NOT NULL,
	"unit_cost" numeric(12, 4) DEFAULT '0' NOT NULL,
	"moq" integer,
	"lead_time_days" integer,
	"notes" text,
	"photo_object_path" text,
	"photo_content_type" text,
	"photo_file_name" text,
	"quotation_object_path" text,
	"quotation_content_type" text,
	"quotation_file_name" text,
	"spec_doc_object_path" text,
	"spec_doc_content_type" text,
	"spec_doc_file_name" text,
	"specs" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packaging_items_org_id_id_unique" UNIQUE("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "packaging_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ingredient_attachments" ADD CONSTRAINT "ingredient_attachments_ingredient_id_fk" FOREIGN KEY ("org_id","ingredient_id") REFERENCES "public"."ingredients"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_components" ADD CONSTRAINT "ingredient_components_parent_ingredient_id_fk" FOREIGN KEY ("org_id","parent_ingredient_id") REFERENCES "public"."ingredients"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_components" ADD CONSTRAINT "ingredient_components_child_ingredient_id_fk" FOREIGN KEY ("org_id","child_ingredient_id") REFERENCES "public"."ingredients"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_prices" ADD CONSTRAINT "ingredient_prices_ingredient_id_fk" FOREIGN KEY ("org_id","ingredient_id") REFERENCES "public"."ingredients"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_tier_price_history" ADD CONSTRAINT "ingredient_tier_price_history_ingredient_id_fk" FOREIGN KEY ("org_id","ingredient_id") REFERENCES "public"."ingredients"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_lines" ADD CONSTRAINT "cost_lines_sku_id_fk" FOREIGN KEY ("org_id","sku_id") REFERENCES "public"."skus"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_lines" ADD CONSTRAINT "cost_lines_ingredient_id_fk" FOREIGN KEY ("org_id","ingredient_id") REFERENCES "public"."ingredients"("org_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_lines" ADD CONSTRAINT "cost_lines_packaging_item_id_fk" FOREIGN KEY ("org_id","packaging_item_id") REFERENCES "public"."packaging_items"("org_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku_certificate_files" ADD CONSTRAINT "sku_certificate_files_sku_id_fk" FOREIGN KEY ("org_id","sku_id") REFERENCES "public"."skus"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku_product_photos" ADD CONSTRAINT "sku_product_photos_sku_id_fk" FOREIGN KEY ("org_id","sku_id") REFERENCES "public"."skus"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku_snapshots" ADD CONSTRAINT "sku_snapshots_sku_id_fk" FOREIGN KEY ("org_id","sku_id") REFERENCES "public"."skus"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_config_history" ADD CONSTRAINT "production_config_history_sku_id_fk" FOREIGN KEY ("org_id","sku_id") REFERENCES "public"."skus"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku_production_config" ADD CONSTRAINT "sku_production_config_sku_id_fk" FOREIGN KEY ("org_id","sku_id") REFERENCES "public"."skus"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku_team_members" ADD CONSTRAINT "sku_team_members_sku_id_fk" FOREIGN KEY ("org_id","sku_id") REFERENCES "public"."skus"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku_team_members" ADD CONSTRAINT "sku_team_members_team_member_id_fk" FOREIGN KEY ("org_id","team_member_id") REFERENCES "public"."team_members"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingredient_attachments_org_id_idx" ON "ingredient_attachments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ingredient_attachments_ingredient_idx" ON "ingredient_attachments" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "ingredient_components_org_id_idx" ON "ingredient_components" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ingredient_components_parent_idx" ON "ingredient_components" USING btree ("parent_ingredient_id");--> statement-breakpoint
CREATE INDEX "ingredient_prices_org_id_idx" ON "ingredient_prices" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ingredient_prices_ingredient_date_idx" ON "ingredient_prices" USING btree ("ingredient_id","effective_date");--> statement-breakpoint
CREATE INDEX "ingredient_tier_price_history_org_id_idx" ON "ingredient_tier_price_history" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ingredient_tier_history_ingredient_idx" ON "ingredient_tier_price_history" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "ingredients_org_id_idx" ON "ingredients" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "cost_lines_org_id_idx" ON "cost_lines" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "cost_lines_sku_idx" ON "cost_lines" USING btree ("sku_id");--> statement-breakpoint
CREATE INDEX "cost_lines_ingredient_idx" ON "cost_lines" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "cost_lines_packaging_idx" ON "cost_lines" USING btree ("packaging_item_id");--> statement-breakpoint
CREATE INDEX "sku_certificate_files_org_id_idx" ON "sku_certificate_files" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sku_certificate_files_sku_idx" ON "sku_certificate_files" USING btree ("sku_id");--> statement-breakpoint
CREATE INDEX "sku_product_photos_org_id_idx" ON "sku_product_photos" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sku_product_photos_sku_idx" ON "sku_product_photos" USING btree ("sku_id");--> statement-breakpoint
CREATE INDEX "sku_snapshots_org_id_idx" ON "sku_snapshots" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sku_snapshots_sku_date_idx" ON "sku_snapshots" USING btree ("sku_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "skus_org_id_idx" ON "skus" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "app_settings_org_id_idx" ON "app_settings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "overhead_items_org_id_idx" ON "overhead_items" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "production_config_history_org_id_idx" ON "production_config_history" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "production_config_history_sku_idx" ON "production_config_history" USING btree ("sku_id");--> statement-breakpoint
CREATE INDEX "sku_production_config_org_id_idx" ON "sku_production_config" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sku_team_members_org_id_idx" ON "sku_team_members" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sku_team_members_member_idx" ON "sku_team_members" USING btree ("team_member_id");--> statement-breakpoint
CREATE INDEX "team_members_org_id_idx" ON "team_members" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "packaging_items_org_id_idx" ON "packaging_items" USING btree ("org_id");--> statement-breakpoint
CREATE POLICY "ingredient_attachments_org_isolation" ON "ingredient_attachments" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), ''));--> statement-breakpoint
CREATE POLICY "ingredient_components_org_isolation" ON "ingredient_components" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), ''));--> statement-breakpoint
CREATE POLICY "ingredient_prices_org_isolation" ON "ingredient_prices" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), ''));--> statement-breakpoint
CREATE POLICY "ingredient_tier_price_history_org_isolation" ON "ingredient_tier_price_history" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), ''));--> statement-breakpoint
CREATE POLICY "ingredients_org_isolation" ON "ingredients" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), ''));--> statement-breakpoint
CREATE POLICY "cost_lines_org_isolation" ON "cost_lines" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), ''));--> statement-breakpoint
CREATE POLICY "sku_certificate_files_org_isolation" ON "sku_certificate_files" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), ''));--> statement-breakpoint
CREATE POLICY "sku_product_photos_org_isolation" ON "sku_product_photos" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), ''));--> statement-breakpoint
CREATE POLICY "sku_snapshots_org_isolation" ON "sku_snapshots" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), ''));--> statement-breakpoint
CREATE POLICY "skus_org_isolation" ON "skus" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), ''));--> statement-breakpoint
CREATE POLICY "app_settings_org_isolation" ON "app_settings" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), ''));--> statement-breakpoint
CREATE POLICY "overhead_items_org_isolation" ON "overhead_items" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), ''));--> statement-breakpoint
CREATE POLICY "production_config_history_org_isolation" ON "production_config_history" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), ''));--> statement-breakpoint
CREATE POLICY "sku_production_config_org_isolation" ON "sku_production_config" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), ''));--> statement-breakpoint
CREATE POLICY "sku_team_members_org_isolation" ON "sku_team_members" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), ''));--> statement-breakpoint
CREATE POLICY "team_members_org_isolation" ON "team_members" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), ''));--> statement-breakpoint
CREATE POLICY "packaging_items_org_isolation" ON "packaging_items" AS PERMISSIVE FOR ALL TO public USING (org_id = nullif(current_setting('app.org_id', true), '')) WITH CHECK (org_id = nullif(current_setting('app.org_id', true), ''));