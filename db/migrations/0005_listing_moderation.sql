-- 0005 - Submission and moderation of user listings (nothing is published).
--
-- Lifecycle of user listings (data_source = 'user'):
--   draft -> submitted                     owner submits (complete listing, >= 1 stored photo)
--   changes_requested -> submitted         owner resubmits after corrections
--   submitted -> draft                     owner withdraws (only before a decision)
--   submitted -> approved                  moderator (stays PRIVATE until publishing exists)
--   submitted -> changes_requested         moderator, reason required (owner may edit again)
--   submitted -> rejected                  moderator, reason required; FINAL
--   draft | changes_requested | approved | rejected -> archived   owner removes it
-- Not allowed: archiving a submitted listing (withdraw first, so it cannot vanish during a
-- review), any change of a rejected or archived listing except rejected -> archived, and any
-- user listing becoming 'active'/'inactive' (public). Archived is terminal until a restore
-- feature is designed; its history stays.
--
-- Every status change of a user listing is checked and recorded by triggers: the application
-- must state the actor for the transaction (set_config('app.actor_user_id' / 'app.actor_role' /
-- 'app.status_reason', ..., true)); owners may only make owner transitions on their own listings,
-- moderators (user_roles) only moderator transitions on other users' listings. Each change writes
-- one immutable row to listing_status_events. Demo listings (active/inactive) are unaffected.
-- Additive only: CHECK constraints are replaced (widened), nothing is removed.

ALTER TABLE listings DROP CONSTRAINT listings_status_check;
ALTER TABLE listings ADD CONSTRAINT listings_status_check
  CHECK (status IN ('draft', 'submitted', 'changes_requested', 'approved', 'rejected', 'archived',
    'active', 'inactive'));

ALTER TABLE listings DROP CONSTRAINT drafts_are_user_data;
ALTER TABLE listings ADD CONSTRAINT drafts_are_user_data
  CHECK (status IN ('active', 'inactive') OR data_source = 'user');

ALTER TABLE listings DROP CONSTRAINT user_listings_not_public_yet;
ALTER TABLE listings ADD CONSTRAINT user_listings_not_public_yet
  CHECK (data_source <> 'user' OR status IN ('draft', 'submitted', 'changes_requested',
    'approved', 'rejected', 'archived'));

ALTER TABLE listings ADD COLUMN submitted_at timestamptz;

-- Review queue: oldest submission first.
CREATE INDEX listings_review_queue ON listings (submitted_at, id)
  WHERE data_source = 'user' AND status = 'submitted';

-- Moderator role. Granted and revoked only with the local CLI (npm run roles).
CREATE TABLE user_roles (
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('moderator')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

-- Immutable audit trail of status changes (who, which role, why, when).
CREATE TABLE listing_status_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id text NOT NULL REFERENCES listings (id),
  from_status text NOT NULL,
  to_status text NOT NULL,
  actor_user_id text NOT NULL REFERENCES users (id),
  actor_role text NOT NULL CHECK (actor_role IN ('owner', 'moderator')),
  reason text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reason_required
    CHECK (to_status NOT IN ('changes_requested', 'rejected') OR reason IS NOT NULL)
);
CREATE INDEX listing_status_events_listing ON listing_status_events (listing_id, id);

CREATE FUNCTION listing_status_events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'listing_status_events is append-only' USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER listing_status_events_no_update BEFORE UPDATE OR DELETE ON listing_status_events
  FOR EACH ROW EXECUTE FUNCTION listing_status_events_immutable();
CREATE TRIGGER listing_status_events_no_truncate BEFORE TRUNCATE ON listing_status_events
  FOR EACH STATEMENT EXECUTE FUNCTION listing_status_events_immutable();

-- New user listings always start as drafts.
CREATE FUNCTION user_listing_starts_as_draft() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.data_source = 'user' AND NEW.status <> 'draft' THEN
    RAISE EXCEPTION 'user listings start as drafts' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_listing_starts_as_draft BEFORE INSERT ON listings
  FOR EACH ROW EXECUTE FUNCTION user_listing_starts_as_draft();

-- Allowed transitions, actor checks and the audit row.
CREATE FUNCTION user_listing_status_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  actor text := nullif(current_setting('app.actor_user_id', true), '');
  actor_role text := nullif(current_setting('app.actor_role', true), '');
  reason text := nullif(btrim(coalesce(current_setting('app.status_reason', true), '')), '');
  change text := OLD.status || '>' || NEW.status;
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
  ELSE
    RAISE EXCEPTION 'unknown actor role' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'submitted' THEN
    NEW.submitted_at := now();
  ELSIF NEW.status = 'draft' THEN
    NEW.submitted_at := NULL;
  END IF;
  INSERT INTO listing_status_events (listing_id, from_status, to_status, actor_user_id, actor_role,
    reason)
  VALUES (NEW.id, OLD.status, NEW.status, actor, actor_role, reason);
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_listing_status_change BEFORE UPDATE OF status ON listings
  FOR EACH ROW WHEN (OLD.data_source = 'user' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION user_listing_status_change();

-- Content of a listing that is not editable (submitted, approved, rejected, archived) is frozen.
CREATE FUNCTION user_listing_content_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status NOT IN ('draft', 'changes_requested') AND (
      NEW.title IS DISTINCT FROM OLD.title OR NEW.transaction_type IS DISTINCT FROM OLD.transaction_type
      OR NEW.rent_period IS DISTINCT FROM OLD.rent_period
      OR NEW.asking_amount IS DISTINCT FROM OLD.asking_amount
      OR NEW.asking_currency IS DISTINCT FROM OLD.asking_currency
      OR NEW.property_id IS DISTINCT FROM OLD.property_id
      OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id) THEN
    RAISE EXCEPTION 'this listing cannot be edited in status %', OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_listing_content_frozen BEFORE UPDATE ON listings
  FOR EACH ROW WHEN (OLD.data_source = 'user')
  EXECUTE FUNCTION user_listing_content_frozen();

-- Uploaded photos change only while the listing is editable.
CREATE FUNCTION listing_photos_editable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target text := CASE WHEN TG_OP = 'DELETE' THEN OLD.listing_id ELSE NEW.listing_id END;
  kind text := CASE WHEN TG_OP = 'DELETE' THEN OLD.source_kind ELSE NEW.source_kind END;
  current_status text;
BEGIN
  IF kind = 'upload' THEN
    SELECT status INTO current_status FROM listings WHERE id = target;
    IF current_status NOT IN ('draft', 'changes_requested') THEN
      RAISE EXCEPTION 'photos cannot change in status %', current_status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER listing_photos_editable BEFORE INSERT OR UPDATE OR DELETE ON listing_images
  FOR EACH ROW EXECUTE FUNCTION listing_photos_editable();
