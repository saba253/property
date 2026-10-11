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
- `components/` will hold UI components when the first one exists. Components may import from `lib/`, never the reverse.
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

## Current state

## Current state

- Last completed step: Step 1.5 - Demo property detail page.
- What works: Passing locally: lint, typecheck, formatting, 25 tests, build, and browser checks. GitHub Actions CI was confirmed green for Steps 1.3 and 1.4. Step 1.5 CI is not yet confirmed.
- Demo detail page: `/properties/[id]` shows a clearly labeled demo listing with title, location, asking price, area, currency, and automatically calculated asking price per square metre. Demo pages are marked noindex and are not linked from the homepage. Unknown listing ids display the Georgian 404 page.
- Data model: `lib/properties/types.ts` defines Property, Listing, Money, and Currency. `lib/properties/demo-data.ts` contains two invented examples, one USD and one GEL.
- Pricing: `lib/pricing/price-per-sqm.ts` calculates asking price per square metre. `lib/pricing/format-money.ts` formats prices and areas without currency conversion.
- Homepage: Georgian-first landing page from Step 1.4.
- Technical notes: The Vitest `@/` alias matches `tsconfig.json`. `typecheck` runs Next.js type generation first. The `dynamicParams` route configuration was removed because it is incompatible with the enabled `cacheComponents` setting.
- Known issues: Vitest uses the Node environment only. The original smoke test and starter SVG files remain. English localization is not implemented. There is no listings index page yet. OneDrive may interfere with the `.next` build cache on Windows.
- Environment variables: None configured yet.
- Next step: Step 1.6 - to be planned.
