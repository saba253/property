# Draft photo storage (Step 1.23)

Signed-in users can upload, view, reorder, choose a cover for, describe and remove real photos of
their **private** listing drafts. Photos persist across refreshes, sign-outs, application
restarts and PostgreSQL restarts. Nothing is public: there is no publishing yet.

## Where photos live

| What               | Where                                                                             |
| ------------------ | --------------------------------------------------------------------------------- |
| Image files        | `.data/uploads/<first 2 key chars>/<32 hex chars>.webp` (or `PHOTO_STORAGE_DIR`)  |
| Metadata           | PostgreSQL `listing_images` rows with `source_kind = 'upload'` (migration 0004)   |
| Served to the user | `GET /api/drafts/<draftId>/photos/<photoId>`, only to the draft's signed-in owner |

- `.data/` is git-ignored and outside `public/`, so Next.js never serves it as a static file
  (`/.data/...` answers 404). A `PHOTO_STORAGE_DIR` inside `public/` is refused at startup.
- On Windows the project lives in `C:\Users\<user>\dev\property` (outside OneDrive), and new
  folders inherit its private ACL (SYSTEM, Administrators and the owner only).
- File names are random 128-bit keys generated on the server. The browser's file name is never
  used for anything; keys are validated on every read, write and delete (no `..`, separators or
  drive letters), and the resolved path must stay inside the storage folder.
- Writes are atomic (temporary file in the same folder, then rename; never overwrites).

## Formats and limits

- Accepted: JPEG, PNG, WebP. Everything else (SVG, GIF, TIFF, HEIC, PDF, HTML, scripts…) is refused.
- Up to 10 MB per original file (checked from `Content-Length` and while reading the body).
- Up to 10,000 px per side and 40 megapixels (decompression bombs are refused from the header,
  before decoding).
- Up to 10 photos per draft, enforced under a row lock (and by a database trigger), also with
  many simultaneous uploads.
- Per user and server process: 40 uploads and 200 other photo changes per 10 minutes. (Not a
  production rate limit; add edge/shared limits before launch.)

## Processing (lib/photos/process-image.ts, sharp 0.35.5)

1. Size check, then the file's first bytes must be a JPEG, PNG or WebP signature.
2. sharp reads the header; the decoded format must match the signature; dimension limits apply.
3. The image is decoded (truncated or corrupt data fails), rotated upright from its EXIF
   orientation, converted to sRGB, reduced to at most 2048 px on its long side (never enlarged)
   and written as a **new WebP** (quality 82). At most two images are processed at a time.
4. **Metadata removal:** only pixels are copied. EXIF (camera, serial numbers, **GPS position**,
   dates), XMP, IPTC, ICC profiles and comments are dropped. Tests check that a JPEG with GPS
   EXIF comes out without EXIF and upright, and the browser test confirmed it end to end.

## Privacy and authorization

- Every operation reads the session on the server and checks in PostgreSQL that the draft
  belongs to that user, is user data and is a draft. Another user's draft or photo behaves like
  a missing one (404). Anonymous requests: 401 for uploads and changes, 404 for the photo list and images.
- Uploads, changes and deletions require this site's `Origin` header (CSRF protection on top of
  the SameSite=Lax session cookie). Image responses: `Cache-Control: private, no-store`,
  `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`,
  `Cross-Origin-Resource-Policy: same-origin`, `Vary: Cookie`.
- Public queries (search, map, detail pages, favorites, comparison, `/api/listings/summaries`,
  covers) read only images of public listings and never `upload` rows, even if a draft id is
  passed in. The database refuses upload rows on demo listings and demo-style images on drafts.
- **Review statuses (Step 1.24):** photos can be added, reordered, described or removed only in
  `draft` and `changes_requested` (application and database trigger). The owner can view them in
  every other status except archived; moderators can view them only while the listing is
  `submitted`.
- **Archived drafts:** their photos are kept unchanged (archiving is reversible) but cannot be
  viewed or changed until a future restore feature exists. Nothing is hard-deleted on archive.

## Upload workflow (save first)

Photos belong to a stored draft. On the photos step a signed-in user without a saved draft sees
"დრაფტის შენახვა და ფოტოების დამატება": the draft is saved (the earlier steps are already valid),
the address becomes the draft's edit page, and uploads start. This avoids anonymous or orphaned
staging uploads. Visitors who are not signed in keep the local, browser-only preview (nothing is
uploaded); after signing in they choose the photos again.

## Consistency and recovery

- Upload: process → store the file → insert the row in a transaction (draft row locked, count
  checked). If the insert fails or is refused, the file is deleted again.
- Delete: the row is removed in a transaction (cover reassigned, order closed up), then the file.
- A crash between the two steps can leave an **unreferenced file**. It is unreachable (photos
  are served only through a row). List and clean such files:
  - `npm run photos:orphans` (read-only report)
  - `npm run photos:orphans -- --delete` (removes only unreferenced files older than one hour)

## Backup and restore

Back up **both** the database and the storage folder, at the same time if possible:

1. `pg_dump` of `property_intelligence_dev` (or the production database), and
2. a copy of `.data/uploads` (or the bucket).

Restore both together. A database restored without the files shows broken images; files without
rows are orphans (see above). The embedded PostgreSQL data in `.data/postgres` is separate and is
not used for photos.

## Moving to S3 / Cloudflare R2 later

`lib/photos/storage.ts` defines a three-method `PhotoStorage` interface (`put`, `get`, `delete`
by key). An S3/R2 adapter (private bucket, server-side credentials, no public access) can replace
`createLocalPhotoStorage` in `lib/photos/instance.ts`; keys, routes, database rows and the UI stay
the same. Copy existing files with the same keys. Signed URLs or a CDN can come later, when
photos become public with publishing. No paid service is used today.

## Known limitations

- One processed size (≤ 2048 px); no separate thumbnails yet (the list and gallery use the same
  file; files are small WebP).
- Photos are processed in the web server process; a background queue would be better at scale.
- Rate limits are per process. No antivirus scanning (files are re-encoded from pixels, which
  removes embedded payloads, but a scanner is still advisable before public uploads).
- No drag-to-reorder; reordering uses left/right buttons (keyboard and touch friendly).
- Signed-out visitors' local previews are not carried over after signing in.
- **Development reload loop (root cause NOT confirmed).** Twice (Step 1.23 after a restart,
  Step 1.24 after a long session with many edits) every page of `npm run dev` reloaded several
  times per second. Deleting the generated `.next/dev` folder stopped it both times. That is a
  **workaround, not a fix**: the trigger is unknown. Details of the Step 1.25 investigation are in
  "Investigating the dev reload loop" below.

## Investigating the dev reload loop (Step 1.25)

**Mechanism (read in `node_modules/next/dist/server/dev/hot-reloader-turbopack.js`, Next.js
16.4).** On connect the server sends the browser its `hmrVersion`; the browser answers with
`turbopack-subscribe` carrying that version. Any compilation event in between increments the
server's `clientHmrVersion`; the versions then differ and the server answers `RELOAD_PAGE` with
"HMR hash mismatch". A loop therefore needs something that causes a compilation on (almost)
every page load. In the first occurrence each browser console message written to
`.next/dev/logs/next-development.log` was followed by "Compiled", so the watcher reacted to
files that it normally ignores, or to files changed by every page load.

**Tried in Step 1.25, none reproduced the loop on a healthy `.next/dev`:**

- appending a line to `.next/dev/logs/next-development.log` (no compilation);
- touching `next-env.d.ts` (no compilation);
- creating and deleting 30 temporary files inside `app/` like in-place editors do (`sed…`,
  `*.tmp.*`), then loading pages (no compilation, no `RELOAD_PAGE`);
- a long session with ~30 source edits, new routes, a migration and an open tab (normal
  "Compiled" per edit, no loop);
- a file-change log of a whole browser session (`.data/uploads`, `.data/mail`,
  `.next/dev/logs`, `.next/dev/cache` change constantly; none triggered a compilation).

The application itself has no runtime file access that the bundler would trace into the project
folder (only `lib/photos/instance.ts`, marked `turbopackIgnore`, and the migration loader, which
is used by scripts only). Not done: a Webpack comparison (without a reproducible trigger it would
prove nothing) and Turbopack tracing (to be enabled when the loop is live). No dependency was
upgraded.

**Remaining hypotheses (unconfirmed):** a stale entry in the persistent Turbopack cache
(`.next/dev/cache`, ~450 MB after a day) that invalidates on every request; a file watched
through an earlier `process.cwd()` trace kept in that cache; Windows file events (antivirus or
indexing) touching watched files.

**If it happens again — keep the evidence first:**

1. Leave the looping tab open. In a second terminal run
   `node tools/local-dev/watch-probe.mjs --snapshot`. It copies `.next/dev/logs` and a listing of
   `.next/dev` to `.data/diagnostics/<time>/` and then logs every file change (git-ignored; it
   never changes project files). Let it run for ~30 seconds of looping, then Ctrl+C.
2. Optionally restart once with `NEXT_TURBOPACK_TRACING=1 npm run dev` (trace in `.next/dev`)
   to see which file invalidates.
3. Only then stop `npm run dev`, rename (not delete) `.next/dev` to keep it for analysis, and
   start again.

A fix counts as confirmed only when the loop can be triggered on purpose and no longer appears
with the fix under the same steps.

## Commands (Windows, from the project folder)

```
node tools/local-dev/mail.mjs
npm run dev
npm run db:status
npm run db:migrate
npm run photos:orphans
```

Tests: `npm test` (PGlite + temporary folders), and against the separate real test database:
`TEST_DATABASE_URL=<property_intelligence_dev_test URL> npx vitest run tests/integration`.
