# Georgian Property Intelligence Platform

## Project goal

Build a Georgian real estate decision-support platform. Help users compare properties and understand asking prices, rather than simply browse listings.

## Current setup

- Solo founder using Claude Free.
- Budget: $0 until launch.
- Windows, Next.js, TypeScript, Tailwind CSS.
- Local development only.
- Demo data only. Every demo listing must be clearly labeled.
- Never present demo data as real.
- No scraping and no AI features in the MVP.

## Stack plan

- Next.js App Router + TypeScript
- Tailwind CSS and shadcn/ui
- Georgian and English languages first; Russian later
- Supabase for PostgreSQL, authentication, and storage when needed
- Drizzle ORM, Zod, MapLibre, Vitest when needed

## Architecture rules

- Keep business logic separate from UI components.
- Separate physical properties from listings/offers and listing history.
- Support USD and GEL.
- Market comparisons must refer to asking prices of similar active listings, never claim to be verified transaction prices or definitive fair value.
- Validate user input.
- Never expose secrets in client-side code.
- Add dependencies only when needed.
- Do not implement scraping or real-data ingestion without a separate review.

## Folder conventions

- `app/` holds routes and pages only (the project has no `src/` folder).
- `lib/` holds business logic, split by topic (for example `lib/pricing/`). Files in `lib/` must be plain TypeScript: no React, no imports from `app/` or `components/`.
- `components/` holds UI components, split by topic (for example `components/properties/`). Components may import from `lib/`, never the reverse.
- `tests/` mirrors `lib/` (for example `tests/lib/pricing/` tests `lib/pricing/`).
- The `@/` import alias points to the project root, in both `tsconfig.json` and `vitest.config.ts`. Example: `@/lib/pricing/price-per-sqm`.
- `lib/properties/` holds the data model (`Property` is the physical thing, `Listing` is an offer for it) and demo data. Prices and areas are never converted between currencies.

## Workflow

- Work in small, verifiable steps.
- Before changing files, explain which files will change.
- Provide complete file contents when practical.
- Include exact commands and verification steps.
- Do not change unrelated files.
- After each successful step, update this context and create a Git commit.

## Current state

- Last completed step: Step 1.7 - Listing search and filters.
- What works: Passing locally: lint, typecheck, formatting, 54 tests, build, and browser checks. GitHub Actions CI was confirmed green for Steps 1.3 and 1.4. CI for Step 1.7 is not yet confirmed.
- Demo detail page: `/properties/[id]` shows a clearly labeled demo listing with title, location, asking price, area, currency, and automatically calculated asking price per square metre. It links back to the demo listings index. Unknown listing ids display the Georgian 404 page.
- Demo listings index: `/properties` lists every active demo listing as a card (title, location, asking price, area, asking price per square metre) linking to its detail page, with a demo warning banner. Data comes from `getActiveDemoListingsWithProperties()` in `lib/properties/get-demo-listing.ts`. Cards are `components/properties/listing-card.tsx`. All demo pages are marked noindex and are not linked from the homepage yet.
- Filters: `/properties` filters by city, currency, asking price range, and area range via shareable URL query parameters (`city=tbilisi|batumi`, `currency=USD|GEL`, `minPrice`, `maxPrice`, `minArea`, `maxArea`). The form (`components/properties/listing-filters-form.tsx`) uses `next/form` (GET, works without JavaScript) and shows the match count, a reset control, validation notices, and a Georgian empty state. Pure logic is in `lib/properties/listing-filters.ts` (`parseListingFilters`, `filterListings`) and `lib/properties/cities.ts` (city slugs to Georgian names). Invalid values are dropped with a notice, inverted min/max ranges are swapped, and price limits are ignored unless a currency is chosen, so USD and GEL are never compared. Inactive listings are always excluded. Results render inside `<Suspense>` because `searchParams` is request-time data under `cacheComponents`.
- Data model: `lib/properties/types.ts` defines Property, Listing, Money, and Currency. `lib/properties/demo-data.ts` contains two invented examples, one USD and one GEL.
- Pricing: `lib/pricing/price-per-sqm.ts` calculates asking price per square metre. `lib/pricing/format-money.ts` formats prices and areas without currency conversion.
- Homepage: Georgian-first landing page from Step 1.4.
- Technical notes: The Vitest `@/` alias matches `tsconfig.json`. `typecheck` runs Next.js type generation first. The `dynamicParams` route configuration was removed because it is incompatible with the enabled `cacheComponents` setting.
- Known issues: Unknown listing ids such as `/properties/nope` render the Georgian 404 page but return HTTP 200. Cause: with `partialPrefetching`, Next.js 16.3+ immediately streams the route's App Shell for params not returned by `generateStaticParams`, which commits status 200 before `notFound()` runs (Next.js then adds a noindex tag). Proposed fix, not yet applied: `export const ensureStatic = "navigation";` in `app/properties/[id]/page.tsx`, which makes unknown ids wait for the full render; tested in a scratch build and it returned 404. Filter forms submit empty fields as empty query parameters (harmless). Vitest uses the Node environment only. The original smoke test and starter SVG files remain. English localization is not implemented. OneDrive may interfere with the `.next` build cache on Windows.
- Environment variables: None configured yet.
- Next step: Decide on the 404 status fix, then Step 1.8 - to be planned.
