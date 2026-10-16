# Database foundation (Step 1.19)

The website runs on the built-in demo data by default (`DATA_BACKEND=memory`, no database). The
PostgreSQL backend exists for development and future real data. Nothing here provisions a database,
creates an account or runs in production.

## Technology

- **PostgreSQL** with **hand-written, versioned SQL migrations** (`db/migrations/NNNN_name.sql`).
- **`pg`** (node-postgres) as the server-side driver. It is in Next.js' default
  `serverExternalPackages`, so it is never bundled, and it is only loaded when
  `DATA_BACKEND=postgres`.
- **PGlite** (`@electric-sql/pglite`, dev dependency only) runs real PostgreSQL compiled to
  WebAssembly inside the test process. The integration tests use it. No server or Docker is needed.

**Drizzle ORM was evaluated and not adopted for now.** Its typed schema and generated migrations
are attractive. But the search here is a dynamic set of conditions that must exactly match the
existing TypeScript rules (rounding, unknown values, amenity logic). That is clearest and easiest
to verify as explicit, parameterized SQL (`lib/db/listing-query.ts`) with parity tests. It also
avoids two extra packages (`drizzle-orm`, `drizzle-kit`). The `SqlClient` interface
(`lib/db/sql-client.ts`) keeps this replaceable.

## Layout

| File                                                      | Purpose                                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `db/migrations/0001_initial_schema.sql`                   | cities, properties, listings, property_features, listing_equipment, listing_images, indexes |
| `db/migrations/0002_auth_accounts.sql`                    | Better Auth tables, `listings.owner_user_id`                                                |
| `db/migrations/0003_user_listing_drafts.sql`              | private drafts of signed-in users (`data_source = 'user'`)                                  |
| `db/migrations/0004_draft_photo_uploads.sql`              | uploaded draft photos in `listing_images` (`source_kind = 'upload'`)                        |
| `db/migrations/0005_listing_moderation.sql`               | submission/moderation statuses, roles, immutable status events (see `docs/MODERATION.md`)   |
| `db/migrations/0006_review_assignments_notifications.sql` | claims, notifications, submission fingerprints, data-source/owner and photo guards          |
| `db/migrations/0007_owner_administrator.sql`              | `admin` role, administrator self-approval (actor role `admin`)                              |
| `lib/drafts/*`                                            | draft input whitelist, store (SQL), service (ownership), server wiring                      |
| `lib/review/*`                                            | status table, submission, claims, moderation, history, change fingerprints                  |
| `lib/notifications/*`                                     | in-app notifications of listing owners (read, mark as read)                                 |
| `lib/photos/*`                                            | photo processing, storage adapter, SQL, service, routes' helpers (see `docs/STORAGE.md`)    |
| `lib/db/config.ts`                                        | `DATA_BACKEND` / `DATABASE_URL` parsing; errors without secrets; local-host check           |
| `lib/db/migrations.ts`                                    | migration runner (ordered, one transaction each, checksums, advisory lock)                  |
| `lib/db/listing-query.ts`                                 | SQL for the validated search (filters, budget, sort)                                        |
| `lib/db/postgres-repository.ts`                           | `ListingRepository` in SQL                                                                  |
| `lib/db/mappers.ts`                                       | rows → domain objects (the only NUMERIC → number boundary)                                  |
| `lib/db/seed-demo.ts`                                     | development-only demo seed                                                                  |
| `lib/db/pg-client.ts`                                     | `pg` pool (app) and single connection (scripts)                                             |
| `lib/repository/*`                                        | interface, memory backend, backend selection                                                |
| `lib/data/listings.ts`                                    | server-only, cached reads for pages                                                         |
| `scripts/db.mts`                                          | `db:status`, `db:migrate`, `db:seed:demo`                                                   |
| `scripts/roles.mts`                                       | `roles -- list`, `grant`, `revoke`, `grant-admin`, `revoke-admin` `<email>` (local only)    |
| `scripts/photos.mts`                                      | `photos:orphans` (unreferenced photo files; read-only unless `-- --delete`)                 |

## Accounts (Step 1.21)

`db/migrations/0002_auth_accounts.sql` adds Better Auth's tables (`users`, `sessions`,
`accounts`, `verifications`, `rate_limits`). Their columns keep Better Auth's camelCase names,
quoted. It also adds `listings.owner_user_id`, the future owner. The column is nullable, is
required to be NULL for demo listings, and blocks deleting a user who owns listings.
`tests/lib/auth/schema-and-limits.test.ts` checks with Better Auth itself that the schema is
complete. See `docs/AUTH.md`.

## Private drafts (Step 1.22)

`0003_user_listing_drafts.sql` lets signed-in users keep private listing drafts. A draft is an
ordinary property + listing pair with `data_source = 'user'`, `status = 'draft'` and a required
`owner_user_id`. The migration only widens CHECK lists and adds constraints (no table, column or
row is removed):

- `user_listings_have_owner`: every user listing has an owner (demo listings never have one, 0002).
- `drafts_are_user_data`: `draft`/`archived` only for user data.
- `user_listings_not_public_yet`: user listings can only be `draft` or `archived`. No code path
  can publish one by mistake; a future review/publishing migration relaxes this.
- Index `listings_owner_drafts (owner_user_id, updated_at DESC) WHERE data_source = 'user'`.

Lifecycle: draft → (later) submitted for review → published → archived. Today only draft and
archived exist. "წაშლა" in the UI archives (reversible, kept in the database); nothing is
hard-deleted. Public queries read `data_source = 'demo'` and `status = 'active'` only, so drafts
never appear in search, counts, facets, the map, batch lookups or comparables (tested).

`lib/drafts/draft-store.ts` writes in one transaction (property, listing, features, equipment)
with parameterized SQL; updates lock the row with `SELECT … FOR UPDATE` scoped to the owner.
`draft-service.ts` takes the owner only from the verified session; a request cannot name an
owner, status, id or data source. At most 50 drafts per user; 30 saves per 10 minutes per user
(per process). Photos: see the next section.

## Draft photos (Step 1.23)

`0004_draft_photo_uploads.sql` extends `listing_images` instead of adding a parallel table (one
gallery model for every listing; a future publish keeps the same rows):

- `source_kind` gains `'upload'`; new columns `storage_key` (unique, `^[0-9a-f]{32}\.webp$`),
  `mime_type` (`image/webp` only), `byte_size` (1 B–10 MB) and `created_at`.
- `alt` becomes optional for uploads only (NOT NULL relaxed; demo images still need it).
- `image_source_consistent` now also requires every upload column for uploads and none for the
  other kinds (uploads never have a `src` URL or a scene).
- Trigger `listing_images_check_owner`: uploads only on user listings, user listings only
  uploads, and at most 10 uploads per listing (also enforced by the application under
  `SELECT … FOR UPDATE` on the draft row).
- Existing: `UNIQUE (listing_id, sort_order)` and one cover per listing
  (`listing_images_one_cover`); reordering writes in two steps inside one transaction.

`lib/photos/photo-store.ts` scopes every statement to the owner's draft (`owner_user_id`,
`data_source = 'user'`, `status = 'draft'`). Public image reads in `postgres-repository.ts` join
the listing and accept only public listings and non-upload images. Files, processing, privacy,
backup and the orphan check are described in `docs/STORAGE.md`. The migration only replaces CHECK
constraints and relaxes one NOT NULL; the test in `tests/lib/db/migrations.test.ts` allows exactly
these two non-destructive patterns.

## Moderation (Step 1.24)

`0005_listing_moderation.sql` widens the user statuses to draft, submitted, changes_requested,
approved, rejected and archived (user listings still can never be active/inactive), adds
`listings.submitted_at`, `user_roles` and the append-only `listing_status_events`, and triggers
that enforce the transition table, the actor (owner or moderator, stated per transaction with
`set_config`), the self-review ban, the photo requirement for submission and frozen content and
photos outside draft/changes_requested. Only CHECK constraints are replaced; the migration test
also allows a `BEFORE TRUNCATE ON …` trigger, which forbids truncation. Details:
`docs/MODERATION.md`.

## Moderation hardening (Step 1.25)

`0006_review_assignments_notifications.sql` is additive (new columns, tables, constraints and
triggers; two 0005 trigger functions get a stricter body through `CREATE OR REPLACE FUNCTION`; no
row is changed). It adds:

- **Guards from the Step 1.24 review.** `listing_photos_editable` now checks the old and the new
  listing of an uploaded photo and refuses moving an upload to another listing at all.
  `listings.data_source`, `properties.data_source` and a set `listings.owner_user_id` can never
  change (triggers `listings_data_source_fixed`, `properties_data_source_fixed`,
  `listings_owner_fixed`), so a demo row cannot become a user listing without history and a
  listing cannot be handed to its reviewer.
- **Claims.** `listings.review_claimed_by` and `review_claim_expires_at` (only on submitted
  listings, both or neither). Trigger `listing_review_claim_change` lets only a moderator claim
  for themselves (not their own listing), sets the expiry from the database clock (60 minutes),
  refuses taking an unexpired claim of another moderator and lets only the holder release it.
  The status trigger now requires the deciding moderator's unexpired claim and clears the claim
  on every status change.
- **Audit kinds.** `listing_status_events.kind` (`status`, `claim`, `release`; existing rows are
  `status`), with a CHECK on the shape of claim/release rows. Still append-only.
- **Notifications.** `notifications` (random `nt-` id, owner, listing, event, kind, `read_at`),
  written by the status trigger in the decision's transaction; trigger
  `notifications_only_read_state` allows only marking an unread notification as read.
- **Submission fingerprints.** `listing_submission_fingerprints` (one row per submission event:
  salted field fingerprints and the changed field names; append-only). Written by the
  application in the submitting transaction.

Details: `docs/MODERATION.md`.

## Owner-administrator (migration 0007)

`0007_owner_administrator.sql` widens `user_roles.role` to `moderator | admin` and
`listing_status_events.actor_role` to `owner | moderator | admin`, adds the CHECK
`admin_events_are_self_approvals` (actor role `admin` only for `submitted → approved` status
events) and replaces the status trigger's body with one more branch: an administrator (both
roles) may approve their own submitted listing unless another moderator holds an unexpired
claim. Decisions on other users' listings without a manual claim need no SQL change (the
application claims and decides in one transaction under the existing triggers). Additive; no row
is changed. Details: `docs/MODERATION.md`.

## Schema notes

- **Property vs listing.** Physical facts live on `properties`; the offer (transaction, asking
  price, status, equipment, images) lives on `listings` / `listing_equipment` / `listing_images`.
  A listing's `data_source` must equal its property's (composite foreign key), so demo listings
  can never point at real properties.
- **Unknown is not "no".** NULL facts are unknown. A missing characteristic row is unknown, and
  explicit `'unknown'` rows are kept. `topFloor` is derived from floors and never stored. The
  removed "bed" item is rejected by the CHECK list.
- **Type-specific facts.** `floor`/`total_floors` are apartment-only; `storeys`/`land_area_sqm` are
  house-only (CHECK constraints). `floor <= total_floors` and `bedrooms <= rooms` are enforced.
- **Money and area.** Stored as exact `numeric` with at most 2 decimals. More decimals are
  **rejected**, not silently rounded. Asking prices are stored exactly as advertised (amount +
  USD/GEL) and never converted in the database. JavaScript numbers appear only after
  `lib/db/mappers.ts`; rounding happens only for display (whole units, `Math.round`).
- **Limits.** The same ranges as the listing form (`DETAIL_FIELDS`, `PRICE_LIMITS`, text lengths)
  are enforced by CHECKs and by `lib/properties/validate-record.ts`. The tests check that both
  layers reject the same cases.
- **Status.** `draft`, `active`, `inactive`, `archived` (since 0003). `draft` and `archived` exist
  only for user data; user data can only be `draft` or `archived` until review and publishing
  exist (see below). Pending review and rejected will come with the code that uses them.
  `published_at` stays NULL unless actually known (demo data has none).
- **Location.** `exact` needs coordinates plus a verification date; `approximate` needs an area id;
  `unknown` has neither.
- **Exchange rates are not stored.** The NBG rate is fetched and cached by Next.js
  (`lib/currency/get-exchange-rate.ts`). If historical rates are needed (for example "price in
  GEL on date X"), add an `exchange_rates (effective_date PK, gel_per_usd numeric, published_at,
fetched_at)` table filled by a scheduled job, still never converting stored asking prices.

## Search in SQL

`lib/db/listing-query.ts` mirrors `filterListings` and `sortListings` exactly:

- Only active listings of one transaction type are searched. Unknown (NULL) facts never match.
  Floor filters apply to apartments only. Amenities use AND matching on `'yes'` rows, built from
  `AMENITIES`.
- The budget compares the rounded display price: the original amount, or a converted amount
  computed in double precision and rounded with `floor(x + 0.5)`, like `Math.round`. Without a
  rate, listings in the other currency are counted as not comparable.
- Price sorts use unrounded USD with one rate. Without a rate and with mixed currencies, the
  default order is used and a notice is returned. Ties are broken by insertion order (`seq`).
- Pagination (Step 1.20) is offset/limit with a deterministic order (sort value, then `seq`):
  `/properties?page=N`, 12 results per page, at most 100 per repository request, offset ≤
  10,000 (page ≤ 834). Each page query fetches `limit + 1` rows to know whether a next page
  exists. Cursor pagination is **not** implemented (offsets are fine at this depth; a keyset
  cursor is the option for much deeper paging).
- Counts are **bounded** (Step 1.20): exact up to `COUNT_LIMIT` (1,000), otherwise "1,000+"
  (`totalIsExact: false`). When the first page is not full, its rows already give the exact total
  and no count query runs. The "not comparable with the budget" count and the currency-mix check
  run only during an exchange-rate outage, when they matter.

`tests/lib/db/repository-parity.test.ts` and `synthetic-parity.test.ts` run the memory and SQL
backends on the same data (the demo dataset and 400+ synthetic records) and require identical
results.

## Indexes and measurements

| Index                                                                          | Used by                                     |
| ------------------------------------------------------------------------------ | ------------------------------------------- |
| `listings_active_by_transaction (transaction_type, seq) WHERE status='active'` | search in default order; transaction filter |
| `listings_property_id`                                                         | joins, comparables                          |
| `properties_city_district (city_slug, district)`                               | city/district search                        |
| `properties_city_type_area (city_slug, type, area_sqm)`                        | comparables (city, type, area range)        |
| `property_features_yes`, `listing_equipment_yes` (partial, `status='yes'`)     | amenity filters                             |
| `listing_images_one_cover` (unique partial)                                    | one explicit cover per listing              |

Plans checked with `EXPLAIN ANALYZE` on **100,000 synthetic listings in PGlite** (WebAssembly,
single process). Absolute times are not representative of a PostgreSQL server; the plan shapes
are what matter:

- Result pages are fast and indexed: default order uses an index scan plus `LIMIT` (~0.4 ms);
  city/district plus budget plus price sort uses a bitmap index scan plus a top-N heap sort
  (~20–28 ms); by id uses primary-key lookups (~0.1 ms).
- Comparables: filtering on `city_slug` plus a numeric area range made PostgreSQL use
  `properties_city_type_area` (5,105 index rows instead of 66,667). Execution time fell from
  108 ms to 46 ms.
- Step 1.19 found the exact total count to be the main cost on broad searches (it joins every
  match). Replacing `count(DISTINCT currency)` with `min`/`max` gave no gain and was not kept.

### Step 1.20: bounded counts and fewer queries (measured)

Same 100,000 synthetic rows in PGlite, median of 5 runs, Step 1.19 code → Step 1.20 code:

| Query                                     | Before   | After           |
| ----------------------------------------- | -------- | --------------- |
| Broad count (all sale, ~71,000 matches)   | 113.7 ms | 3.8 ms          |
| Broad search, page 1 (count + page)       | 117.2 ms | 12.2 ms         |
| Broad search sorted by price              | 479.1 ms | 304.7 ms        |
| City + amenity search (~8,000 matches)    | 103.7 ms | 14.1 ms         |
| Narrow district + budget search           | 46.6 ms  | 16.9 ms         |
| City + amenity with **0 matches** (count) | 51.9 ms  | 66.7 ms (worse) |
| City + amenity with 0 matches (search)    | 409.5 ms | 343.0 ms        |

Causes and remaining costs:

- The budget search used to run a useless "not comparable" count even with an exchange rate
  available (it can only find something during an outage); it now runs only then.
- `LIMIT`-bounded counts are slower in one case: filters the planner believes match many rows
  but that match none (in the synthetic data, "balcony" and "Tbilisi" never overlap). The page
  query (`ORDER BY seq LIMIT 13`) has the same weakness and had it before. Real data rarely has
  perfectly disjoint filters; watch it with real statistics.
- Price sorts must sort every match by a rate-dependent expression (no index can hold it). A
  future option: merge two currency-specific index scans (`asking_currency, asking_amount`).

## Batch lookups (Step 1.20)

`getListingsByIds(ids)` returns public listings for up to 100 ids in one query, in the requested
order, each once; `getListingCovers(ids)` loads their images in one query. Used by:

- `/favorites?ids=…` and `/compare?ids=…`: the browser's saved ids are put in the URL (replace,
  no history entries; storage stays the source of truth and URL ids are never saved), and the
  server renders only those listings.
- `POST /api/listings/summaries` (read-only): the comparison tray loads titles, links, transaction
  types and covers of its ≤ 4 selected listings. Validated JSON body (≤ 8 KB, 1–100 valid ids),
  415/413/400 for bad input, 429 after 60 requests per minute per address (per process; add edge
  rate limiting in production), `Cache-Control: no-store`, generic 503 on database errors. Only
  active listings are returned; other ids are listed as `missing`, and only those are removed
  from a selection (a network or database error never removes anything).

The layout no longer sends a catalog of every listing with each page (−7 KB HTML per page with
11 listings; the saving grows with the inventory).

## Comparables at scale

`findComparableCandidates` pre-selects in SQL (active, same transaction and rent period, type,
city, ±25% area, other property). `lib/analytics/comparables.ts` then applies the final rules:
one listing per property, district first, minimum 5. Statistics are computed in TypeScript as
before, so results are identical (parity test).

Step 1.20 evaluated a SQL aggregate (scratch prototype, not in the code): `DISTINCT ON
(property_id) … ORDER BY property_id, id COLLATE "C"` for one listing per property (C collation =
JavaScript string order), district first when it has ≥ 5, USD price per m² with the same rate,
`percentile_cont(0.5)`. On 100,000 synthetic rows it matched the TypeScript result exactly in all
checked cases (count, min, max and the median to the last bit) and took 70 ms instead of 233 ms.
It was **not adopted yet**: it still lacks the GEL and no-rate variants, `isConverted`, and the
list of comparables shown on the page, and detail pages are cached anyway. It is the next
optimization when real inventory makes candidate sets large.

## Local development

The verified setup is option B with the Windows PostgreSQL 18 service (`property_intelligence_dev`,
role `property_app`, 127.0.0.1:5432) plus the SMTP catcher from option A (`mail.mjs`); see the
workflow table in `docs/AUTH.md`. Two options. **Nothing is installed system-wide**: no PostgreSQL installer, service, Docker or
administrator rights.

### A. The bundled local server (recommended, Step 1.22)

`tools/local-dev/` has its own `package.json` (CI never installs it). It runs a real PostgreSQL 18
server from the `embedded-postgres` npm package as an ordinary user process, plus a local SMTP
catcher. In separate terminals, from the project folder:

```
npm install --prefix tools/local-dev
node tools/local-dev/postgres.mjs
node tools/local-dev/mail.mjs
node tools/local-dev/setup-env.mjs
npm run db:migrate
npm run db:seed:demo
npm run dev
```

- `postgres.mjs` listens on `127.0.0.1:5433` only (scram-sha-256 password). On first start it
  creates the cluster in `.data/postgres` (UTF-8, locale C) with a generated password in
  `.data/local-dev.json`, and the databases `property_dev` and `property_test`. Ctrl+C stops it;
  the data stays. `.data/` is git-ignored.
- `mail.mjs` accepts mail on `127.0.0.1:1025` and saves each message as an `.eml` file in
  `.data/mail` (open with any mail program). Nothing leaves the computer. It prints only a count,
  never links.
- `setup-env.mjs` writes `.env.local` once (database URL, `AUTH_ENABLED=true`, a generated
  secret, the SMTP catcher). It never overwrites an existing file and prints no secrets.
- After pulling new migrations, run `npm run db:status` and `npm run db:migrate` (a dev
  database created before 0003 cannot store drafts until it is migrated).
- Reset only if you want to: stop the server and delete `.data/postgres` yourself. No script does it.

### B. Your own PostgreSQL (e.g. the Windows installer)

1. Create a UTF-8 database, for example `property_intelligence_dev` (pgAdmin 4 or `createdb`).
2. In your own terminal run
   `node tools/local-dev/setup-pg-role.mjs --port 5432 --database property_intelligence_dev`.
   It asks for the `postgres` password without showing it (never stored), creates the login role
   `property_app` (no superuser, CREATEDB or CREATEROLE; CONNECT on the database, USAGE and
   CREATE on schema `public`; only a SCRAM verifier of its generated password is sent), creates
   an empty `<database>_test` owned by it, and writes `.env.local` (`DATABASE_URL`,
   `TEST_DATABASE_URL`; `DATA_BACKEND=postgres` and `AUTH_ENABLED=false` only if those lines are
   missing; every other line is kept; the previous file is saved as `.env.local.backup-<time>`).
   It stops without changes if the database already holds tables this project did not create.

   **Password rotation:** `node tools/local-dev/setup-pg-role.mjs --rotate`. Order: idempotent
   grants and test database first; the complete new `.env.local` is written to
   `.env.local.rotation-pending`; then `ALTER ROLE … PASSWORD` (SCRAM verifier only); then
   `.env.local` is replaced atomically and the pending file removed; finally a sign-in with the new
   password is checked. If the password changed but `.env.local` could not be written, rename
   `.env.local.rotation-pending` to `.env.local`. If the password change failed, nothing changed.
   A leftover pending file blocks the next run until you resolve it. Restart `npm run dev`
   afterwards. Data is never touched.

3. Run `npm run db:status`, `npm run db:migrate`, `npm run db:seed:demo`, then restart
   `npm run dev` (the data backend is chosen when the server starts).

To serve listings from the database, set `DATA_BACKEND=postgres`; accounts and drafts need only
`DATABASE_URL` (see `docs/AUTH.md`).

Safety:

- Every script requires an explicit `DATABASE_URL` and refuses non-local hosts. Only
  `db:migrate --allow-remote` can override this, for a future deliberate deployment step.
- Migrations refuse a database whose encoding is not UTF-8 (Georgian text; a Windows default
  cluster can be WIN1252).
- The demo seed never runs in production and never overwrites non-demo rows.
- There is no reset or drop command. Migrations only move forward.
- The scripts use Node's built-in TypeScript support (Node 22.18+ or 23.6+).

### Tests against a real server

`npm test` uses PGlite. `tests/integration/real-postgres.test.ts` also runs against a PostgreSQL
server when `TEST_DATABASE_URL` points to a disposable local test database (non-local hosts are
skipped), for example `property_test` of the bundled server. It migrates and seeds that database
and creates new, uniquely named test users on each run. It checks
UTF-8, Better Auth sign-up/verification/sign-in/reset through the `pg` driver, and draft isolation.
Without the variable, these tests are skipped.

Uncached reads (`searchListings`, `countListings`, `getListingsByIds`, `getListingCoversUncached`
in `lib/data/listings.ts`) start with `await connection()`. With a real server, opening a `pg`
connection uses `crypto.getRandomValues()` for the SCRAM exchange, which Next.js reports as an
error if it happens while prerendering or validating a runtime prefetch (seen in `next dev`
with the Windows service; PGlite never showed it).

With `DATA_BACKEND=postgres`, `next build` reads the database while prerendering. Each build
worker has its own pool (max. 5), so a build with many workers can open about 5 × workers
connections (≈ 55 with 11 workers); the database must allow that many (PostgreSQL's default is
100). The application keeps one pool per server process (also across development hot reloads).
Listing reads are cached for "minutes" in PostgreSQL mode (status changes show up quickly) and
"hours" in memory mode. Pages cache
listing reads for about an hour ("use cache", like the exchange rate). If the database is down,
pages fail with an error page; demo data is never shown in its place.
