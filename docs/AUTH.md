# Accounts and authentication (Step 1.21)

**Status: authentication foundation, not yet active.** The code, database schema, pages and
security settings are in place and tested against a real PostgreSQL engine (PGlite). Accounts
stay **off** on this site until a PostgreSQL server, secrets and an SMTP server are configured.
While off, `/login`, `/register`, `/forgot-password` and `/reset-password` show a Georgian notice
instead of forms, every `/api/auth/*` endpoint answers 404, and nothing falls back to a demo or
in-memory login.

## Library choice

**Better Auth 1.7.6** (open source, MIT, runs inside this app; no vendor account or fees).

|                                    | Better Auth               | Auth.js (next-auth)                                                    | Managed service (Clerk, Auth0, …) |
| ---------------------------------- | ------------------------- | ---------------------------------------------------------------------- | --------------------------------- |
| Email + password                   | built in (scrypt hashing) | "credentials" provider, discouraged; no hashing, verification or reset | built in                          |
| Email verification, password reset | built in                  | not for credentials                                                    | built in                          |
| Sessions in PostgreSQL             | yes (`pg` / Kysely)       | via adapter                                                            | vendor-hosted                     |
| Google OAuth                       | built in                  | built in                                                               | built in                          |
| Rate limiting                      | built in, database-backed | no                                                                     | built in                          |
| Cost, lock-in                      | none                      | none                                                                   | paid tiers, data at the vendor    |
| Next.js 16                         | supported                 | v5 still beta                                                          | supported                         |

Better Auth covers every required flow with documented defaults, keeps user data in our own
PostgreSQL and needs no external account.

## What is implemented

- Schema: `db/migrations/0002_auth_accounts.sql`, with `users`, `sessions`, `accounts`,
  `verifications` and `rate_limits`, following Better Auth's core schema. A test asks Better Auth
  whether anything is missing. Also `listings.owner_user_id`, which stays NULL and is required to
  be NULL for demo listings.
- `lib/auth/config.ts`: activation gate (all prerequisites or nothing).
- `lib/auth/server.ts`: Better Auth configuration (no Next.js imports; tested).
- `lib/auth/instance.ts` (server-only): one instance per process and `getCurrentSession()`.
- `lib/auth/validation.ts`, `redirect.ts` and `email.ts`: shared input rules, open-redirect
  protection, and Georgian emails sent through SMTP (nodemailer).
- Routes: `/api/auth/[...all]` (Better Auth) and `/api/account/status` (own sign-in state only).
- Pages: `/login`, `/register`, `/forgot-password`, `/reset-password` and `/account`, all
  `noindex`, rendered per request and never cached. The header has a compact "შესვლა" link, or an
  account menu with "ჩემი ანგარიში" and "გამოსვლა".

## Security design

- Passwords: Better Auth's scrypt hashes in `accounts.password`; 10–128 characters; checked on
  the server (a `before` hook uses the same rules as the forms). Never logged or put in URLs.
- Email verification is required before the first sign-in; sign-in re-sends the link. No
  automatic sign-in after sign-up.
- No account enumeration: a duplicate sign-up gets the same answer as a new one (the owner gets
  an email). Wrong password and unknown email give the same error. Password-reset requests
  always answer the same way.
- Sessions: database rows, HttpOnly cookie, SameSite=Lax, Secure in production, 7-day expiry,
  deleted on sign-out. All sessions are revoked on a password reset. No cookie cache, so every
  check reads the database.
- CSRF and origins: Better Auth's origin checks are forced on (`disableOriginCheck: false`), even
  when `NODE_ENV=test`, where Better Auth would otherwise skip them. JSON-only endpoints.
- Redirects: `safeRedirectPath` accepts only same-site paths (no `//`, backslashes, other hosts or
  `/api`).
- Rate limits are stored in PostgreSQL (`rate_limits`) and shared by all server instances:
  - sign-in: 5 per minute;
  - sign-up: 5 per hour;
  - password reset and verification emails: 3 per hour;
  - reset: 5 per hour;
  - other auth endpoints: 60 per minute.

  Limits are counted per IP from the proxy header. Configure your host to forward a trusted
  client IP; without one, Better Auth falls back to one shared bucket and logs a warning.

- Google: off unless both credentials are set. Account linking keeps Better Auth's defaults: an
  OAuth identity is linked only when the provider confirms the email and the local account is
  verified. OAuth state is checked by Better Auth.
- Not offered yet: email change, account deletion, two-factor authentication, roles, admin.
- Favorites and comparison stay in the browser; signing in or out never reads, merges or clears
  them.

## Turning accounts on (development)

1. A local PostgreSQL server (not installed on this computer yet; needs your approval).
2. `.env.local` (never committed):
   ```
   DATABASE_URL=postgres://property_dev@localhost:5432/property_dev
   AUTH_ENABLED=true
   BETTER_AUTH_SECRET=<32+ random characters>
   BETTER_AUTH_URL=http://localhost:3000
   AUTH_SMTP_URL=smtp://localhost:1025
   AUTH_EMAIL_FROM=Property Intelligence <no-reply@localhost>
   ```
   Generate the secret with
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
   For local email, run any SMTP catcher on port 1025 (for example Mailpit) and open its inbox.
3. Run `npm run db:migrate`, then restart `npm run dev`.

## Production prerequisites

- HTTPS `BETTER_AUTH_URL` (required by the gate in production) and a managed PostgreSQL.
- A unique secret stored in the host's secret manager. Never reuse the development secret.
- An SMTP provider with SPF, DKIM and DMARC for the sending domain (choosing and paying for one
  needs your approval).
- A trusted client-IP header for rate limits.
- Run migrations as a deliberate step (`npm run db:migrate -- --allow-remote` from a trusted
  machine).

## Google sign-in

1. In Google Cloud Console (needs your account), create an OAuth client of type "Web
   application".
2. Authorized redirect URI: `<BETTER_AUTH_URL>/api/auth/callback/google`.
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the server and restart. The
   "Google-ით შესვლა" button appears only then.

## Troubleshooting

- The pages say accounts are not enabled: check the server log line `[auth] Accounts are
disabled: …`, which lists the missing settings without their values.
- Sign-in answers 403: the email is not verified yet (a new link was sent).
- 429: a rate limit. Wait for the window to pass.
- After changing `.env.local`, restart the server; the instance is created once per process.

## Verification status

- Run end to end on PGlite through Better Auth's HTTP handler
  (`tests/lib/auth/auth-flows.test.ts` and `schema-and-limits.test.ts`):
  - sign-up, duplicate sign-up, verification, sign-in and sign-out;
  - expired or forged sessions, foreign origins;
  - profile update, password reset (single use, expiry);
  - rate limits and schema drift.
- Not verified yet: the `pg` driver against a PostgreSQL server for auth, real SMTP delivery,
  Google OAuth with real credentials, and the pages with accounts enabled in a browser.
