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

## Workflow

- Work in small, verifiable steps.
- Before changing files, explain which files will change.
- Provide complete file contents when practical.
- Include exact commands and verification steps.
- Do not change unrelated files.
- After each successful step, update this context and create a Git commit.

## Current state

## Current state

- Last completed step: Step 1.3 — Project structure and conventions.
- What works: Passing locally: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`, `npm run build`. GitHub Actions CI runs lint, typecheck, tests, and build.
- Business logic so far: `lib/pricing/price-per-sqm.ts` (`calculateAskingPricePerSqm`, a pure helper for asking price per square metre, currency-neutral), tested in `tests/lib/pricing/price-per-sqm.test.ts`.
- Notes: `typecheck` runs `next typegen` first because Next.js generates types such as `LayoutProps` into `.next`, which does not exist on a fresh checkout. The Vitest `@/` alias is configured and matches `tsconfig.json`.
- Known issues: Vitest runs in the Node environment only (no component testing yet). `tests/smoke.test.ts` is a placeholder and can be removed later. CI for the Step 1.3 commit has not yet been confirmed.
- Environment variables: None configured yet.
- Next step: Step 1.4 — to be planned.
