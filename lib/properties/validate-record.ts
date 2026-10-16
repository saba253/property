import {
  DETAIL_FIELDS,
  MAX_DISTRICT_LENGTH,
  MAX_TITLE_LENGTH,
  PRICE_LIMITS,
} from "@/lib/listing-draft/draft";
import { findCityByName } from "@/lib/properties/cities";
import type { Listing, ListingImage, Property } from "@/lib/properties/types";

/*
 * Server-side validation of stored records (properties, listings, images). It enforces the same
 * rules as the database CHECK constraints in db/migrations/0001_initial_schema.sql and reuses the
 * listing form's limits, so TypeScript and SQL agree. Used before writing to the database (today:
 * the development demo seed) and in tests; it never depends on client-side form validation.
 */

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/;

export type RecordIssue = { field: string; message: string };

const isInteger = (value: number) => Number.isInteger(value);
/** At most two decimal places, like NUMERIC(…, 2). */
const hasAtMostTwoDecimals = (value: number) =>
  Number.isFinite(value) && Math.abs(Math.round(value * 100) - value * 100) < 1e-6;

function checkRange(
  issues: RecordIssue[],
  field: string,
  value: number | undefined,
  { min, max, integer }: { min: number; max: number; integer: boolean },
) {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < min || value > max) {
    issues.push({ field, message: `must be between ${min} and ${max}` });
  } else if (integer ? !isInteger(value) : !hasAtMostTwoDecimals(value)) {
    issues.push({ field, message: integer ? "must be a whole number" : "max. 2 decimals" });
  }
}

export function validatePropertyRecord(property: Property): RecordIssue[] {
  const issues: RecordIssue[] = [];
  if (!ID_PATTERN.test(property.id)) issues.push({ field: "id", message: "invalid id" });
  if (!findCityByName(property.city)) issues.push({ field: "city", message: "unknown city" });
  const district = property.district;
  if (
    district !== district.trim() ||
    district.length < 1 ||
    district.length > MAX_DISTRICT_LENGTH
  ) {
    issues.push({ field: "district", message: "1-50 characters, no outer spaces" });
  }
  for (const spec of DETAIL_FIELDS) {
    const value = (property as unknown as Partial<Record<string, number>>)[spec.field];
    if (spec.appliesTo && !spec.appliesTo.includes(property.type)) {
      if (value !== undefined) issues.push({ field: spec.field, message: "not for this type" });
      continue;
    }
    checkRange(issues, spec.field, value, spec);
  }
  if (property.areaSqm === undefined) issues.push({ field: "areaSqm", message: "required" });
  const { rooms, bedrooms } = property;
  if (rooms !== undefined && bedrooms !== undefined && bedrooms > rooms) {
    issues.push({ field: "bedrooms", message: "more bedrooms than rooms" });
  }
  if (property.type === "apartment") {
    const { floor, totalFloors } = property;
    if (floor !== undefined && totalFloors !== undefined && floor > totalFloors) {
      issues.push({ field: "floor", message: "above the building's floors" });
    }
  }
  const location = property.location ?? { precision: "unknown" as const };
  if (location.precision === "approximate" && !ID_PATTERN.test(location.areaId)) {
    issues.push({ field: "location", message: "invalid area id" });
  }
  if (location.precision === "exact") {
    const { lat, lng } = location.point;
    if (
      !(Math.abs(lat) <= 90 && Math.abs(lng) <= 180) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(location.verifiedOn)
    ) {
      issues.push({ field: "location", message: "invalid exact location" });
    }
  }
  if (property.dataSource !== "demo" && property.dataSource !== "user") {
    issues.push({ field: "dataSource", message: "only demo or user records can be stored" });
  }
  return issues;
}

export function validateListingRecord(listing: Listing): RecordIssue[] {
  const issues: RecordIssue[] = [];
  if (!ID_PATTERN.test(listing.id)) issues.push({ field: "id", message: "invalid id" });
  if (!ID_PATTERN.test(listing.propertyId)) {
    issues.push({ field: "propertyId", message: "invalid id" });
  }
  const title = listing.title;
  if (title !== title.trim() || title.length < 1 || title.length > MAX_TITLE_LENGTH) {
    issues.push({ field: "title", message: "1-80 characters, no outer spaces" });
  }
  const { amount, currency } = listing.askingPrice;
  const limits = PRICE_LIMITS[listing.transactionType];
  if (!Number.isFinite(amount) || amount < limits.min || amount > limits.max) {
    issues.push({
      field: "askingPrice",
      message: `must be between ${limits.min} and ${limits.max}`,
    });
  } else if (!hasAtMostTwoDecimals(amount)) {
    issues.push({ field: "askingPrice", message: "max. 2 decimals" });
  }
  if (currency !== "USD" && currency !== "GEL") {
    issues.push({ field: "currency", message: "USD or GEL" });
  }
  if (listing.transactionType === "rent" && listing.rentPeriod !== "month") {
    issues.push({ field: "rentPeriod", message: "monthly rent only" });
  }
  if (listing.dataSource !== "demo" && listing.dataSource !== "user") {
    issues.push({ field: "dataSource", message: "only demo or user records can be stored" });
  }
  // Same rules as the database: user data is never public; review statuses are user data.
  const isPublicStatus = listing.status === "active" || listing.status === "inactive";
  if (listing.dataSource === "user" && isPublicStatus) {
    issues.push({ field: "status", message: "user listings cannot be published yet" });
  }
  if (!isPublicStatus && listing.dataSource !== "user") {
    issues.push({ field: "status", message: "only user listings can be drafts" });
  }
  return issues;
}

export function validateListingImages(images: readonly ListingImage[]): RecordIssue[] {
  const issues: RecordIssue[] = [];
  const orders = new Set<string>();
  const covers = new Set<string>();
  for (const image of images) {
    const orderKey = `${image.listingId}\u0000${image.order}`;
    if (!Number.isInteger(image.order) || image.order < 0 || orders.has(orderKey)) {
      issues.push({ field: `${image.id}.order`, message: "unique whole number from 0" });
    }
    orders.add(orderKey);
    if (image.isCover) {
      if (covers.has(image.listingId)) {
        issues.push({ field: `${image.id}.isCover`, message: "one cover per listing" });
      }
      covers.add(image.listingId);
    }
    if (image.alt.trim().length < 1 || image.alt.length > 300) {
      issues.push({ field: `${image.id}.alt`, message: "1-300 characters" });
    }
  }
  return issues;
}
