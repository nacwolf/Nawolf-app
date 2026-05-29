-- Add labelling, structured ingredient list, and nutrition document columns to skus
ALTER TABLE "skus"
  ADD COLUMN IF NOT EXISTS "product_description"      text,
  ADD COLUMN IF NOT EXISTS "ingredient_lines"         jsonb,
  ADD COLUMN IF NOT EXISTS "nutrition_doc_path"       text,
  ADD COLUMN IF NOT EXISTS "nutrition_doc_content_type" text;
