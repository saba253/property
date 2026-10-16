import { connection } from "next/server";
import { resolveAuthConfig } from "@/lib/auth/config";
import { MAX_PHOTO_BYTES } from "@/lib/listing-draft/draft-photos";
import {
  BodyTooLargeError,
  isSameOrigin,
  privateJson,
  readLimitedBody,
  statusFor,
} from "@/lib/photos/http";
import { photoDeps } from "@/lib/photos/instance";
import { arrangeDraftPhotos, listDraftPhotos, uploadDraftPhoto } from "@/lib/photos/photo-service";

/*
 * /api/drafts/<draftId>/photos — the signed-in owner's draft photos.
 *   GET   the photos (JSON)
 *   POST  upload one photo: the raw image bytes as the body (no multipart, no file name)
 *   PATCH reorder / choose the cover / set a description: { order?, coverId?, alt? }
 * Every request checks the session and the draft's owner in PostgreSQL; writes also require this
 * site's Origin. Errors are short codes, never paths or stack traces.
 */

type Context = RouteContext<"/api/drafts/[draftId]/photos">;

function trustedOrigins(): string[] {
  const config = resolveAuthConfig(process.env);
  return config.enabled ? [config.baseURL] : [];
}

export async function GET(_request: Request, { params }: Context) {
  await connection();
  const { draftId } = await params;
  try {
    const photos = await listDraftPhotos(photoDeps, draftId);
    if (!photos) return privateJson({ error: "not-found" }, 404);
    return privateJson({ photos });
  } catch {
    return privateJson({ error: "unavailable" }, 503);
  }
}

export async function POST(request: Request, { params }: Context) {
  await connection();
  if (!isSameOrigin(request, trustedOrigins())) return privateJson({ error: "forbidden" }, 403);
  const { draftId } = await params;
  let bytes: Uint8Array;
  try {
    bytes = await readLimitedBody(request, MAX_PHOTO_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return privateJson({ error: "too-large" }, 413);
    return privateJson({ error: "invalid" }, 400);
  }
  const result = await uploadDraftPhoto(photoDeps, draftId, bytes);
  if (!result.ok) return privateJson({ error: result.reason }, statusFor(result.reason));
  return privateJson({ photo: result.photo, photos: result.photos }, 201);
}

export async function PATCH(request: Request, { params }: Context) {
  await connection();
  if (!isSameOrigin(request, trustedOrigins())) return privateJson({ error: "forbidden" }, 403);
  const { draftId } = await params;
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder().decode(await readLimitedBody(request, 8 * 1024)));
  } catch {
    return privateJson({ error: "invalid" }, 400);
  }
  const result = await arrangeDraftPhotos(photoDeps, draftId, input);
  if (!result.ok) return privateJson({ error: result.reason }, statusFor(result.reason));
  return privateJson({ photos: result.photos });
}
