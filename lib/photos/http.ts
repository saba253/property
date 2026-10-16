/*
 * Request helpers for the photo routes (plain Web APIs, testable without Next.js).
 */

/**
 * True when the request comes from this site. Browsers send Origin on every POST, PATCH and
 * DELETE; a missing or foreign Origin is refused. This is the routes' CSRF protection, on top of
 * the SameSite=Lax session cookie (Server Actions have the same check built in).
 */
export function isSameOrigin(request: Request, allowedOrigins: readonly string[] = []): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const own = new URL(request.url).origin;
  return origin === own || allowedOrigins.includes(origin);
}

export class BodyTooLargeError extends Error {
  constructor() {
    super("Request body too large");
    this.name = "BodyTooLargeError";
  }
}

/**
 * Reads the request body, but never more than `limit` bytes: a declared Content-Length above the
 * limit is refused before reading, and the stream is cancelled as soon as it passes the limit
 * (a missing or false Content-Length cannot be used to send more).
 */
export async function readLimitedBody(request: Request, limit: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) throw new BodyTooLargeError();
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** JSON response that is never cached and never sniffed. */
export function privateJson(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}

/** HTTP status for a service failure reason. */
export function statusFor(reason: string): number {
  switch (reason) {
    case "unauthenticated":
      return 401;
    case "not-found":
      return 404;
    case "rate-limited":
      return 429;
    case "too-large":
      return 413;
    case "limit":
      return 409;
    case "unavailable":
      return 503;
    default:
      return 400;
  }
}
