import { findCityByName } from "@/lib/properties/cities";
import {
  DETAIL_FIELDS,
  type EditableAmenityKey,
  type ListingDraft,
  MAX_DISTRICT_LENGTH,
  MAX_TITLE_LENGTH,
  buildDraftListing,
  createEmptyDraft,
  getEditableAmenities,
  validateDraft,
} from "@/lib/listing-draft/draft";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import { isPropertyType, isTransactionType } from "@/lib/properties/listing-types";
import type { AmenityStatus } from "@/lib/properties/types";
import { validateListingRecord, validatePropertyRecord } from "@/lib/properties/validate-record";

/*
 * Turning what the browser sends into a stored draft, and back. Nothing from the browser is
 * trusted: only known fields are read (no owner, status, id or data source can be submitted),
 * text is length-limited, and the result passes the form's validation AND the database record
 * rules before it is written. Photos are not part of a stored draft (uploads come later).
 */

const AMENITY_STATUSES = new Set<AmenityStatus>(["yes", "no", "unknown"]);
const MAX_FIELD_LENGTH = 40;

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.slice(0, max) : "";

/** A ListingDraft from untrusted JSON, or null when it is not an object. */
export function parseDraftInput(value: unknown): ListingDraft | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const draft = createEmptyDraft();
  if (typeof input.transactionType === "string" && isTransactionType(input.transactionType)) {
    draft.transactionType = input.transactionType;
  }
  if (typeof input.propertyType === "string" && isPropertyType(input.propertyType)) {
    draft.propertyType = input.propertyType;
  }
  draft.citySlug = text(input.citySlug, MAX_FIELD_LENGTH);
  draft.district = text(input.district, MAX_DISTRICT_LENGTH + 10);
  for (const { field } of DETAIL_FIELDS) draft[field] = text(input[field], MAX_FIELD_LENGTH);
  draft.price = text(input.price, MAX_FIELD_LENGTH);
  draft.currency = input.currency === "GEL" ? "GEL" : "USD";
  draft.title = text(input.title, MAX_TITLE_LENGTH + 10);
  if (typeof input.amenities === "object" && input.amenities !== null && draft.propertyType) {
    const allowed = new Set(getEditableAmenities(draft.propertyType).map((a) => a.key));
    for (const [key, status] of Object.entries(input.amenities as Record<string, unknown>)) {
      if (allowed.has(key as EditableAmenityKey) && AMENITY_STATUSES.has(status as AmenityStatus)) {
        draft.amenities[key as EditableAmenityKey] = status as AmenityStatus;
      }
    }
  }
  return draft;
}

export type DraftRecordResult =
  { ok: true; item: ListingWithProperty } | { ok: false; fields: string[] };

/**
 * The property + listing to store for a draft (ids, owner and timestamps are added by the
 * store). Uses the form's own builder, then the database record rules, so both layers agree.
 */
export function draftToRecords(draft: ListingDraft): DraftRecordResult {
  const errors = validateDraft(draft);
  if (Object.keys(errors).length > 0) return { ok: false, fields: Object.keys(errors) };
  const built = buildDraftListing(draft);
  if (!built) return { ok: false, fields: ["draft"] };
  const property = { ...built.property, id: "pending-property", dataSource: "user" as const };
  const listing = {
    ...built.listing,
    id: "pending-listing",
    propertyId: "pending-property",
    status: "draft" as const,
    dataSource: "user" as const,
  };
  const issues = [...validatePropertyRecord(property), ...validateListingRecord(listing)];
  if (issues.length > 0) return { ok: false, fields: issues.map((issue) => issue.field) };
  return { ok: true, item: { property, listing } };
}

const numberText = (value: number | undefined) => (value === undefined ? "" : String(value));

/** The form state for a stored draft, so it can be reopened and edited. */
export function recordsToDraft({ listing, property }: ListingWithProperty): ListingDraft {
  const draft = createEmptyDraft();
  draft.transactionType = listing.transactionType;
  draft.propertyType = property.type;
  draft.citySlug = findCityByName(property.city)?.slug ?? "";
  draft.district = property.district;
  draft.areaSqm = numberText(property.areaSqm);
  draft.rooms = numberText(property.rooms);
  draft.bedrooms = numberText(property.bedrooms);
  draft.bathrooms = numberText(property.bathrooms);
  if (property.type === "apartment") {
    draft.floor = numberText(property.floor);
    draft.totalFloors = numberText(property.totalFloors);
  } else {
    draft.storeys = numberText(property.storeys);
    draft.landAreaSqm = numberText(property.landAreaSqm);
  }
  draft.price = numberText(listing.askingPrice.amount);
  draft.currency = listing.askingPrice.currency;
  draft.title = listing.title;
  draft.amenities = { ...(property.features ?? {}), ...(listing.equipment ?? {}) };
  return draft;
}
