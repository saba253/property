import { connection } from "next/server";
import { resolveAuthConfig } from "@/lib/auth/config";
import { isSameOrigin, privateJson, statusFor } from "@/lib/photos/http";
import { photoDeps } from "@/lib/photos/instance";
import { deleteDraftPhoto, readDraftPhoto } from "@/lib/photos/photo-service";

/*
 * /api/drafts/<draftId>/photos/<photoId>
 *   GET    the processed image, only for the draft's owner (everyone else: 404, also for a
 *          copied or guessed URL); private, never cached by shared caches
 *   DELETE remove the photo (owner only, same-site Origin required)
 */

type Context = RouteContext<"/api/drafts/[draftId]/photos/[photoId]">;

export async function GET(_request: Request, { params }: Context) {
  await connection();
  const { draftId, photoId } = await params;
  let file: Awaited<ReturnType<typeof readDraftPhoto>>;
  try {
    file = await readDraftPhoto(photoDeps, draftId, photoId);
  } catch {
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!file) {
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain" },
    });
  }
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.data.length),
      "Cache-Control": "private, no-store",
      "Content-Disposition": 'inline; filename="photo.webp"',
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      Vary: "Cookie",
    },
  });
}

export async function DELETE(request: Request, { params }: Context) {
  await connection();
  const config = resolveAuthConfig(process.env);
  if (!isSameOrigin(request, config.enabled ? [config.baseURL] : [])) {
    return privateJson({ error: "forbidden" }, 403);
  }
  const { draftId, photoId } = await params;
  const result = await deleteDraftPhoto(photoDeps, draftId, photoId);
  if (!result.ok) return privateJson({ error: result.reason }, statusFor(result.reason));
  return privateJson({ photos: result.photos });
}
