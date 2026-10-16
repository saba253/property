-- 0002 - User accounts (Better Auth) and the future owner of a listing.
--
-- Tables and columns follow Better Auth's core schema exactly (column names in its camelCase,
-- quoted), with plural table names configured in lib/auth/server.ts (modelName). The test
-- tests/lib/auth/schema.test.ts asks Better Auth itself (getMigrations) whether anything is
-- missing, so library upgrades that need schema changes are noticed. Passwords are stored only
-- as Better Auth's scrypt hashes (accounts.password); there are no plaintext secrets.
-- Personal data is limited to email, an optional display name and an optional image URL.
-- Nothing here changes or deletes listing data.

CREATE TABLE users (
  "id" text NOT NULL PRIMARY KEY,
  -- Optional display name (empty string when not given); Better Auth requires the column.
  "name" text NOT NULL CHECK (length("name") <= 60),
  -- Stored lower-case and trimmed (Better Auth normalizes; the check guards other writers).
  "email" text NOT NULL UNIQUE
    CHECK ("email" = lower(btrim("email")) AND length("email") BETWEEN 3 AND 254),
  "emailVerified" boolean NOT NULL DEFAULT false,
  "image" text CHECK (length("image") <= 2000),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Server-side sessions: the cookie holds a signed reference to "token"; signing out deletes the
-- row, and expired rows are rejected.
CREATE TABLE sessions (
  "id" text NOT NULL PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  "token" text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES users ("id") ON DELETE CASCADE
);
CREATE INDEX "sessions_userId_idx" ON sessions ("userId");

-- Sign-in methods: "credential" (email + scrypt password hash) or an OAuth provider (google).
CREATE TABLE accounts (
  "id" text NOT NULL PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES users ("id") ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL,
  UNIQUE ("providerId", "accountId")
);
CREATE INDEX "accounts_userId_idx" ON accounts ("userId");

-- Email verification and password reset tokens (with expiry).
CREATE TABLE verifications (
  "id" text NOT NULL PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "verifications_identifier_idx" ON verifications ("identifier");

-- Rate limits of the authentication endpoints, shared by all server instances.
CREATE TABLE rate_limits (
  "id" text NOT NULL PRIMARY KEY,
  "key" text NOT NULL UNIQUE,
  "count" integer NOT NULL,
  "lastRequest" bigint NOT NULL
);

-- Future owner of a listing (Step 1.22): the user account that publishes it. Distinct from the
-- physical property (property_id) and from where the record comes from (data_source); an agency
-- or developer organization can be added later as its own reference. NULL means "no user owns
-- it" and is required for demo listings, so demo data never appears to belong to a person.
-- No ON DELETE action: a user with listings cannot be deleted by accident.
ALTER TABLE listings ADD COLUMN owner_user_id text REFERENCES users ("id");
ALTER TABLE listings ADD CONSTRAINT demo_listings_have_no_owner
  CHECK (data_source <> 'demo' OR owner_user_id IS NULL);
CREATE INDEX listings_owner_user_id ON listings (owner_user_id) WHERE owner_user_id IS NOT NULL;
