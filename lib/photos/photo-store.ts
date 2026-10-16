import { randomUUID } from "node:crypto";
import { MAX_DRAFT_PHOTOS } from "@/lib/listing-draft/draft-photos";
import { type SqlClient, type SqlConnection, withTransaction } from "@/lib/db/sql-client";

/*
 * Draft photo metadata in PostgreSQL (listing_images rows with source_kind = 'upload', migration
 * 0004). Every statement is limited to a listing that belongs to `ownerId` (taken from the
 * verified session by the caller) and is user data; another user's draft behaves like a missing
 * one. Changes need an editable status (draft, changes requested; migration 0005); the owner can
 * read photos in every other status except archived, and moderators can read the photos of
 * submitted listings. Changes run in a transaction that first locks the draft row (SELECT ... FOR
 * UPDATE), so concurrent uploads, reorders and deletions of one draft happen one after another:
 * the 10-photo limit, the single cover and the gap-free order cannot be broken by races.
 */

export type StoredPhoto = {
  id: string;
  order: number;
  isCover: boolean;
  alt: string | null;
  width: number;
  height: number;
  byteSize: number;
};

type PhotoRow = {
  id: string;
  sort_order: number;
  is_cover: boolean;
  alt: string | null;
  width: number;
  height: number;
  byte_size: number;
};

const PHOTO_COLUMNS = "i.id, i.sort_order, i.is_cover, i.alt, i.width, i.height, i.byte_size";
/** The owner's listing in a status that allows changes. */
const DRAFT_OWNED =
  "l.id = $2 AND l.owner_user_id = $1 AND l.data_source = 'user' AND l.status IN ('draft', 'changes_requested')";
/** The owner's listing in any status except archived (reading). */
const OWNED_READABLE =
  "l.id = $2 AND l.owner_user_id = $1 AND l.data_source = 'user' AND l.status <> 'archived'";
const PHOTO_ID = /^ph-[0-9a-f-]{36}$/;

export function isPhotoId(value: unknown): value is string {
  return typeof value === "string" && PHOTO_ID.test(value);
}

export class PhotoLimitError extends Error {
  constructor() {
    super("Photo limit reached");
    this.name = "PhotoLimitError";
  }
}

const toPhoto = (row: PhotoRow): StoredPhoto => ({
  id: row.id,
  order: row.sort_order,
  isCover: row.is_cover,
  alt: row.alt,
  width: row.width,
  height: row.height,
  byteSize: row.byte_size,
});

/** Locks the owner's draft row for this transaction; false when it is not theirs or not a draft. */
async function lockDraft(db: SqlClient, ownerId: string, listingId: string): Promise<boolean> {
  const { rows } = await db.query(`SELECT l.id FROM listings l WHERE ${DRAFT_OWNED} FOR UPDATE`, [
    ownerId,
    listingId,
  ]);
  return rows.length === 1;
}

/** All uploaded photos of a listing in order; callers check who may see them. */
export async function photosOf(db: SqlClient, listingId: string): Promise<StoredPhoto[]> {
  const { rows } = await db.query<PhotoRow>(
    `SELECT ${PHOTO_COLUMNS} FROM listing_images i
     WHERE i.listing_id = $1 AND i.source_kind = 'upload' ORDER BY i.sort_order, i.id`,
    [listingId],
  );
  return rows.map(toPhoto);
}

/** Writes 0..n-1 in the given order (two steps, because (listing_id, sort_order) is unique). */
async function writeOrder(db: SqlClient, listingId: string, ids: readonly string[]) {
  await db.query(
    "UPDATE listing_images SET sort_order = sort_order + 1000 WHERE listing_id = $1 AND source_kind = 'upload'",
    [listingId],
  );
  for (const [index, id] of ids.entries()) {
    await db.query("UPDATE listing_images SET sort_order = $3 WHERE listing_id = $1 AND id = $2", [
      listingId,
      id,
      index,
    ]);
  }
}

async function touchDraft(db: SqlClient, listingId: string) {
  await db.query("UPDATE listings SET updated_at = now() WHERE id = $1", [listingId]);
}

/** The owner's photos in order, or null when the listing is not theirs (or archived). */
export async function listPhotos(
  db: SqlClient,
  ownerId: string,
  listingId: string,
): Promise<StoredPhoto[] | null> {
  const { rows } = await db.query(`SELECT l.id FROM listings l WHERE ${OWNED_READABLE}`, [
    ownerId,
    listingId,
  ]);
  return rows.length === 1 ? photosOf(db, listingId) : null;
}

/** Cheap check before processing an upload: "ok", "not-found" (or not editable) or "limit". */
export async function canAddPhoto(
  db: SqlClient,
  ownerId: string,
  listingId: string,
): Promise<"ok" | "not-found" | "limit"> {
  const { rows } = await db.query(`SELECT l.id FROM listings l WHERE ${DRAFT_OWNED}`, [
    ownerId,
    listingId,
  ]);
  if (rows.length === 0) return "not-found";
  return (await photosOf(db, listingId)).length >= MAX_DRAFT_PHOTOS ? "limit" : "ok";
}

/**
 * Records an already stored file as the next photo of the owner's draft (the first one becomes
 * the cover). Null when the draft is not theirs; PhotoLimitError when it already has 10 photos.
 */
export async function insertPhoto(
  db: SqlConnection,
  ownerId: string,
  listingId: string,
  file: { storageKey: string; width: number; height: number; byteSize: number },
): Promise<StoredPhoto | null> {
  return withTransaction(db, async () => {
    if (!(await lockDraft(db, ownerId, listingId))) return null;
    const existing = await photosOf(db, listingId);
    if (existing.length >= MAX_DRAFT_PHOTOS) throw new PhotoLimitError();
    const id = `ph-${randomUUID()}`;
    const { rows } = await db.query<PhotoRow>(
      `INSERT INTO listing_images (id, listing_id, sort_order, is_cover, alt, source_kind,
         storage_key, mime_type, byte_size, width, height)
       VALUES ($1, $2, $3, $4, NULL, 'upload', $5, 'image/webp', $6, $7, $8)
       RETURNING id, sort_order, is_cover, alt, width, height, byte_size`,
      [
        id,
        listingId,
        existing.length,
        existing.length === 0,
        file.storageKey,
        file.byteSize,
        file.width,
        file.height,
      ],
    );
    await touchDraft(db, listingId);
    return toPhoto(rows[0]);
  });
}

export type Arrangement = {
  /** All of the draft's photo ids, each exactly once, in the new order. */
  order?: readonly string[];
  /** The new cover (one of the draft's photos). */
  coverId?: string;
  /** A new description for one photo (empty text removes it). */
  alt?: { id: string; text: string };
};

/**
 * Applies an arrangement to the owner's draft. Null when the draft is not theirs; "invalid" when
 * an id is not one of the draft's photos (foreign ids are never written).
 */
export async function arrangePhotos(
  db: SqlConnection,
  ownerId: string,
  listingId: string,
  change: Arrangement,
): Promise<StoredPhoto[] | null | "invalid"> {
  return withTransaction(db, async () => {
    if (!(await lockDraft(db, ownerId, listingId))) return null;
    const photos = await photosOf(db, listingId);
    const own = new Set(photos.map((photo) => photo.id));
    // Everything is validated before anything is written: an invalid part changes nothing.
    const order = change.order;
    if (
      (order &&
        (order.length !== photos.length ||
          new Set(order).size !== order.length ||
          !order.every((id) => own.has(id)))) ||
      (change.coverId !== undefined && !own.has(change.coverId)) ||
      (change.alt && !own.has(change.alt.id))
    ) {
      return "invalid";
    }
    if (order) await writeOrder(db, listingId, order);
    if (change.coverId !== undefined) {
      // Clear first: at most one cover may exist at any moment (unique index).
      await db.query("UPDATE listing_images SET is_cover = false WHERE listing_id = $1", [
        listingId,
      ]);
      await db.query(
        "UPDATE listing_images SET is_cover = true WHERE listing_id = $1 AND id = $2",
        [listingId, change.coverId],
      );
    }
    if (change.alt) {
      await db.query("UPDATE listing_images SET alt = $3 WHERE listing_id = $1 AND id = $2", [
        listingId,
        change.alt.id,
        change.alt.text.trim() || null,
      ]);
    }
    await touchDraft(db, listingId);
    return photosOf(db, listingId);
  });
}

/**
 * Removes one photo's row from the owner's draft and returns its storage key (the caller deletes
 * the file after the commit). When it was the cover, the first remaining photo becomes the cover;
 * the order is closed up. Null when the draft or the photo is not theirs.
 */
export async function deletePhoto(
  db: SqlConnection,
  ownerId: string,
  listingId: string,
  photoId: string,
): Promise<{ storageKey: string; photos: StoredPhoto[] } | null> {
  return withTransaction(db, async () => {
    if (!(await lockDraft(db, ownerId, listingId))) return null;
    const { rows } = await db.query<{ storage_key: string; is_cover: boolean }>(
      `DELETE FROM listing_images WHERE listing_id = $1 AND id = $2 AND source_kind = 'upload'
       RETURNING storage_key, is_cover`,
      [listingId, photoId],
    );
    if (rows.length === 0) return null;
    const remaining = await photosOf(db, listingId);
    await writeOrder(
      db,
      listingId,
      remaining.map((photo) => photo.id),
    );
    if (rows[0].is_cover && remaining.length > 0) {
      await db.query(
        "UPDATE listing_images SET is_cover = true WHERE listing_id = $1 AND id = $2",
        [listingId, remaining[0].id],
      );
    }
    await touchDraft(db, listingId);
    return { storageKey: rows[0].storage_key, photos: await photosOf(db, listingId) };
  });
}

/**
 * The storage key of one photo, or null. Readable by the listing's owner in every status except
 * archived, and by a moderator (user_roles) while the listing is submitted for review.
 */
export async function findPhotoFile(
  db: SqlClient,
  viewerId: string,
  listingId: string,
  photoId: string,
): Promise<{ storageKey: string; mimeType: string } | null> {
  const { rows } = await db.query<{ storage_key: string; mime_type: string }>(
    `SELECT i.storage_key, i.mime_type FROM listing_images i JOIN listings l ON l.id = i.listing_id
     WHERE l.id = $2 AND l.data_source = 'user' AND i.id = $3 AND i.source_kind = 'upload'
       AND ((l.owner_user_id = $1 AND l.status <> 'archived')
         OR (l.status = 'submitted' AND EXISTS (
           SELECT 1 FROM user_roles r WHERE r.user_id = $1 AND r.role = 'moderator')))`,
    [viewerId, listingId, photoId],
  );
  return rows[0] ? { storageKey: rows[0].storage_key, mimeType: rows[0].mime_type } : null;
}

/** Every storage key the database refers to (archived drafts included), for orphan checks. */
export async function listAllStorageKeys(db: SqlClient): Promise<Set<string>> {
  const { rows } = await db.query<{ storage_key: string }>(
    "SELECT storage_key FROM listing_images WHERE storage_key IS NOT NULL",
  );
  return new Set(rows.map((row) => row.storage_key));
}
