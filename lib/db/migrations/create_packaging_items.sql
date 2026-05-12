-- Create packaging_category enum
DO $$ BEGIN
  CREATE TYPE "packaging_category" AS ENUM (
    'sachet_primary_bag',
    'inner_bag',
    'box_carton',
    'sticker_label',
    'oxygen_absorber',
    'desiccant',
    'shrink_wrap',
    'tray_insert',
    'printing_block',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create packaging_unit enum
DO $$ BEGIN
  CREATE TYPE "packaging_unit" AS ENUM ('piece', 'roll', 'kg', 'meter');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create packaging_items table
CREATE TABLE IF NOT EXISTS "packaging_items" (
  "id"                  serial PRIMARY KEY NOT NULL,
  "name_english"        text NOT NULL,
  "name_thai"           text,
  "category"            "packaging_category" NOT NULL,
  "supplier"            text,
  "unit"                "packaging_unit" NOT NULL DEFAULT 'piece',
  "unit_cost"           numeric(12,4) NOT NULL DEFAULT '0',
  "moq"                 integer,
  "lead_time_days"      integer,
  "notes"               text,
  "photo_object_path"   text,
  "photo_content_type"  text,
  "photo_file_name"     text,
  "specs"               jsonb,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now()
);
