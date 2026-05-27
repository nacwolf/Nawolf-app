-- Add quotation and spec document columns to packaging_items
ALTER TABLE "packaging_items"
  ADD COLUMN IF NOT EXISTS "quotation_object_path"  text,
  ADD COLUMN IF NOT EXISTS "quotation_content_type" text,
  ADD COLUMN IF NOT EXISTS "quotation_file_name"    text,
  ADD COLUMN IF NOT EXISTS "spec_doc_object_path"   text,
  ADD COLUMN IF NOT EXISTS "spec_doc_content_type"  text,
  ADD COLUMN IF NOT EXISTS "spec_doc_file_name"     text;
