import {
  MAX_LOOKUP_BODY_BYTES,
  buildLookupResponse,
  parseLookupBody,
} from "@/lib/api/listing-lookup";
import { clientKey, createRateLimiter } from "@/lib/api/rate-limit";
import { getListingCoversUncached, getListingsByIds } from "@/lib/data/listings";

/*
 * POST /api/listings/summaries  {"ids": ["demo-listing-1", ...]}
 * Read-only lookup of public, active listings for the comparison tray (titles, links, transaction
 * type, cover). Validated input, bounded size, at most 100 ids, a simple per-process rate limit,
 * no caching of visitor-chosen id sets, and generic errors (details only in the server log).
 */

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });
const NO_STORE = { "Cache-Control": "no-store" };

const error = (status: number, code: string, headers: Record<string, string> = {}) =>
  Response.json({ error: code }, { status, headers: { ...NO_STORE, ...headers } });

export async function POST(request: Request) {
  const { allowed, retryAfterSeconds } = limiter.check(clientKey(request.headers));
  if (!allowed) return error(429, "rate-limited", { "Retry-After": String(retryAfterSeconds) });

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return error(415, "json-required");
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_LOOKUP_BODY_BYTES) return error(413, "too-large");

  const parsed = parseLookupBody(await request.text());
  if (!parsed.ok) return error(parsed.error === "too-large" ? 413 : 400, parsed.error);

  try {
    const found = await getListingsByIds(parsed.ids);
    const covers = await getListingCoversUncached(found.map((item) => item.listing.id));
    return Response.json(buildLookupResponse(parsed.ids, found, covers), { headers: NO_STORE });
  } catch (cause) {
    console.error("[api/listings/summaries] lookup failed:", cause);
    return error(503, "unavailable");
  }
}
