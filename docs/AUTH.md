# Accounts and authentication (Steps 1.21–1.22)

**Status: working locally, off by default.** Since Step 1.22, accounts run end to end on a
development computer, and signed-in users can keep private listing drafts. The verified setup is
the Windows PostgreSQL 18 service (`property_intelligence_dev` on 127.0.0.1:5432, role
`property_app`) with the local SMTP catcher (`tools/local-dev/mail.mjs`); the bundled embedded
server (`tools/local-dev/postgres.mjs`) remains an alternative. There is
no production deployment, no real email delivery and no Google sign-in with real credentials yet.
Accounts stay **off** wherever the prerequisites are missing (as in CI and on the public demo).
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
- Account forms post their data (never `GET`) and keep the submit button disabled until React has
  hydrated. Browser testing found that a click before hydration let the browser send the login
  form itself as `GET`, putting the password in the URL; a static test now guards every account
  form.
- Not offered yet: email change, account deletion, two-factor authentication, roles, admin.
- Favorites and comparison stay in the browser; signing in or out never reads, merges or clears
  them.

## Windows development workflow (verified, Step 1.22)

Services and processes:

| What                     | How                                                       | Needed for                           |
| ------------------------ | --------------------------------------------------------- | ------------------------------------ |
| PostgreSQL 18 (service)  | Windows service `postgresql-x64-18`, starts automatically | everything (`DATA_BACKEND=postgres`) |
| SMTP catcher             | `node tools/local-dev/mail.mjs` (127.0.0.1:1025)          | verification and reset emails        |
| Next.js                  | `npm run dev` (http://localhost:3000)                     | the site                             |
| Embedded PostgreSQL 5433 | not needed; its data stays in `.data/postgres`            | only the older setup                 |

`.env.local` (written by `tools/local-dev/setup-pg-role.mjs`, never committed) holds
`DATABASE_URL` and `TEST_DATABASE_URL` for `property_app`, `DATA_BACKEND=postgres`,
`AUTH_ENABLED=true`, the secret, `BETTER_AUTH_URL=http://localhost:3000`,
`AUTH_SMTP_URL=smtp://127.0.0.1:1025` and `AUTH_EMAIL_FROM`. Start order: make sure the service
runs, start the mail catcher, then `npm run dev`. After any `.env.local` change, restart
`npm run dev` (the data backend and the auth instance are created when the server starts).

- Emails: newest `.eml` in `.data/mail` (open with any mail program). Use only disposable
  `…@example.test` addresses.
- Turn accounts off: set `AUTH_ENABLED=false` and restart `npm run dev`. Users, sessions and
  drafts stay in the database untouched; the account pages show the "not enabled" notice and
  `/api/auth/*` answers 404 until it is turned on again.
- Inspect in pgAdmin 4: Servers → PostgreSQL 18 → Databases → `property_intelligence_dev` →
  Schemas → public → Tables (Refresh after migrations). Read-only queries in the Query Tool, e.g.
  `SELECT email, "emailVerified", "createdAt" FROM users ORDER BY "createdAt" DESC;` and
  `SELECT l.id, l.status, l.asking_amount, l.asking_currency, u.email FROM listings l JOIN users u
ON u.id = l.owner_user_id WHERE l.data_source = 'user' ORDER BY l.updated_at DESC;`. Do not edit
  rows there; password hashes and session tokens are in `accounts` and `sessions`.

## Turning accounts on (development)

With the bundled tools (no system installation; details in `db/README.md`):

```
npm install --prefix tools/local-dev
node tools/local-dev/postgres.mjs
node tools/local-dev/mail.mjs
node tools/local-dev/setup-env.mjs
npm run db:migrate
npm run dev
```

`setup-env.mjs` writes `.env.local` with `AUTH_ENABLED=true`, the local database, a generated
secret, `BETTER_AUTH_URL=http://localhost:3000` and `AUTH_SMTP_URL=smtp://127.0.0.1:1025`.
Verification and reset emails land as `.eml` files in `.data/mail`; open the newest one and
follow its link. Use only disposable addresses (for example `…@example.test`).

With your own PostgreSQL and SMTP catcher, write `.env.local` yourself:

```
DATABASE_URL=postgres://property_dev@localhost:5432/property_dev
AUTH_ENABLED=true
BETTER_AUTH_SECRET=<32+ random characters>
BETTER_AUTH_URL=http://localhost:3000
AUTH_SMTP_URL=smtp://localhost:1025
AUTH_EMAIL_FROM=Property Intelligence <no-reply@localhost>
```

Generate the secret with
`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Restart the
server after changing `.env.local`. A local production build (`next start`) also accepts
`http://localhost` as `BETTER_AUTH_URL`; any other host must use https in production.

## Private listing drafts (Step 1.22)

- On the last step of `/properties/new`, a signed-in user (verified email) can "შენახვა
  დრაფტად". The draft is saved in PostgreSQL (`db/README.md`, migration 0003). A success message
  and the link to "ჩემი განცხადებები" appear only after the server confirms the save.
- Signed out, the form works as before (tab only). "შედით, რომ დრაფტი შეინახოთ" keeps the draft
  (without photos) in this tab's `sessionStorage`, opens `/login`, and restores the form after
  sign-in; the parked copy is removed after it is restored and saved. No session data is stored
  in the browser.
- `/account/listings` lists the user's drafts (newest first; status, type, place, original price
  and currency, last saved date from the database). "გაგრძელება" opens
  `/account/listings/edit?draft=<id>` with the saved values; "წაშლა" archives after an inline
  confirmation (kept and reversible, never hard-deleted).
- Writes are Server Actions (Next.js checks their origin). The owner comes only from the
  session; ids, status and data source in a request are ignored. Another user's draft id gives the
  same 404 as a missing one. Pages are per request, never cached, `noindex`.
- Photos (Step 1.23): signed-in owners upload up to 10 photos per saved draft; they are
  re-encoded without metadata, stored privately and served only to the owner. Details:
  `docs/STORAGE.md`. Submission and moderation (Step 1.24): `docs/MODERATION.md`. Publishing
  does not exist yet: the database forbids a user listing in any
  status other than draft or archived.

## Rotating local secrets (done 2026-10-16)

The project used to live in a OneDrive-synced folder, so the development secrets were rotated
after moving it to `C:\Users\<user>\dev\property`:

1. Stop `npm run dev`. Back up `.env.local` (`.env.local.backup-<time>-before-secret`).
2. Replace `BETTER_AUTH_SECRET` with 32 new random bytes (base64url), written atomically.
3. Revoke sessions explicitly; a new secret alone does not delete session rows. As
   `property_app`, in one transaction: `DELETE FROM sessions` and
   `DELETE FROM verifications WHERE "expiresAt" > now()` (pending verification/reset links).
   Users, accounts and drafts are untouched; everyone signs in again.
4. Rotate the database password: `node tools/local-dev/setup-pg-role.mjs --rotate` in your own
   terminal (see `db/README.md` for its crash-safe order).
5. Start `npm run dev` from the project folder and sign in again.

The Windows service listens on `localhost` only (`listen_addresses = 'localhost'` in
`C:\Program Files\PostgreSQL\18\data\postgresql.conf`; backup `postgresql.conf.bak-20261016`).
Restarting the service needs an administrator PowerShell (`Restart-Service postgresql-x64-18`);
a normal PowerShell fails with "Cannot open … service".

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
- Saving a draft says "შენახვა ახლა ვერ მოხერხდა": the server log shows `[drafts] save failed:
SQLSTATE …` (no values). Most often a migration is pending: run `npm run db:status` and
  `npm run db:migrate`.

## Verification status

- Unit and PGlite tests (`npm test`): Better Auth flows through its HTTP handler (sign-up,
  duplicate sign-up, verification, sign-in/out, forged and expired sessions, foreign origins,
  profile, reset with single use and expiry, rate limits, schema drift) and drafts
  (`tests/lib/drafts/`: session-only owner, forged fields ignored, validation without writes,
  rollback, cross-user isolation, demo data untouched, drafts absent from public queries,
  database refusing publication).
- Real PostgreSQL 18.4 server (`tests/integration/real-postgres.test.ts`, opt-in with
  `TEST_DATABASE_URL`): UTF-8, Better Auth through the `pg` driver, draft isolation.
- Browser, Step 1.22, first round (production build of a scratch copy, embedded PostgreSQL,
  local SMTP catcher): the full account and draft flows, plus the pre-hydration GET leak found and
  fixed.
- Browser, Step 1.22 final round on the **Windows PostgreSQL 18.6 service** (`next dev` on
  :3000 plus a production build, disposable `@example.test` users): registration through the
  form (email captured, user stored unverified with a scrypt hash), sign-in refused before
  verification, verification link (opened by a local script so the token never appeared in logs
  or chat), wrong password, sign-in, HttpOnly cookie, 7-day database session, session after
  refresh and after an app restart, Georgian profile name, sign-out (session row deleted),
  password reset email → new password (reused token refused, the other open session revoked),
  sign-in rate limit (429 after repeated attempts), cross-origin sign-in refused (403), GET to
  auth endpoints refused (404), all account forms `method="post"`. Drafts: create (original
  price and currency stored exactly, USD and GEL), reopen, edit, persist across an app restart,
  archive; a second user sees an empty list, gets 404 for the first user's draft, and the save and
  archive Server Actions called directly with that id are refused (`not-found` / `ok: false`);
  signed-out visitors are redirected to sign-in; drafts never appear in search, map, comparison,
  favorites, detail pages or `/api/listings/summaries`; the 11 demo listings are unchanged.
- Not verified: real SMTP delivery, Google OAuth with real credentials, a production host.
