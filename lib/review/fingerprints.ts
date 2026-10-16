import { createHash } from "node:crypto";
import type { ListingDraft } from "@/lib/listing-draft/draft";
import type { StoredPhoto } from "@/lib/photos/photo-store";
import { CHANGE_FIELDS, type ChangeField } from "@/lib/review/changes";

/*
 * Change tracking between submissions without keeping copies of the listing. At every
 * submission each form field is reduced to a fingerprint: SHA-256 of (listing id, field name,
 * normalized value), shortened to 32 hex characters. Comparing the fingerprints of two
 * submissions tells which fields changed, never what they were. No image bytes are involved:
 * photos are compared by their ids, order, cover and descriptions.
 *
 * Note: a fingerprint of a low-variety value (currency, a room count) can be guessed by trying
 * values. These are fields of the listing itself, which the database keeps anyway; no personal
 * data (name, email, phone) is part of a listing.
 */

export type Fingerprints = Record<ChangeField, string>;

function sortedObject(value: Record<string, unknown>): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1))),
  );
}

/** The normalized value of every compared field. */
export function comparableFields(
  draft: ListingDraft,
  photos: readonly StoredPhoto[],
): Record<ChangeField, string> {
  const ordered = [...photos].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
  return {
    transactionType: draft.transactionType ?? "",
    propertyType: draft.propertyType ?? "",
    citySlug: draft.citySlug,
    district: draft.district.trim(),
    areaSqm: draft.areaSqm.trim(),
    rooms: draft.rooms.trim(),
    bedrooms: draft.bedrooms.trim(),
    bathrooms: draft.bathrooms.trim(),
    floor: draft.floor.trim(),
    totalFloors: draft.totalFloors.trim(),
    storeys: draft.storeys.trim(),
    landAreaSqm: draft.landAreaSqm.trim(),
    amenities: sortedObject(draft.amenities),
    price: draft.price.trim(),
    currency: draft.currency,
    title: draft.title.trim(),
    photos: JSON.stringify(ordered.map((photo) => photo.id).sort()),
    photoOrder: JSON.stringify(ordered.map((photo) => [photo.id, photo.isCover])),
    photoDescriptions: JSON.stringify(ordered.map((photo) => photo.alt ?? "")),
  };
}

export function fingerprint(listingId: string, fields: Record<ChangeField, string>): Fingerprints {
  const result = {} as Fingerprints;
  for (const field of CHANGE_FIELDS) {
    result[field] = createHash("sha256")
      .update(`${listingId}\u0000${field}\u0000${fields[field]}`)
      .digest("hex")
      .slice(0, 32);
  }
  return result;
}

/** Fields whose fingerprints differ (a field missing on either side counts as changed). */
export function changedFields(
  previous: Partial<Fingerprints>,
  current: Fingerprints,
): ChangeField[] {
  return CHANGE_FIELDS.filter((field) => previous[field] !== current[field]);
}
