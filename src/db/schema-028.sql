-- schema-028: operator poster layout standard per template (no candidate photo bytes)
SET search_path TO "so-candidate-data";

CREATE TABLE IF NOT EXISTS poster_layout_standards (
  template_id        text PRIMARY KEY,
  template_version   integer NOT NULL DEFAULT 2,
  layout             jsonb NOT NULL DEFAULT '{}'::jsonb,
  extras             jsonb NOT NULL DEFAULT '[]'::jsonb,
  image_side         text NOT NULL DEFAULT 'right',
  logo_variant       text NOT NULL DEFAULT 'people-navy',
  source_content_id  uuid REFERENCES campaign_contents(id) ON DELETE SET NULL,
  updated_by         text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
