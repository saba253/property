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

## Workflow

- Work in small, verifiable steps.
- Before changing files, explain which files will change.
- Provide complete file contents when practical.
- Include exact commands and verification steps.
- Do not change unrelated files.
- After each successful step, update this context and create a Git commit.

## Current state

## Current state

- Last completed step: Step 1.2 — Development tooling (Prettier, Vitest, npm scripts, GitHub Actions workflow).
- What works: Next.js app created. Passing locally and in GitHub Actions CI: `npm run lint`, `npm run typecheck`, `npm test` (one smoke test), `npm run build`. Also available: `npm run format`, `npm run format:check`, `npm run test:watch`.
- Tooling files: `.prettierrc.json`, `.prettierignore`, `vitest.config.ts`, `tests/smoke.test.ts`, `.github/workflows/ci.yml`.
- Notes: `typecheck` runs `next typegen` first, because Next.js generates types such as `LayoutProps` into `.next`, which does not exist on a fresh checkout.
- Known issues: Tests are placeholders only. Vitest is configured for the Node environment (no component testing yet). Vitest does not yet know the `@/` import alias; add it when the first test needs it.
- Environment variables: None configured yet.
- Next step: Step 1.3 — to be planned.
