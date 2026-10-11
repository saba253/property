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
- `lib/` holds business logic, split by topic (for example `lib/pricing/`, `lib/currency/`). Files in `lib/` must be plain TypeScript: no React, no imports from `app/` or `components/`. The one exception is `lib/currency/get-exchange-rate.ts`, which uses `next/cache` (`"use cache"`, `cacheLife`) to wrap the plain, tested fetch logic.
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

- Last completed step: Step 1.9 - Homepage cleanup, USD/GEL conversion with cross-currency budget filters, and property facts with amenity filters (on top of Step 1.8, the visual redesign, and a separate HTTP 404 status fix).
- What works: Passing locally (scratch copy): lint, typecheck, formatting, 169 tests, build, and browser checks at 375, 768, and 1280 px, plus a simulated NBG outage. GitHub Actions CI was confirmed green for Steps 1.3 and 1.4. CI for Steps 1.7 to 1.9 is not yet confirmed.
- Design system: inspired by Airbnb (simplicity, spacing, rounded cards) and Realtor.com (detailed facts, filters, detail pages), with an original identity. Tokens are in `app/globals.css` (`@theme`): primary navy `navy` (#172B46) for buttons, navigation, headings and the footer; interactive blue `accent-*` (#3478D4, use `accent-700` for small text) used sparingly for links, focus and the price-per-m² highlight; warm cream `cream` (#F7F4EE) only for selected section backgrounds; sand `sand-*` (#B98458) only for subtle decorative accents; white pages and cards; neutrals `ink`, `muted`, `subtle`, `line`, `line-strong`; `rounded-card`, `shadow-card`. No teal or green. Amber is reserved for demo labels and warnings. One global blue focus outline for keyboard users. Shared header and footer are rendered in `app/layout.tsx`; the header links to the demo listings. Property images are original SVG illustrations (`components/properties/property-illustration.tsx`, variant picked by `lib/properties/illustration.ts`) that are always labelled "ილუსტრაცია · არა რეალური ფოტო". The wordmark "Property Intelligence" is temporary; on phones only the logo mark shows.
- Demo detail page (prices): the page is static, so both USD and GEL prices are computed on the server from one rate snapshot and small client components (`components/properties/detail-pricing.tsx`, `useSearchParams` inside `<Suspense>`, USD fallback) pick one based on `?display=`.
- Demo detail page: `/properties/[id]` shows a clearly labeled demo listing in a Realtor.com-style layout: illustration, structural facts grid (area, rooms, bedrooms, bathrooms, floor / total floors, original currency; unknown values say "არ არის მითითებული"), an amenities section grouped into building features and equipment with yes / no / not specified, the visible price-per-m² formula in the display currency, data-source note, and a price summary panel that is sticky on desktop. It links back to the demo listings index. Unknown listing ids return the Georgian 404 page with HTTP 404 (`ensureStatic = "navigation"` and `instant = false` in the page; verified in dev and production builds).
- Demo listings index: `/properties` lists every active demo listing as a card (title, location, asking price, area, asking price per square metre) linking to its detail page, with a demo warning banner. Data comes from `getActiveDemoListingsWithProperties()` in `lib/properties/get-demo-listing.ts`. Cards are `components/properties/listing-card.tsx` (illustration, demo badge, price, facts, price-per-m² chip). All demo pages are marked noindex. The homepage has a "დემო განცხადებების ნახვა" button to `/properties`.
- Filters: `/properties` filters by city, currency, asking price range, and area range via shareable URL query parameters (`city=tbilisi|batumi`, `currency=USD|GEL`, `minPrice`, `maxPrice`, `minArea`, `maxArea`). The form (`components/properties/listing-filters-form.tsx`) uses `next/form` (GET, works without JavaScript) and shows the match count, removable filter chips (`lib/properties/filter-chips.ts`), a reset control, validation notices, and a Georgian empty state. It is one row on desktop and a two-column grid on phones. Pure logic is in `lib/properties/listing-filters.ts` (`parseListingFilters`, `filterListings`, `convertBudgetForDisplay`) and `lib/properties/cities.ts` (city slugs to Georgian names). Invalid values are dropped with a notice and inverted min/max ranges are swapped. Since Step 1.9, `minPrice`/`maxPrice` are a budget in the display currency and work across USD and GEL listings, compared with the same rounded display price the card shows, using one rate snapshot per request. `currency` now means the optional original-listing-currency filter (labelled "ორიგინალი ვალუტა"). Switching display currency converts the budget; without a rate the budget is dropped rather than reinterpreted. Inactive listings are always excluded. Results render inside `<Suspense>` because `searchParams` is request-time data under `cacheComponents`.
- Data model: `lib/properties/types.ts` defines Property, Listing, Money, Currency, and three-state `AmenityStatus` (`yes` / `no` / `unknown`; a missing key also means unknown, never "no"). `Property` has optional `rooms` (total rooms), `bedrooms` (distinct from rooms; 0 = studio), `bathrooms`, `floor`, `totalFloors`, and `features` (building: balcony, parking, elevator, centralHeating). `Listing` has optional `equipment` (included movable items: television, bed, refrigerator, washingMachine, airConditioning, dishwasher). Amenity definitions, Georgian labels and AND matching live in `lib/properties/amenities.ts` (add new amenities there). Structural fact formatting is in `lib/properties/property-facts.ts`. `lib/properties/demo-data.ts` contains six invented examples in Tbilisi and Batumi (USD and GEL), with deliberately missing values to exercise unknown handling. Do not invent other facts (for example construction year or exact addresses). Cities in filters are derived from active listing data.
- Advanced filters (Step 1.9): a native `<details>` "მეტი ფილტრი" section (keyboard accessible, works without JavaScript, open when any of its filters is active) with `minBedrooms`, `minBathrooms`, `minFloor`/`maxFloor`, and repeatable `amenity` checkboxes. Unknown structural values never match a structural filter; several amenities use AND matching on confirmed values. Each amenity has its own removable chip.
- Pricing: `lib/pricing/price-per-sqm.ts` calculates asking price per square metre. `lib/pricing/format-money.ts` formats prices, areas, the exchange rate and Georgian dates. `lib/pricing/display-price.ts` (`getDisplayPrice`) turns an original asking price into a `DisplayPrice` in the display currency: converted prices are rounded once to whole units, price per m² is calculated from that rounded amount, and the original price is always kept. `lib/pricing/format-display-price.ts` formats it ("≈" for converted prices, original-price note).
- Currency (Step 1.9): default display currency is USD; users can switch to GEL with `?display=GEL` (shareable). The exchange rate is the National Bank of Georgia's official daily USD rate from `https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/en/json/?currencies=USD` (free, no key), fetched server-side with a 5 s timeout (`lib/currency/nbg.ts`) and validated (`parseNbgUsdRate` in `lib/currency/exchange-rate.ts`; rejects wrong shapes and implausible values). It is cached with `"use cache"`: successful results with the "hours" profile, failures for about 5 minutes so an outage is retried at most every few minutes. No rate is ever hardcoded or invented. Freshness uses Georgian business days (`lib/currency/georgian-calendar.ts`: weekends, fixed public holidays, Orthodox Easter Friday to Monday): more than 2 business days without a new rate shows a "possibly outdated" note. `components/currency/rate-notice.tsx` shows the rate, source, effective date and that it is an official indicative rate, not a real-time market quote. If the rate is unavailable, original prices are shown with a notice, and budget filtering compares only same-currency listings and marks results as incomplete with a count of listings that could not be compared. Builds do not fail when NBG is unreachable (verified with a simulated outage).
- Homepage: Georgian-first landing page, redesigned in Step 1.8 with a hero, a labelled demo listing example, two planned-feature cards (search, price comparison), and principles. The standalone "financial calculators" card was removed in Step 1.9 because price per m² is calculated automatically from listing data. Feature and principle grids share the full container width and `gap-6`; features use 2 columns from `md`, principles 1 column below `lg` and 3 columns from `lg`, with no fixed heights.
- Technical notes: The Vitest `@/` alias matches `tsconfig.json`. `typecheck` runs Next.js type generation first. The `dynamicParams` route configuration was removed because it is incompatible with the enabled `cacheComponents` setting.
- Technical note on 404s: with `partialPrefetching`, Next.js 16.3+ streams the App Shell for params not returned by `generateStaticParams`, which would commit HTTP 200 before `notFound()` runs. `ensureStatic = "navigation"` makes those requests wait for the full render. `instant = false` silences only the dev-mode instant-navigation check, which flags awaiting params outside `<Suspense>`.
- Known issues: No visual or component tests (Vitest runs in Node only); UI was checked manually in the browser at 375, 768, and 1280 px. A map view is not implemented. Filter forms submit empty fields as empty query parameters (harmless, but URLs after a form submit are long; chip and toggle links are canonical). The Georgian holiday calendar is a best effort (extra government-declared days off are not known), so the outdated-rate note is worded as uncertain. Air conditioning is modelled as listing equipment; this can be revisited. Vitest uses the Node environment only. The original smoke test and starter SVG files remain. English localization is not implemented. OneDrive may interfere with the `.next` build cache on Windows.
- Environment variables: None configured yet.
- Next step: Step 1.10 - to be planned.
