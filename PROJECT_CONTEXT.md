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
- `components/` holds UI components, split by topic: `components/site/` (header, footer, logo), `components/properties/` (cards, filters, demo labels, illustration, facts, price per m²), `components/ui/styles.ts` (shared button, field, card and container classes). Components may import from `lib/`, never the reverse.
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

- Last completed step: Step 1.8 - Visual redesign (plus a separate HTTP 404 status fix).
- What works: Passing locally: lint, typecheck, formatting, 67 tests, build, dev-mode, and browser checks. GitHub Actions CI was confirmed green for Steps 1.3 and 1.4. CI for Steps 1.7 and 1.8 is not yet confirmed.
- Design system: inspired by Airbnb (simplicity, spacing, rounded cards) and Realtor.com (detailed facts, filters, detail pages), with an original identity. Tokens are in `app/globals.css` (`@theme`): primary navy `navy` (#172B46) for buttons, navigation, headings and the footer; interactive blue `accent-*` (#3478D4, use `accent-700` for small text) used sparingly for links, focus and the price-per-m² highlight; warm cream `cream` (#F7F4EE) only for selected section backgrounds; sand `sand-*` (#B98458) only for subtle decorative accents; white pages and cards; neutrals `ink`, `muted`, `subtle`, `line`, `line-strong`; `rounded-card`, `shadow-card`. No teal or green. Amber is reserved for demo labels and warnings. One global blue focus outline for keyboard users. Shared header and footer are rendered in `app/layout.tsx`; the header links to the demo listings. Property images are original SVG illustrations (`components/properties/property-illustration.tsx`, variant picked by `lib/properties/illustration.ts`) that are always labelled "ილუსტრაცია · არა რეალური ფოტო". The wordmark "Property Intelligence" is temporary; on phones only the logo mark shows.
- Demo detail page: `/properties/[id]` shows a clearly labeled demo listing in a Realtor.com-style layout: illustration, facts grid (city, district, area, optional rooms and floor, currency), the visible price-per-m² formula, data-source note, and a price summary panel that is sticky on desktop. It links back to the demo listings index. Unknown listing ids return the Georgian 404 page with HTTP 404 (`ensureStatic = "navigation"` and `instant = false` in the page; verified in dev and production builds).
- Demo listings index: `/properties` lists every active demo listing as a card (title, location, asking price, area, asking price per square metre) linking to its detail page, with a demo warning banner. Data comes from `getActiveDemoListingsWithProperties()` in `lib/properties/get-demo-listing.ts`. Cards are `components/properties/listing-card.tsx` (illustration, demo badge, price, facts, price-per-m² chip). All demo pages are marked noindex. The homepage has a "დემო განცხადებების ნახვა" button to `/properties`.
- Filters: `/properties` filters by city, currency, asking price range, and area range via shareable URL query parameters (`city=tbilisi|batumi`, `currency=USD|GEL`, `minPrice`, `maxPrice`, `minArea`, `maxArea`). The form (`components/properties/listing-filters-form.tsx`) uses `next/form` (GET, works without JavaScript) and shows the match count, removable filter chips (`lib/properties/filter-chips.ts`), a reset control, validation notices, and a Georgian empty state. It is one row on desktop and a two-column grid on phones. Pure logic is in `lib/properties/listing-filters.ts` (`parseListingFilters`, `filterListings`) and `lib/properties/cities.ts` (city slugs to Georgian names). Invalid values are dropped with a notice, inverted min/max ranges are swapped, and price limits are ignored unless a currency is chosen, so USD and GEL are never compared. Inactive listings are always excluded. Results render inside `<Suspense>` because `searchParams` is request-time data under `cacheComponents`.
- Data model: `lib/properties/types.ts` defines Property, Listing, Money, and Currency. `Property` has optional `rooms` and `floor`, shown only when present. `lib/properties/demo-data.ts` contains two invented examples, one USD and one GEL. Do not invent other facts (for example construction year or exact addresses).
- Pricing: `lib/pricing/price-per-sqm.ts` calculates asking price per square metre. `lib/pricing/format-money.ts` formats prices and areas without currency conversion.
- Homepage: Georgian-first landing page, redesigned in Step 1.8 with a hero, a labelled demo listing example, two planned-feature cards (search, price comparison), and principles. The standalone "financial calculators" card was removed in Step 1.9 because price per m² is calculated automatically from listing data. Feature and principle grids share the full container width and `gap-6`; features use 2 columns from `md`, principles 1 column below `lg` and 3 columns from `lg`, with no fixed heights.
- Technical notes: The Vitest `@/` alias matches `tsconfig.json`. `typecheck` runs Next.js type generation first. The `dynamicParams` route configuration was removed because it is incompatible with the enabled `cacheComponents` setting.
- Technical note on 404s: with `partialPrefetching`, Next.js 16.3+ streams the App Shell for params not returned by `generateStaticParams`, which would commit HTTP 200 before `notFound()` runs. `ensureStatic = "navigation"` makes those requests wait for the full render. `instant = false` silences only the dev-mode instant-navigation check, which flags awaiting params outside `<Suspense>`.
- Known issues: No visual or component tests (Vitest runs in Node only); UI was checked manually in the browser at 375, 768, and 1280 px. A map view is not implemented. Filter forms submit empty fields as empty query parameters (harmless). Vitest uses the Node environment only. The original smoke test and starter SVG files remain. English localization is not implemented. OneDrive may interfere with the `.next` build cache on Windows.
- Environment variables: None configured yet.
- Next step: Step 1.9 - to be planned.
