-- 0003 - Private listing drafts of signed-in users.
--
-- A draft is an ordinary property + listing pair with data_source = 'user', status = 'draft'
-- and a required owner (listings.owner_user_id). Lifecycle (only the first and last parts exist
-- today): draft -> submitted for review -> published -> removed/archived. User data may only be
-- 'draft' or 'archived' (archived = removed by its owner, kept and reversible) until review and
-- publishing exist; the database enforces that, so no code path can publish a draft by mistake.
-- Public queries read data_source = 'demo' and status = 'active' only.
--
-- Only CHECK constraints are replaced (widened); no table, column or row is removed or changed.

ALTER TABLE properties DROP CONSTRAINT properties_data_source_check;
ALTER TABLE properties ADD CONSTRAINT properties_data_source_check
  CHECK (data_source IN ('demo', 'user'));

ALTER TABLE listings DROP CONSTRAINT listings_data_source_check;
ALTER TABLE listings ADD CONSTRAINT listings_data_source_check
  CHECK (data_source IN ('demo', 'user'));

ALTER TABLE listings DROP CONSTRAINT listings_status_check;
ALTER TABLE listings ADD CONSTRAINT listings_status_check
  CHECK (status IN ('draft', 'active', 'inactive', 'archived'));

-- Every user listing has an owner; demo listings never have one (0002).
ALTER TABLE listings ADD CONSTRAINT user_listings_have_owner
  CHECK (data_source <> 'user' OR owner_user_id IS NOT NULL);
-- Drafts and archived drafts exist only for user data.
ALTER TABLE listings ADD CONSTRAINT drafts_are_user_data
  CHECK (status NOT IN ('draft', 'archived') OR data_source = 'user');
-- No publishing yet: user listings stay private (relaxed by the future review migration).
ALTER TABLE listings ADD CONSTRAINT user_listings_not_public_yet
  CHECK (data_source <> 'user' OR status IN ('draft', 'archived'));

-- "My listings": a user's drafts, newest first.
CREATE INDEX listings_owner_drafts ON listings (owner_user_id, updated_at DESC)
  WHERE data_source = 'user';
