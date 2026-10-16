-- 0006 - Moderation hardening: claims (reviewer assignment), in-app notifications, submission
-- fingerprints for change summaries, and two database guards found in the Step 1.24 review.
--
-- Additive only: new columns, tables, constraints and triggers; two existing trigger functions
-- (listing_photos_editable, user_listing_status_change from 0005) get a stricter body through
-- CREATE OR REPLACE. No row is changed or removed.
--
-- Guards (Step 1.24 review):
-- A. An uploaded photo can no longer be moved between listings, and an UPDATE of a photo row is
--    checked against BOTH the old and the new listing (previously only the new one), so a photo
--    of a frozen listing cannot be re-attached to an editable draft.
-- B. listings.data_source and properties.data_source can never change (a demo row cannot become
--    a user listing and skip the moderation history, and a user listing cannot become demo data),
--    and the owner of a listing can never be replaced once set (no transfer around the
--    self-review ban).
--
-- Claims: a moderator claims a submitted listing for 60 minutes (review_claimed_by,
-- review_claim_expires_at, set by the database clock). Only the moderator holding an unexpired
-- claim may decide; an expired claim can be taken by another moderator; the holder can release
-- it. Expiry is evaluated from database timestamps when a request arrives (no background job).
-- Claims and releases are written to listing_status_events with kind 'claim' / 'release'.
--
-- Notifications: one row per moderator decision (changes requested, approved, rejected) for the
-- listing owner, created by the same trigger that records the decision, so both commit or roll
-- back together. Only read_at can change afterwards.
--
-- Submission fingerprints: per submission, a salted SHA-256 fingerprint of each form field (no
-- values, no image bytes) and the list of fields changed since the previous submission. Written
-- by the application inside the submitting transaction. Append-only.

-- A. Uploaded photos: check the old and the new listing, never move an upload.
CREATE OR REPLACE FUNCTION listing_photos_editable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  current_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.source_kind = 'upload'
      AND NEW.listing_id IS DISTINCT FROM OLD.listing_id THEN
    RAISE EXCEPTION 'uploaded photos cannot move to another listing'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.source_kind = 'upload' THEN
    SELECT status INTO current_status FROM listings WHERE id = OLD.listing_id;
    IF current_status NOT IN ('draft', 'changes_requested') THEN
      RAISE EXCEPTION 'photos cannot change in status %', current_status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.source_kind = 'upload' THEN
    SELECT status INTO current_status FROM listings WHERE id = NEW.listing_id;
    IF current_status NOT IN ('draft', 'changes_requested') THEN
      RAISE EXCEPTION 'photos cannot change in status %', current_status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- B. Fixed data source and owner.
CREATE FUNCTION data_source_is_fixed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'data_source of % cannot change', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER listings_data_source_fixed BEFORE UPDATE ON listings
  FOR EACH ROW WHEN (OLD.data_source IS DISTINCT FROM NEW.data_source)
  EXECUTE FUNCTION data_source_is_fixed();
CREATE TRIGGER properties_data_source_fixed BEFORE UPDATE ON properties
  FOR EACH ROW WHEN (OLD.data_source IS DISTINCT FROM NEW.data_source)
  EXECUTE FUNCTION data_source_is_fixed();

CREATE FUNCTION listing_owner_is_fixed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'the owner of a listing cannot change' USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER listings_owner_fixed BEFORE UPDATE ON listings
  FOR EACH ROW WHEN (OLD.owner_user_id IS NOT NULL
    AND OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id)
  EXECUTE FUNCTION listing_owner_is_fixed();

-- Claims.
ALTER TABLE listings ADD COLUMN review_claimed_by text REFERENCES users (id);
ALTER TABLE listings ADD COLUMN review_claim_expires_at timestamptz;
ALTER TABLE listings ADD CONSTRAINT review_claim_consistent
  CHECK ((review_claimed_by IS NULL) = (review_claim_expires_at IS NULL));
ALTER TABLE listings ADD CONSTRAINT review_claim_only_submitted
  CHECK (review_claimed_by IS NULL OR status = 'submitted');

-- Audit kinds: status changes (as before), claims and releases.
ALTER TABLE listing_status_events ADD COLUMN kind text NOT NULL DEFAULT 'status'
  CHECK (kind IN ('status', 'claim', 'release'));
ALTER TABLE listing_status_events ADD CONSTRAINT assignment_event_shape
  CHECK (kind = 'status' OR (from_status = 'submitted' AND to_status = 'submitted'
    AND actor_role = 'moderator' AND reason IS NULL));

CREATE FUNCTION listing_review_claim_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  actor text := nullif(current_setting('app.actor_user_id', true), '');
  actor_role text := nullif(current_setting('app.actor_role', true), '');
BEGIN
  IF actor IS NULL OR actor_role IS DISTINCT FROM 'moderator' THEN
    RAISE EXCEPTION 'claims need a moderator as actor' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = actor AND role = 'moderator') THEN
    RAISE EXCEPTION 'not a moderator' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.data_source <> 'user' OR OLD.status <> 'submitted' OR NEW.status <> 'submitted' THEN
    RAISE EXCEPTION 'only submitted listings can be claimed, and not with a status change'
      USING ERRCODE = 'check_violation';
  END IF;
  IF actor = OLD.owner_user_id THEN
    RAISE EXCEPTION 'moderators cannot claim their own listings' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.review_claimed_by IS NOT NULL THEN
    IF NEW.review_claimed_by <> actor THEN
      RAISE EXCEPTION 'moderators can only claim for themselves' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.review_claimed_by IS NOT NULL AND OLD.review_claimed_by <> actor
        AND OLD.review_claim_expires_at > clock_timestamp() THEN
      RAISE EXCEPTION 'listing is claimed by another moderator' USING ERRCODE = 'check_violation';
    END IF;
    NEW.review_claim_expires_at := clock_timestamp() + interval '60 minutes';
    INSERT INTO listing_status_events (listing_id, from_status, to_status, actor_user_id,
      actor_role, kind)
    VALUES (NEW.id, 'submitted', 'submitted', actor, 'moderator', 'claim');
  ELSE
    IF OLD.review_claimed_by IS DISTINCT FROM actor THEN
      RAISE EXCEPTION 'only the assigned moderator can release a claim'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.review_claim_expires_at := NULL;
    INSERT INTO listing_status_events (listing_id, from_status, to_status, actor_user_id,
      actor_role, kind)
    VALUES (NEW.id, 'submitted', 'submitted', actor, 'moderator', 'release');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER listing_review_claim_change
  BEFORE UPDATE OF review_claimed_by, review_claim_expires_at ON listings
  FOR EACH ROW WHEN (OLD.review_claimed_by IS DISTINCT FROM NEW.review_claimed_by
    OR OLD.review_claim_expires_at IS DISTINCT FROM NEW.review_claim_expires_at)
  EXECUTE FUNCTION listing_review_claim_change();

-- Notifications for listing owners.
CREATE TABLE notifications (
  id text PRIMARY KEY DEFAULT ('nt-' || gen_random_uuid()::text),
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  listing_id text NOT NULL REFERENCES listings (id),
  event_id bigint NOT NULL UNIQUE REFERENCES listing_status_events (id),
  kind text NOT NULL CHECK (kind IN ('changes_requested', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX notifications_by_user ON notifications (user_id, created_at DESC, id);
CREATE INDEX notifications_unread ON notifications (user_id) WHERE read_at IS NULL;

CREATE FUNCTION notifications_only_read_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.listing_id IS DISTINCT FROM OLD.listing_id OR NEW.event_id IS DISTINCT FROM OLD.event_id
      OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR (OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at) THEN
    RAISE EXCEPTION 'only an unread notification can be marked as read'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER notifications_only_read_state BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION notifications_only_read_state();

-- Status changes: as in 0005, plus the active-claim rule for decisions, clearing the claim, and
-- the owner's notification in the same statement.
CREATE OR REPLACE FUNCTION user_listing_status_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  actor text := nullif(current_setting('app.actor_user_id', true), '');
  actor_role text := nullif(current_setting('app.actor_role', true), '');
  reason text := nullif(btrim(coalesce(current_setting('app.status_reason', true), '')), '');
  change text := OLD.status || '>' || NEW.status;
  event_id bigint;
BEGIN
  IF actor IS NULL OR actor_role IS NULL THEN
    RAISE EXCEPTION 'status changes of user listings need an actor' USING ERRCODE = 'check_violation';
  END IF;
  IF actor_role = 'owner' THEN
    IF change NOT IN ('draft>submitted', 'changes_requested>submitted', 'submitted>draft',
        'draft>archived', 'changes_requested>archived', 'approved>archived', 'rejected>archived') THEN
      RAISE EXCEPTION 'transition % is not allowed for owners', change USING ERRCODE = 'check_violation';
    END IF;
    IF actor IS DISTINCT FROM NEW.owner_user_id THEN
      RAISE EXCEPTION 'only the owner can do this' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'submitted' AND NOT EXISTS (SELECT 1 FROM listing_images
        WHERE listing_id = NEW.id AND source_kind = 'upload') THEN
      RAISE EXCEPTION 'a listing needs at least one photo to be submitted'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF actor_role = 'moderator' THEN
    IF change NOT IN ('submitted>approved', 'submitted>changes_requested', 'submitted>rejected') THEN
      RAISE EXCEPTION 'transition % is not allowed for moderators', change
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = actor AND role = 'moderator') THEN
      RAISE EXCEPTION 'not a moderator' USING ERRCODE = 'check_violation';
    END IF;
    IF actor = NEW.owner_user_id THEN
      RAISE EXCEPTION 'moderators cannot review their own listings' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.review_claimed_by IS DISTINCT FROM actor
        OR OLD.review_claim_expires_at <= clock_timestamp() THEN
      RAISE EXCEPTION 'a decision needs an active claim by this moderator'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'unknown actor role' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'submitted' THEN
    NEW.submitted_at := now();
  ELSIF NEW.status = 'draft' THEN
    NEW.submitted_at := NULL;
  END IF;
  -- Leaving 'submitted' (decision or withdrawal) ends any claim.
  NEW.review_claimed_by := NULL;
  NEW.review_claim_expires_at := NULL;
  INSERT INTO listing_status_events (listing_id, from_status, to_status, actor_user_id, actor_role,
    reason)
  VALUES (NEW.id, OLD.status, NEW.status, actor, actor_role, reason)
  RETURNING id INTO event_id;
  IF actor_role = 'moderator' THEN
    INSERT INTO notifications (user_id, listing_id, event_id, kind)
    VALUES (NEW.owner_user_id, NEW.id, event_id, NEW.status);
  END IF;
  RETURN NEW;
END;
$$;

-- Submission fingerprints (no values, no image bytes).
CREATE TABLE listing_submission_fingerprints (
  event_id bigint PRIMARY KEY REFERENCES listing_status_events (id),
  listing_id text NOT NULL REFERENCES listings (id),
  fields jsonb NOT NULL CHECK (jsonb_typeof(fields) = 'object'),
  -- NULL: first submission, or no earlier fingerprint to compare with.
  changed_fields text[],
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listing_submission_fingerprints_listing
  ON listing_submission_fingerprints (listing_id, event_id);

CREATE FUNCTION append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER listing_submission_fingerprints_no_update
  BEFORE UPDATE OR DELETE ON listing_submission_fingerprints
  FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER listing_submission_fingerprints_no_truncate
  BEFORE TRUNCATE ON listing_submission_fingerprints
  FOR EACH STATEMENT EXECUTE FUNCTION append_only();
