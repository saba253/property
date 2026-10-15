import { isValidListingId } from "@/lib/favorites/favorites";
import { buildListingDetailHref } from "@/lib/properties/filter-chips";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import type { ListingImage, TransactionType } from "@/lib/properties/types";
import { MAX_BATCH_IDS } from "@/lib/repository/listing-repository";

/*
 * Input and output of the read-only listing lookup (POST /api/listings/summaries), used by the
 * comparison tray to show the few listings selected in this browser without sending the whole
 * catalog to every page. Only public, active listing data is returned; nothing is written.
 */

/** Requests larger than this are refused before parsing (100 ids fit easily). */
export const MAX_LOOKUP_BODY_BYTES = 8 * 1024;

export type LookupRequest = { ids: string[] };
export type LookupParseResult = { ok: true; ids: string[] } | { ok: false; error: string };

/** Validates `{"ids": [...]}`: 1–MAX_BATCH_IDS valid listing ids (duplicates are merged). */
export function parseLookupBody(text: string): LookupParseResult {
  if (text.length > MAX_LOOKUP_BODY_BYTES) return { ok: false, error: "too-large" };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "invalid-json" };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, error: "invalid-body" };
  }
  const { ids } = data as { ids?: unknown };
  if (!Array.isArray(ids) || ids.length === 0) return { ok: false, error: "invalid-ids" };
  if (!ids.every(isValidListingId)) return { ok: false, error: "invalid-ids" };
  const distinct = [...new Set(ids as string[])];
  if (distinct.length > MAX_BATCH_IDS) return { ok: false, error: "too-many-ids" };
  return { ok: true, ids: distinct };
}

/** What the tray needs about one listing. Public fields only. */
export type ListingSummary = {
  id: string;
  title: string;
  href: string;
  transactionType: TransactionType;
  coverImage: ListingImage | null;
};

export type LookupResponse = {
  /** Active listings, in the requested order. */
  listings: ListingSummary[];
  /** Requested ids that do not exist, are not public or are no longer active. */
  missing: string[];
};

export function buildLookupResponse(
  requested: readonly string[],
  found: readonly ListingWithProperty[],
  covers: Readonly<Record<string, { coverImage: ListingImage | null }>>,
): LookupResponse {
  const active = found.filter((item) => item.listing.status === "active");
  const activeIds = new Set(active.map((item) => item.listing.id));
  return {
    listings: active.map(({ listing }) => ({
      id: listing.id,
      title: listing.title,
      href: buildListingDetailHref(listing.id),
      transactionType: listing.transactionType,
      coverImage: covers[listing.id]?.coverImage ?? null,
    })),
    missing: requested.filter((id) => !activeIds.has(id)),
  };
}

/**
 * Ids carried in a page URL (`?ids=a,b,c`) by the favorites and comparison pages: valid listing
 * ids only, distinct, at most `max`. Anything else is ignored. Browser storage stays the source
 * of truth; the URL only tells the server which listings to render.
 */
export function parseIdsParam(raw: string | string[] | undefined, max: number): string[] {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || value.length > max * 120) return [];
  return [
    ...new Set(
      value
        .split(",")
        .map((id) => id.trim())
        .filter(isValidListingId),
    ),
  ].slice(0, max);
}
