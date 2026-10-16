import { randomUUID } from "node:crypto";
import { LISTING_COLUMNS, LISTING_FROM } from "@/lib/db/listing-query";
import { type FeatureRow, type ListingRow, mapListingRow } from "@/lib/db/mappers";
import { type SqlClient, type SqlConnection, withTransaction } from "@/lib/db/sql-client";
import { findCityByName } from "@/lib/properties/cities";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import type { Currency, PropertyType, TransactionType } from "@/lib/properties/types";

/*
 * Private listing drafts in PostgreSQL. Ownership rules, enforced in every query:
 * - `ownerId` always comes from the verified server-side session (never from the browser);
 * - every read, update and archive is limited to `owner_user_id = ownerId`,
 *   `data_source = 'user'` (so demo listings can never be touched) and the expected status;
 * - a draft of another user behaves exactly like a missing one (no hint that it exists).
 * Writes run in one transaction: property, listing and characteristics are stored together or not
 * at all. Values travel only as parameters. Drafts are never public: public queries read only
 * demo, active listings, and the database forbids publishing user data (migration 0003).
 */

export type DraftSummary = {
  id: string;
  title: string;
  transactionType: TransactionType;
  propertyType: PropertyType;
  city: string;
  district: string;
  amount: number;
  currency: Currency;
  /** When the draft was last saved (recorded by the database). */
  updatedAt: string;
  /** Number of uploaded photos and the cover's id (null without photos). */
  photoCount: number;
  coverPhotoId: string | null;
};

/** Upper bound of drafts per user; a sensible limit for one person's private drafts. */
export const MAX_DRAFTS_PER_USER = 50;

export class DraftLimitError extends Error {
  constructor() {
    super("Draft limit reached");
    this.name = "DraftLimitError";
  }
}

const OWNED = "l.owner_user_id = $1 AND l.data_source = 'user'";

async function hydrate(db: SqlClient, rows: ListingRow[]): Promise<ListingWithProperty[]> {
  if (rows.length === 0) return [];
  const features = await db.query<FeatureRow>(
    "SELECT property_id AS owner_id, feature_key AS key, status FROM property_features WHERE property_id = ANY($1::text[]) ORDER BY feature_key",
    [rows.map((row) => row.property_id)],
  );
  const equipment = await db.query<FeatureRow>(
    "SELECT listing_id AS owner_id, equipment_key AS key, status FROM listing_equipment WHERE listing_id = ANY($1::text[]) ORDER BY equipment_key",
    [rows.map((row) => row.id)],
  );
  return rows.map((row) =>
    mapListingRow(
      row,
      features.rows.filter((f) => f.owner_id === row.property_id),
      equipment.rows.filter((e) => e.owner_id === row.id),
    ),
  );
}

function propertyValues(item: ListingWithProperty) {
  const { property } = item;
  const apartment = property.type === "apartment" ? property : null;
  const house = property.type === "house" ? property : null;
  const location = property.location ?? { precision: "unknown" as const };
  const citySlug = findCityByName(property.city)?.slug;
  if (!citySlug) throw new Error("Unknown city");
  return [
    property.type,
    citySlug,
    property.district,
    String(property.areaSqm),
    property.rooms ?? null,
    property.bedrooms ?? null,
    property.bathrooms ?? null,
    apartment?.floor ?? null,
    apartment?.totalFloors ?? null,
    house?.storeys ?? null,
    house?.landAreaSqm === undefined || !house ? null : String(house.landAreaSqm),
    // Area level at most (from the district); a draft never has exact coordinates.
    location.precision === "approximate" ? "approximate" : "unknown",
    location.precision === "approximate" ? location.areaId : null,
  ];
}

async function writeCharacteristics(db: SqlConnection, item: ListingWithProperty) {
  const { listing, property } = item;
  await db.query("DELETE FROM property_features WHERE property_id = $1", [property.id]);
  for (const [key, status] of Object.entries(property.features ?? {})) {
    await db.query(
      "INSERT INTO property_features (property_id, feature_key, status) VALUES ($1, $2, $3)",
      [property.id, key, status],
    );
  }
  await db.query("DELETE FROM listing_equipment WHERE listing_id = $1", [listing.id]);
  for (const [key, status] of Object.entries(listing.equipment ?? {})) {
    await db.query(
      "INSERT INTO listing_equipment (listing_id, equipment_key, status) VALUES ($1, $2, $3)",
      [listing.id, key, status],
    );
  }
}

/** Stores a new draft for `ownerId`; returns its listing id. */
export async function createDraft(
  db: SqlConnection,
  ownerId: string,
  item: ListingWithProperty,
): Promise<string> {
  const propertyId = `up-${randomUUID()}`;
  const listingId = `ul-${randomUUID()}`;
  const record: ListingWithProperty = {
    property: { ...item.property, id: propertyId, dataSource: "user" },
    listing: { ...item.listing, id: listingId, propertyId, status: "draft", dataSource: "user" },
  };
  await withTransaction(db, async () => {
    const { rows } = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM listings WHERE owner_user_id = $1 AND data_source = 'user' AND status = 'draft'",
      [ownerId],
    );
    if (rows[0].n >= MAX_DRAFTS_PER_USER) throw new DraftLimitError();
    await db.query(
      `INSERT INTO properties (id, type, city_slug, district, area_sqm, rooms, bedrooms, bathrooms,
         floor, total_floors, storeys, land_area_sqm, location_precision, location_area_id, data_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'user')`,
      [propertyId, ...propertyValues(record)],
    );
    const { listing } = record;
    await db.query(
      `INSERT INTO listings (id, property_id, title, transaction_type, rent_period, asking_amount,
         asking_currency, status, data_source, owner_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', 'user', $8)`,
      [
        listingId,
        propertyId,
        listing.title,
        listing.transactionType,
        listing.transactionType === "rent" ? listing.rentPeriod : null,
        String(listing.askingPrice.amount),
        listing.askingPrice.currency,
        ownerId,
      ],
    );
    await writeCharacteristics(db, record);
  });
  return listingId;
}

/** Replaces the content of one of the owner's drafts. False when it is not theirs or not a draft. */
export async function updateDraft(
  db: SqlConnection,
  ownerId: string,
  listingId: string,
  item: ListingWithProperty,
): Promise<boolean> {
  return withTransaction(db, async () => {
    const { rows } = await db.query<{ property_id: string }>(
      `SELECT l.property_id FROM listings l WHERE ${OWNED} AND l.id = $2 AND l.status = 'draft' FOR UPDATE`,
      [ownerId, listingId],
    );
    if (rows.length === 0) return false;
    const propertyId = rows[0].property_id;
    const record: ListingWithProperty = {
      property: { ...item.property, id: propertyId, dataSource: "user" },
      listing: { ...item.listing, id: listingId, propertyId, status: "draft", dataSource: "user" },
    };
    await db.query(
      `UPDATE properties SET type = $2, city_slug = $3, district = $4, area_sqm = $5, rooms = $6,
         bedrooms = $7, bathrooms = $8, floor = $9, total_floors = $10, storeys = $11,
         land_area_sqm = $12, location_precision = $13, location_area_id = $14, updated_at = now()
       WHERE id = $1 AND data_source = 'user'`,
      [propertyId, ...propertyValues(record)],
    );
    const { listing } = record;
    await db.query(
      `UPDATE listings SET title = $3, transaction_type = $4, rent_period = $5, asking_amount = $6,
         asking_currency = $7, updated_at = now()
       WHERE id = $2 AND owner_user_id = $1 AND data_source = 'user' AND status = 'draft'`,
      [
        ownerId,
        listingId,
        listing.title,
        listing.transactionType,
        listing.transactionType === "rent" ? listing.rentPeriod : null,
        String(listing.askingPrice.amount),
        listing.askingPrice.currency,
      ],
    );
    await writeCharacteristics(db, record);
    return true;
  });
}

/** The owner's drafts, most recently saved first (archived ones are left out). */
export async function listDrafts(db: SqlClient, ownerId: string): Promise<DraftSummary[]> {
  const { rows } = await db.query<{
    id: string;
    title: string;
    transaction_type: TransactionType;
    property_type: PropertyType;
    city: string;
    district: string;
    amount: string;
    currency: Currency;
    updated_at: string;
    photo_count: number;
    cover_photo_id: string | null;
  }>(
    `SELECT l.id, l.title, l.transaction_type, p.type AS property_type, c.name AS city, p.district,
            l.asking_amount::text AS amount, l.asking_currency AS currency,
            to_char(l.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
            (SELECT count(*)::int FROM listing_images i
              WHERE i.listing_id = l.id AND i.source_kind = 'upload') AS photo_count,
            (SELECT i.id FROM listing_images i
              WHERE i.listing_id = l.id AND i.source_kind = 'upload' AND i.is_cover) AS cover_photo_id
     ${LISTING_FROM}
     WHERE ${OWNED} AND l.status = 'draft'
     ORDER BY l.updated_at DESC, l.id
     LIMIT ${MAX_DRAFTS_PER_USER}`,
    [ownerId],
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    transactionType: row.transaction_type,
    propertyType: row.property_type,
    city: row.city,
    district: row.district,
    amount: Number(row.amount),
    currency: row.currency,
    updatedAt: row.updated_at,
    photoCount: row.photo_count,
    coverPhotoId: row.cover_photo_id,
  }));
}

/** One of the owner's drafts, or null (missing, archived, or another user's). */
export async function getDraft(
  db: SqlClient,
  ownerId: string,
  listingId: string,
): Promise<ListingWithProperty | null> {
  const { rows } = await db.query<ListingRow>(
    `SELECT ${LISTING_COLUMNS} ${LISTING_FROM} WHERE ${OWNED} AND l.id = $2 AND l.status = 'draft'`,
    [ownerId, listingId],
  );
  return (await hydrate(db, rows))[0] ?? null;
}

/** Archives (reversibly removes) one of the owner's drafts. False when it is not theirs. */
export async function archiveDraft(
  db: SqlClient,
  ownerId: string,
  listingId: string,
): Promise<boolean> {
  const { rows } = await db.query<{ id: string }>(
    `UPDATE listings l SET status = 'archived', updated_at = now()
     WHERE ${OWNED} AND l.id = $2 AND l.status = 'draft' RETURNING l.id`,
    [ownerId, listingId],
  );
  return rows.length === 1;
}
