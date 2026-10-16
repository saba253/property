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
- **Development reload loop (cause not confirmed).** Once, after restarting `npm run dev`,
  every page reloaded several times per second (each browser console message written to
  `.next/dev/logs/next-development.log` was followed by "Compiled" and a full reload). It
  started on all pages, including ones without photo code, and stopped when the old tab was
  closed but returned in a new tab. It disappeared after deleting the generated `.next/dev`
  folder; at the same time a `/* turbopackIgnore: true */` hint was added to `process.cwd()` in
  `lib/photos/instance.ts`. Which of the two fixed it is unknown, and the loop could not be
  reproduced afterwards (see PROJECT_CONTEXT.md). If it happens again: stop `npm run dev`,
  delete `.next/dev` (generated; no source or data) and start it again.

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
