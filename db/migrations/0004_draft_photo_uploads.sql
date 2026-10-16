-- 0004 - Uploaded photos of private listing drafts.
--
-- Uploads extend the existing listing_images table (one gallery model for every listing) with a
-- third kind, 'upload': a processed image stored by the application under a random storage key
-- (never a URL or a path given by the browser). Rules:
-- - uploads belong only to user listings, and user listings have only uploads (trigger below);
--   demo images stay illustrations/photos and can never be attached to a draft;
-- - at most 10 uploads per listing (also enforced by the application under a row lock);
-- - one cover per listing (existing unique index listing_images_one_cover);
-- - public image queries read only images of public listings and never 'upload' rows
--   (lib/db/postgres-repository.ts), so draft photos stay private.
-- When a draft is archived its photos are kept unchanged (archiving is reversible) and are
-- neither shown nor changeable until a future restore feature exists.
--
-- Only CHECK constraints are replaced and one NOT NULL is relaxed; no row is changed or removed.

ALTER TABLE listing_images ADD COLUMN storage_key text UNIQUE
  CHECK (storage_key ~ '^[0-9a-f]{32}\.webp$');
ALTER TABLE listing_images ADD COLUMN mime_type text CHECK (mime_type IN ('image/webp'));
ALTER TABLE listing_images ADD COLUMN byte_size integer
  CHECK (byte_size > 0 AND byte_size <= 10485760);
ALTER TABLE listing_images ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE listing_images DROP CONSTRAINT listing_images_source_kind_check;
ALTER TABLE listing_images ADD CONSTRAINT listing_images_source_kind_check
  CHECK (source_kind IN ('illustration', 'photo', 'upload'));

-- A description is required for demo images and optional for uploads (the page then uses a
-- generic "photo N" text).
ALTER TABLE listing_images ALTER COLUMN alt DROP NOT NULL;
ALTER TABLE listing_images DROP CONSTRAINT listing_images_alt_check;
ALTER TABLE listing_images ADD CONSTRAINT listing_images_alt_check
  CHECK ((alt IS NULL AND source_kind = 'upload') OR length(btrim(alt)) BETWEEN 1 AND 300);

ALTER TABLE listing_images DROP CONSTRAINT image_source_consistent;
ALTER TABLE listing_images ADD CONSTRAINT image_source_consistent CHECK (
  (source_kind = 'illustration' AND scene IS NOT NULL AND src IS NULL
    AND width IS NULL AND height IS NULL AND storage_key IS NULL)
  OR (source_kind = 'photo' AND src IS NOT NULL AND scene IS NULL AND storage_key IS NULL)
  OR (source_kind = 'upload' AND storage_key IS NOT NULL AND mime_type IS NOT NULL
    AND byte_size IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL
    AND src IS NULL AND scene IS NULL)
);

CREATE FUNCTION listing_images_check_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  source text;
  uploads integer;
BEGIN
  SELECT data_source INTO source FROM listings WHERE id = NEW.listing_id;
  IF NEW.source_kind = 'upload' AND source IS DISTINCT FROM 'user' THEN
    RAISE EXCEPTION 'uploads belong only to user listings' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.source_kind <> 'upload' AND source = 'user' THEN
    RAISE EXCEPTION 'user listings have only uploaded images' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.source_kind = 'upload' AND TG_OP = 'INSERT' THEN
    SELECT count(*) INTO uploads FROM listing_images
      WHERE listing_id = NEW.listing_id AND source_kind = 'upload';
    IF uploads >= 10 THEN
      RAISE EXCEPTION 'at most 10 photos per listing' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER listing_images_check_owner
  BEFORE INSERT OR UPDATE OF listing_id, source_kind ON listing_images
  FOR EACH ROW EXECUTE FUNCTION listing_images_check_owner();
