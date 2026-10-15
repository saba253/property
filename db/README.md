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

| File                                    | Purpose                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `db/migrations/0001_initial_schema.sql` | cities, properties, listings, property_features, listing_equipment, listing_images, indexes |
| `lib/db/config.ts`                      | `DATA_BACKEND` / `DATABASE_URL` parsing; errors without secrets; local-host check           |
| `lib/db/migrations.ts`                  | migration runner (ordered, one transaction each, checksums, advisory lock)                  |
| `lib/db/listing-query.ts`               | SQL for the validated search (filters, budget, sort)                                        |
| `lib/db/postgres-repository.ts`         | `ListingRepository` in SQL                                                                  |
| `lib/db/mappers.ts`                     | rows → domain objects (the only NUMERIC → number boundary)                                  |
| `lib/db/seed-demo.ts`                   | development-only demo seed                                                                  |
| `lib/db/pg-client.ts`                   | `pg` pool (app) and single connection (scripts)                                             |
| `lib/repository/*`                      | interface, memory backend, backend selection                                                |
| `lib/data/listings.ts`                  | server-only, cached reads for pages                                                         |
| `scripts/db.mts`                        | `db:status`, `db:migrate`, `db:seed:demo`                                                   |

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
- **Status.** `active` and `inactive` only. Moderation states (draft, pending review, rejected,
  archived) will come in a later migration together with the code that uses them.
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
- Pagination is offset/limit (max 100 per page, offset ≤ 10,000) with a deterministic order.
  Cursor pagination is **not** implemented. The UI shows the first page (≤ 100 results) and says
  when there are more.

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
- **Main remaining cost: the exact total count** (`ნაპოვნია N`) on broad searches. It joins every
  match (~350 ms for 75,000 matches in PGlite). Options when real data arrives: cap the count
  ("1,000+"), use an estimate, or cache counts per filter set. Replacing `count(DISTINCT
currency)` with `min`/`max` was measured and gave no gain, so it was not kept.

## Comparables at scale

`findComparableCandidates` pre-selects in SQL (active, same transaction and rent period, type,
city, ±25% area, other property). `lib/analytics/comparables.ts` then applies the final rules:
one listing per property, district first, minimum 5. Statistics are computed in TypeScript as
before, so results are identical (parity test). When candidate sets become large, the median /
min / max can move into one aggregate query (`percentile_cont(0.5)`), computed on the same
USD-normalized price per m². That is not implemented yet, because the TypeScript version is
tested and correct.

## Local development (optional)

Requires your own local PostgreSQL. **Nothing is installed or created for you.**

1. Create a local database, for example `property_dev`.
2. Create `.env.local` (never committed):
   ```
   DATABASE_URL=postgres://property_dev@localhost:5432/property_dev
   ```
3. Run `npm run db:status`, then `npm run db:migrate`, then `npm run db:seed:demo`.
4. Start the site on the database: set `DATA_BACKEND=postgres` in `.env.local` and run
   `npm run dev`.

Safety:

- Every script requires an explicit `DATABASE_URL` and refuses non-local hosts. Only
  `db:migrate --allow-remote` can override this, for a future deliberate deployment step.
- The demo seed never runs in production and never overwrites non-demo rows.
- There is no reset or drop command. Migrations only move forward.
- The scripts use Node's built-in TypeScript support (Node 22.18+ or 23.6+).

With `DATA_BACKEND=postgres`, `next build` reads the database while prerendering. Pages cache
listing reads for about an hour ("use cache", like the exchange rate). If the database is down,
pages fail with an error page; demo data is never shown in its place.
