# Submission and moderation (Steps 1.24–1.25)

Owners submit complete private listings for review; moderators claim a listing, then approve it,
request changes or reject it. **Nothing is published**: an approved listing stays private until
publishing exists (Step 1.26). Owners get in-app notifications; **no emails are sent**.

## Statuses (user listings)

| Status              | Meaning                                         | Owner can                                 |
| ------------------- | ----------------------------------------------- | ----------------------------------------- |
| `draft`             | private, editable                               | edit, add photos, submit, archive         |
| `submitted`         | waiting for a moderator; content frozen         | view, withdraw (back to `draft`)          |
| `changes_requested` | moderator asked for corrections (with a reason) | edit, add photos, resubmit, archive       |
| `approved`          | approved, **not published yet**                 | view, archive                             |
| `rejected`          | final decision (with a reason)                  | view, archive (no edit, no resubmission)  |
| `archived`          | removed by the owner; hidden everywhere         | nothing (no restore yet; history is kept) |

Allowed transitions (also in `lib/review/statuses.ts`; the database trigger enforces the same
table and a test checks all 60 combinations against it):

- owner: `draft → submitted`, `changes_requested → submitted`, `submitted → draft` (withdraw),
  `draft | changes_requested | approved | rejected → archived`;
- moderator: `submitted → approved | changes_requested | rejected`, only while holding an
  unexpired claim (below).

Design decisions:

- A submitted listing cannot be archived directly (withdraw first), so it cannot disappear while
  a moderator is reviewing it. Withdrawing ends any claim.
- `rejected` is final; corrections go through `changes_requested`.
- `archived` is terminal for now. A future restore should return only to `draft` and only from a
  previously editable state; it must never re-activate an approval automatically. (Not in 1.25.)
- User listings can never become `active`/`inactive` (the public statuses), their
  `data_source` can never change and their owner can never be replaced (migration 0006).

## Submission requirements

Checked on the server, inside one transaction with the listing row locked:

- signed-in, verified owner (from the session; the browser never sends an owner);
- status `draft` or `changes_requested` (a second click finds `submitted` → "conflict");
- the stored listing passes the full form validation;
- at least one stored photo (also enforced by the database trigger);
- at most 10 submissions per user per day (per process).

In the wizard the submit button appears only after the current entries are saved, so what is
reviewed is exactly what is stored. The submission's field fingerprints are stored in the same
transaction (change tracking, below).

## Moderators

- Role table `user_roles (user_id, role = 'moderator')`. Granted and revoked only with the local
  CLI; there is no page, API or self-assignment:
  ```
  npm run roles -- list
  npm run roles -- grant <email>      (account must exist and be verified)
  npm run roles -- revoke <email>
  ```
- The role is read from the database on every request. A moderator never sees their own
  listings in the queue and can neither claim nor decide on them (application and database).
- Everyone else gets the ordinary 404 page for every `/moderation` route (because of streaming
  the HTTP status is 200 with the 404 content, as for the other private pages); no queue entry,
  listing content, history or photo is included.

## Claims (reviewer assignment, Step 1.25)

| Rule                                                                        | Where enforced          |
| --------------------------------------------------------------------------- | ----------------------- |
| Only moderators claim, only submitted listings of other users               | service, store, trigger |
| A moderator claims only for themselves                                      | trigger                 |
| A claim lasts **60 minutes** from the database clock (`CLAIM_MINUTES`)      | trigger (sets expiry)   |
| While a claim is unexpired, other moderators can neither claim nor decide   | store, trigger          |
| The holder may renew ("ვადის გაგრძელება") or release ("გათავისუფლება")      | store, trigger          |
| An expired claim may be taken by another moderator                          | store, trigger          |
| Only the holder of an **unexpired** claim may decide (stale decisions fail) | store, trigger          |
| Any status change (decision, withdrawal) clears the claim                   | trigger                 |

- Expiry is evaluated from database timestamps (`clock_timestamp()`) when a request arrives; no
  background worker is needed. The page counts down from the server's remaining seconds and
  hides the decision controls when the time runs out; the server checks again anyway.
- Claims and releases are written to `listing_status_events` with `kind = 'claim' | 'release'`
  (actor, role, time; append-only), shown in the moderators' history, never to owners.
- Concurrency: claim, release and decision lock the listing row (`SELECT … FOR UPDATE`). Tested:
  of 6 simultaneous claims by 6 moderators exactly one succeeds, and of 6 simultaneous
  decisions exactly one succeeds (real PostgreSQL server; PGlite tests as well).
- `CLAIM_MINUTES` (TypeScript) and `interval '60 minutes'` (migration 0006) are kept equal by a
  test. The Step 1.25 brief said 30 minutes in one place and 60 in the approved decisions; 60 was
  implemented. Changing it needs a new migration (the function body) and the constant.

## Pages

- `/moderation`: queue of submitted listings, oldest first, 20 per page, filters by city and
  property type; each entry shows its claim state (free / yours with minutes left / another
  moderator with minutes left, never who) and first submission vs. resubmission (n-th).
- `/moderation/review?listing=…`: claim state, the change summary, read-only details, private
  photos (served to moderators only while submitted), the review history including claims, then
  the panel: "ავიღებ განსახილველად", renew/release, the decision with editable reason templates
  and a confirmation, and "შემდეგი განცხადება" (next in queue order, skipping listings another
  moderator holds; filters are kept). After a decision the next listing opens. On desktop the
  panel is sticky and scrolls on its own when taller than the window; on phones and tablets a
  compact sticky bar at the bottom shows the claim state and jumps to the panel (it hides while
  the panel is visible).
- `/moderation/history`: all status changes, claims and releases, newest first, 30 per page,
  filters by action and by date (Tbilisi days). Actors appear only as "თქვენ", "მოდერატორი" or
  "მფლობელი"; no names or emails.
- Change requests and rejections need a reason (1–1000 characters).

## Notifications (Step 1.25)

- Table `notifications`: one row per moderator decision (`changes_requested`, `approved`,
  `rejected`) for the listing owner, created **by the status trigger in the same transaction as
  the decision** (a rolled-back decision leaves no notification; tested).
- Ids are random (`nt-<uuid>`). Every query is limited to the session's user; another user's
  notification behaves like a missing one. The only allowed change is marking an unread
  notification as read (trigger `notifications_only_read_state`).
- The list shows the decision, the listing title, the moderator's reason (from the audit row)
  and a link to the owner's private view (no link once the listing is archived). Nothing about
  the moderator is stored or returned.
- UI: a bell with the unread count in the header (signed-in users only; the count comes from
  `/api/account/status`, private and never cached), `/account/notifications` with read/unread
  states, "წაკითხულად მონიშვნა" per item and for all; opening the listing marks it read.
- Notifications persist in PostgreSQL (refreshes and restarts). Email is out of scope.

## Change tracking between submissions (Step 1.25)

- At every submission the application stores one row in `listing_submission_fingerprints`
  (linked to the submission's audit event): for each form field a fingerprint, SHA-256 of
  (listing id, field name, normalized value) shortened to 32 hex characters, plus the names of
  the fields that differ from the previous submission's fingerprints.
- **No values are kept**: no price, title, district or photo bytes. Photos are compared by their
  ids (added/removed), order and cover, and descriptions. Fingerprints of low-variety fields
  (currency, room counts) could be guessed by trying values; they belong to the listing itself,
  which the database keeps anyway, and contain no personal data.
- Moderators see "პირველი გაგზავნა", the changed field labels, "ველები არ შეცვლილა", or
  "შედარება მიუწვდომელია" for listings first submitted before migration 0006.
- Retention: the rows are append-only like the audit trail and stay as long as the listing.

## Database

- 0005: status CHECK lists, `submitted_at`, queue index, `user_roles`, `listing_status_events`
  (append-only: UPDATE, DELETE and TRUNCATE are refused), the status and freeze triggers, see
  `db/README.md`.
- 0006: claim columns and trigger, audit `kind`, `notifications`, fingerprints, and the guards
  from the Step 1.24 review (uploaded photos checked on both the old and the new listing and
  never moved; fixed `data_source` and owner). Every status change still needs the transaction's
  actor (`set_config('app.actor_user_id' / 'app.actor_role' / 'app.status_reason', …, true)`, see
  `setActor` in `lib/drafts/draft-store.ts`).

## Privacy

Public reads (search, filters, map, detail pages, favorites, comparison, summaries API, covers,
comparables) use `status IN ('active','inactive')` and `data_source = 'demo'`, so no review status
appears anywhere public (tested for submitted, claimed, approved, changes_requested and
rejected). Moderators read a listing's photos only while it is submitted.

## Known limitations

- No email notifications (in-app only).
- Rate limits are per server process.
- The claim length is fixed in the migration (60 minutes); there is no admin setting.
- No restore for archived listings.
