-- 0007 - Owner-administrator workflow (approved product decision, Step 1.25 follow-up).
--
-- A new role 'admin' in user_roles, granted only with the local CLI (npm run roles --
-- grant-admin <email>), which also grants 'moderator'. Admin privileges need BOTH rows, so
-- revoking the moderator role also switches them off.
--
-- A. Decisions without a manual claim: the application lets an admin decide on another user's
--    listing by claiming and deciding in ONE transaction (the existing claim trigger writes the
--    'claim' event, the status trigger the decision). An unexpired claim of another moderator is
--    still refused. Nothing changes for ordinary moderators (60-minute claims). No SQL change is
--    needed for A: the existing triggers already enforce it.
-- B. Self-approval: an admin may approve their OWN submitted listing, and only that
--    (submitted -> approved). It is a separate transition with actor role 'admin', recorded
--    distinctly in the immutable audit log, refused while another moderator holds an unexpired
--    claim on the listing, and creates no notification (the owner is the actor). Ordinary
--    moderators still can never decide on their own listings.
--
-- Additive: two CHECK constraints are replaced (widened), one CHECK is added, and the status
-- trigger function gets a new body (CREATE OR REPLACE). No row is changed or removed.

ALTER TABLE user_roles DROP CONSTRAINT user_roles_role_check;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('moderator', 'admin'));

ALTER TABLE listing_status_events DROP CONSTRAINT listing_status_events_actor_role_check;
ALTER TABLE listing_status_events ADD CONSTRAINT listing_status_events_actor_role_check
  CHECK (actor_role IN ('owner', 'moderator', 'admin'));

-- The 'admin' actor role means exactly one thing: a self-approval.
ALTER TABLE listing_status_events ADD CONSTRAINT admin_events_are_self_approvals
  CHECK (actor_role <> 'admin'
    OR (kind = 'status' AND from_status = 'submitted' AND to_status = 'approved'));

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
  ELSIF actor_role = 'admin' THEN
    -- Self-approval only: an administrator approving their own submitted listing.
    IF change <> 'submitted>approved' THEN
      RAISE EXCEPTION 'transition % is not allowed as administrator self-approval', change
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = actor AND role = 'admin')
        OR NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = actor AND role = 'moderator') THEN
      RAISE EXCEPTION 'not an administrator' USING ERRCODE = 'check_violation';
    END IF;
    IF actor IS DISTINCT FROM NEW.owner_user_id THEN
      RAISE EXCEPTION 'self-approval is only for the administrator''s own listings'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.review_claimed_by IS NOT NULL AND OLD.review_claim_expires_at > clock_timestamp() THEN
      RAISE EXCEPTION 'listing is claimed by a moderator' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'unknown actor role' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'submitted' THEN
    NEW.submitted_at := now();
  ELSIF NEW.status = 'draft' THEN
    NEW.submitted_at := NULL;
  END IF;
  -- Leaving 'submitted' (decision, self-approval or withdrawal) ends any claim.
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
