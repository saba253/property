import { type RateLimiter, createRateLimiter } from "@/lib/api/rate-limit";
import type { DraftDeps } from "@/lib/drafts/draft-service";
import { isDraftId } from "@/lib/drafts/draft-service";
import { MAX_PHOTO_ALT_LENGTH } from "@/lib/listing-draft/draft";
import {
  type Arrangement,
  PhotoLimitError,
  type StoredPhoto,
  arrangePhotos,
  canAddPhoto,
  deletePhoto,
  findPhotoFile,
  insertPhoto,
  isPhotoId,
  listPhotos,
} from "@/lib/photos/photo-store";
import { type PhotoView, photoUrl } from "@/lib/photos/photo-types";
import { type ImageRejection, processUpload } from "@/lib/photos/process-image";
import { type PhotoStorage, isStorageKey, newStorageKey } from "@/lib/photos/storage";

/*
 * Photo operations for the signed-in owner of a draft (no Next.js imports, so tests run it
 * against PGlite or a PostgreSQL server with a temporary folder as storage).
 *
 * Consistency between the files and the database:
 * - upload: process -> store the file under a new random key -> insert the row (locked, counted).
 *   If the insert fails or is refused, the file is deleted again. If the process dies in between,
 *   an unreferenced file remains: it is unreachable (files are served only through a database
 *   row) and `npm run photos:orphans` lists and, on request, removes such files.
 * - delete: the row is removed in a transaction first, the file after the commit. A failed file
 *   deletion leaves an unreachable orphan for the same script; the photo is gone either way.
 * Results are generic: another user's draft or photo looks exactly like a missing one.
 */

export type PhotoDeps = DraftDeps & {
  storage: PhotoStorage;
  /** Per-user request limits; the process-wide defaults when omitted. */
  limiters?: { upload: RateLimiter; change: RateLimiter };
};
export type { PhotoView };

type Failure<R extends string> = { ok: false; reason: R };
type Common = "unauthenticated" | "not-found" | "rate-limited" | "unavailable";

export type UploadResult =
  { ok: true; photo: PhotoView; photos: PhotoView[] } | Failure<Common | "limit" | ImageRejection>;
export type ChangeResult = { ok: true; photos: PhotoView[] } | Failure<Common | "invalid">;

// Per process (like the draft limiter); enough to stop a runaway script on a development box.
const defaultLimiters = {
  upload: createRateLimiter({ limit: 40, windowMs: 10 * 60_000 }),
  change: createRateLimiter({ limit: 200, windowMs: 10 * 60_000 }),
};

function toView(draftId: string, photo: StoredPhoto): PhotoView {
  return {
    id: photo.id,
    order: photo.order,
    isCover: photo.isCover,
    alt: photo.alt ?? "",
    width: photo.width,
    height: photo.height,
    byteSize: photo.byteSize,
    url: photoUrl(draftId, photo.id),
  };
}

const views = (draftId: string, photos: StoredPhoto[]) => photos.map((p) => toView(draftId, p));

function logFailure(operation: string, error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  console.error(
    `[photos] ${operation} failed:`,
    typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)
      ? `SQLSTATE ${code}`
      : error instanceof Error
        ? error.constructor.name
        : "unknown error",
  );
}

async function userFor(
  deps: PhotoDeps,
  draftId: unknown,
  kind: "upload" | "change",
): Promise<
  { error: "unauthenticated" | "rate-limited" | "not-found" } | { userId: string; draftId: string }
> {
  const userId = await deps.currentUserId();
  if (!userId) return { error: "unauthenticated" as const };
  const limiter = (deps.limiters ?? defaultLimiters)[kind];
  if (!limiter.check(`photos:${userId}`).allowed) return { error: "rate-limited" as const };
  if (!isDraftId(draftId)) return { error: "not-found" as const };
  return { userId, draftId };
}

export async function listDraftPhotos(
  deps: PhotoDeps,
  draftId: unknown,
): Promise<PhotoView[] | null> {
  const userId = await deps.currentUserId();
  if (!userId || !isDraftId(draftId)) return null;
  const photos = await deps.withConnection((db) => listPhotos(db, userId, draftId));
  return photos ? views(draftId, photos) : null;
}

export async function uploadDraftPhoto(
  deps: PhotoDeps,
  draftId: unknown,
  bytes: Uint8Array,
): Promise<UploadResult> {
  const user = await userFor(deps, draftId, "upload");
  if ("error" in user) return { ok: false, reason: user.error };
  try {
    // Fail fast before spending time on decoding (checked again under the lock).
    const allowed = await deps.withConnection((db) => canAddPhoto(db, user.userId, user.draftId));
    if (allowed !== "ok") return { ok: false, reason: allowed };
  } catch (error) {
    logFailure("upload check", error);
    return { ok: false, reason: "unavailable" };
  }

  const processed = await processUpload(bytes);
  if (!processed.ok) return { ok: false, reason: processed.reason };
  const { image } = processed;

  const storageKey = newStorageKey();
  try {
    await deps.storage.put(storageKey, image.data);
  } catch (error) {
    logFailure("storing a photo", error);
    return { ok: false, reason: "unavailable" };
  }
  const removeFile = () =>
    deps.storage.delete(storageKey).catch((cleanup) => logFailure("cleanup", cleanup));
  let photo: StoredPhoto | null;
  try {
    photo = await deps.withConnection((db) =>
      insertPhoto(db, user.userId, user.draftId, {
        storageKey,
        width: image.width,
        height: image.height,
        byteSize: image.data.length,
      }),
    );
  } catch (error) {
    // Nothing was recorded (the transaction rolled back): remove the file again.
    await removeFile();
    if (error instanceof PhotoLimitError) return { ok: false, reason: "limit" };
    logFailure("upload", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!photo) {
    await removeFile();
    return { ok: false, reason: "not-found" };
  }
  // The row is committed from here on: the file must stay, whatever happens next.
  let photos: StoredPhoto[] = [photo];
  try {
    photos = (await deps.withConnection((db) => listPhotos(db, user.userId, user.draftId))) ?? [
      photo,
    ];
  } catch (error) {
    logFailure("listing after upload", error);
  }
  return { ok: true, photo: toView(user.draftId, photo), photos: views(user.draftId, photos) };
}

/** Parses the browser's arrangement request; null when it is malformed. */
export function parseArrangement(input: unknown): Arrangement | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const { order, coverId, alt } = input as Record<string, unknown>;
  const result: Arrangement = {};
  if (order !== undefined) {
    if (!Array.isArray(order) || order.length > 10 || !order.every(isPhotoId)) return null;
    result.order = order;
  }
  if (coverId !== undefined) {
    if (!isPhotoId(coverId)) return null;
    result.coverId = coverId;
  }
  if (alt !== undefined) {
    if (!alt || typeof alt !== "object") return null;
    const { id, text } = alt as Record<string, unknown>;
    if (!isPhotoId(id) || typeof text !== "string" || text.length > MAX_PHOTO_ALT_LENGTH) {
      return null;
    }
    result.alt = { id, text: text.replace(/[\u0000-\u001f\u007f]/g, " ") };
  }
  return Object.keys(result).length > 0 ? result : null;
}

export async function arrangeDraftPhotos(
  deps: PhotoDeps,
  draftId: unknown,
  input: unknown,
): Promise<ChangeResult> {
  const user = await userFor(deps, draftId, "change");
  if ("error" in user) return { ok: false, reason: user.error };
  const change = parseArrangement(input);
  if (!change) return { ok: false, reason: "invalid" };
  try {
    const result = await deps.withConnection((db) =>
      arrangePhotos(db, user.userId, user.draftId, change),
    );
    if (result === null) return { ok: false, reason: "not-found" };
    if (result === "invalid") return { ok: false, reason: "invalid" };
    return { ok: true, photos: views(user.draftId, result) };
  } catch (error) {
    logFailure("arrange", error);
    return { ok: false, reason: "unavailable" };
  }
}

export async function deleteDraftPhoto(
  deps: PhotoDeps,
  draftId: unknown,
  photoId: unknown,
): Promise<ChangeResult> {
  const user = await userFor(deps, draftId, "change");
  if ("error" in user) return { ok: false, reason: user.error };
  if (!isPhotoId(photoId)) return { ok: false, reason: "not-found" };
  let removed: Awaited<ReturnType<typeof deletePhoto>>;
  try {
    removed = await deps.withConnection((db) =>
      deletePhoto(db, user.userId, user.draftId, photoId),
    );
  } catch (error) {
    logFailure("delete", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!removed) return { ok: false, reason: "not-found" };
  // After the commit; a failure here only leaves an unreachable orphan file.
  await deps.storage.delete(removed.storageKey).catch((error) => logFailure("file removal", error));
  return { ok: true, photos: views(user.draftId, removed.photos) };
}

/** The image bytes for the owner, or null (anyone else, missing, archived draft, bad ids). */
export async function readDraftPhoto(
  deps: PhotoDeps,
  draftId: unknown,
  photoId: unknown,
): Promise<{ data: Buffer; mimeType: string } | null> {
  const userId = await deps.currentUserId();
  if (!userId || !isDraftId(draftId) || !isPhotoId(photoId)) return null;
  const file = await deps.withConnection((db) => findPhotoFile(db, userId, draftId, photoId));
  if (!file || !isStorageKey(file.storageKey)) return null;
  const data = await deps.storage.get(file.storageKey);
  return data ? { data, mimeType: file.mimeType } : null;
}
