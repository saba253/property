# Submission and moderation (Step 1.24)

Owners submit complete private listings for review; moderators approve, request changes or
reject them. **Nothing is published**: an approved listing stays private until publishing exists
(Step 1.26). No emails are sent in this step.

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
- moderator: `submitted → approved | changes_requested | rejected`.

Design decisions:

- A submitted listing cannot be archived directly (withdraw first), so it cannot disappear while
  a moderator is reviewing it.
- `rejected` is final; corrections go through `changes_requested`.
- `archived` is terminal for now. A future restore should return only to `draft` and only from a
  previously editable state; it must never re-activate an approval automatically.
- User listings can never become `active`/`inactive` (the public statuses).

## Submission requirements

Checked on the server, inside one transaction with the listing row locked:

- signed-in, verified owner (from the session; the browser never sends an owner);
- status `draft` or `changes_requested` (a second click finds `submitted` → "conflict");
- the stored listing passes the full form validation;
- at least one stored photo (also enforced by the database trigger);
- at most 10 submissions per user per day (per process).

In the wizard the submit button appears only after the current entries are saved, so what is
reviewed is exactly what is stored.

## Moderators

- Role table `user_roles (user_id, role = 'moderator')`. Granted and revoked only with the local
  CLI; there is no page, API or self-assignment:
  ```
  npm run roles -- list
  npm run roles -- grant <email>      (account must exist and be verified)
  npm run roles -- revoke <email>
  ```
- The role is read from the database on every request. A moderator never sees their own
  listings in the queue and cannot decide on them (application and database).
- `/moderation`: queue of submitted listings, oldest first, 20 per page; owner names and emails
  are not shown. `/moderation/review?listing=…`: read-only details, private photos (served to
  moderators only while the listing is submitted), history, and the decision with a confirmation.
  Change requests and rejections need a reason (1–1000 characters).
- Everyone else gets the ordinary 404 page for both routes (because of streaming the HTTP status
  is 200 with the 404 content, as for the other private pages); no queue entry, listing content
  or photo is included.

## Database (migration 0005)

- Status CHECK lists widened; `submitted_at`; queue index.
- `user_roles` and `listing_status_events` (append-only: UPDATE, DELETE and TRUNCATE are refused
  by triggers). Every status change of a user listing writes one event: from, to, actor id, role
  (`owner`/`moderator`), reason, time.
- Trigger `user_listing_status_change`: the transaction must state its actor
  (`set_config('app.actor_user_id' / 'app.actor_role' / 'app.status_reason', …, true)`, see
  `setActor` in `lib/drafts/draft-store.ts`); it checks the transition, the role, ownership, the
  self-review ban and the photo requirement, then writes the event. A status change without an
  actor fails.
- Triggers `user_listing_content_frozen` and `listing_photos_editable`: listing content and
  uploaded photos can change only in `draft`/`changes_requested`.
- `user_listing_starts_as_draft`: new user listings always start as `draft`.

Concurrency: decisions lock the listing row (`SELECT … FOR UPDATE`) and require `submitted`;
of simultaneous decisions exactly one succeeds (tested with 6 parallel decisions on the real
PostgreSQL server).

## Privacy

Public reads (search, filters, map, detail pages, favorites, comparison, summaries API, covers,
comparables) use `status IN ('active','inactive')` and `data_source = 'demo'`, so no review status
appears anywhere public (tested for submitted, approved, changes_requested and rejected).

## Known limitations

- No email notifications yet (planned).
- Rate limits are per server process.
- No reviewer assignment/claiming: two moderators can open the same listing; the second decision
  is refused with a clear message.
- On phones the decision panel is below the listing (long scroll).
- No restore for archived listings.
