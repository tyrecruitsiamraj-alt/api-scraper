-- schema-024: editable recruitment posters keep the AI source image separate
-- from the rendered PNG and store the structured text used by the template.
SET search_path TO "so-candidate-data";

ALTER TABLE campaign_contents ADD COLUMN IF NOT EXISTS source_image_bytes bytea;
ALTER TABLE campaign_contents ADD COLUMN IF NOT EXISTS source_image_mime text;
ALTER TABLE campaign_contents ADD COLUMN IF NOT EXISTS poster_fields jsonb;

-- Codex previews created before this schema stored the untouched generated
-- scene in image_bytes, so it is safe to use that image as their editable source.
UPDATE campaign_contents
   SET source_image_bytes=image_bytes,
       source_image_mime=image_mime
 WHERE source_image_bytes IS NULL
   AND image_bytes IS NOT NULL
   AND COALESCE(gen_notes->>'generation_mode','')='preview';
