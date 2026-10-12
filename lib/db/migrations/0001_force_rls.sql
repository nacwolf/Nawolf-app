-- Owners bypass RLS unless forced; the app may connect as the owner. Superusers always bypass, so never run the app as one.
ALTER TABLE "ingredient_attachments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ingredient_components" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ingredient_prices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ingredient_tier_price_history" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ingredients" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cost_lines" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sku_certificate_files" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sku_product_photos" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sku_snapshots" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "skus" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "overhead_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "production_config_history" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sku_production_config" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sku_team_members" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "team_members" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "packaging_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
