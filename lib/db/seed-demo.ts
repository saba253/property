import { type SqlConnection, withTransaction } from "@/lib/db/sql-client";
import { AMENITIES } from "@/lib/properties/amenities";
import { findCityByName } from "@/lib/properties/cities";
import type { Listing, ListingImage, Property } from "@/lib/properties/types";
import {
  validateListingImages,
  validateListingRecord,
  validatePropertyRecord,
} from "@/lib/properties/validate-record";
import { DEMO_DATASET, type MemoryDataset } from "@/lib/repository/memory-repository";

/*
 * DEVELOPMENT ONLY: copies the invented demo dataset into a local database, so the PostgreSQL
 * backend can be tried. Every row has data_source = 'demo' and keeps its stable demo id.
 * Re-running is safe: rows are inserted or updated in place (in data order, so the default order
 * stays the same) and characteristics/images of demo listings are replaced. A row with the same
 * id that is NOT demo data is never touched; the seed stops instead. No accounts, no sales
 * history, no published dates are created. The script refuses non-local databases.
 */

export type SeedSummary = { properties: number; listings: number; images: number };

/** Validates every demo record with the same rules as the database. Throws on the first issue. */
export function assertValidDataset(dataset: MemoryDataset): void {
  const problems = [
    ...dataset.properties.flatMap((p) =>
      validatePropertyRecord(p).map((i) => `${p.id}.${i.field}: ${i.message}`),
    ),
    ...dataset.listings.flatMap((l) =>
      validateListingRecord(l).map((i) => `${l.id}.${i.field}: ${i.message}`),
    ),
    ...validateListingImages(dataset.images).map((i) => `${i.field}: ${i.message}`),
    // The demo seed writes demo data only (user drafts are created through the app).
    ...dataset.properties
      .filter((p) => p.dataSource !== "demo")
      .map((p) => `${p.id}: not demo data`),
    ...dataset.listings.filter((l) => l.dataSource !== "demo").map((l) => `${l.id}: not demo data`),
  ];
  if (problems.length > 0) throw new Error(`Invalid demo data:\n${problems.join("\n")}`);
}

const FEATURE_KEYS = new Set(
  AMENITIES.filter((a) => a.group === "property" && !a.derived).map((a) => a.key),
);

async function upsertProperty(db: SqlConnection, property: Property) {
  const location = property.location ?? { precision: "unknown" as const };
  const apartment = property.type === "apartment" ? property : null;
  const house = property.type === "house" ? property : null;
  const { rows } = await db.query<{ data_source: string }>(
    `INSERT INTO properties (id, type, city_slug, district, area_sqm, rooms, bedrooms, bathrooms,
       floor, total_floors, storeys, land_area_sqm, location_precision, location_area_id,
       latitude, longitude, location_verified_on, data_source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'demo')
     ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type, city_slug = EXCLUDED.city_slug,
       district = EXCLUDED.district, area_sqm = EXCLUDED.area_sqm, rooms = EXCLUDED.rooms,
       bedrooms = EXCLUDED.bedrooms, bathrooms = EXCLUDED.bathrooms, floor = EXCLUDED.floor,
       total_floors = EXCLUDED.total_floors, storeys = EXCLUDED.storeys,
       land_area_sqm = EXCLUDED.land_area_sqm, location_precision = EXCLUDED.location_precision,
       location_area_id = EXCLUDED.location_area_id, latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude, location_verified_on = EXCLUDED.location_verified_on,
       updated_at = now()
     WHERE properties.data_source = 'demo'
     RETURNING data_source`,
    [
      property.id,
      property.type,
      findCityByName(property.city)!.slug,
      property.district,
      String(property.areaSqm),
      property.rooms ?? null,
      property.bedrooms ?? null,
      property.bathrooms ?? null,
      apartment?.floor ?? null,
      apartment?.totalFloors ?? null,
      house?.storeys ?? null,
      house?.landAreaSqm === undefined || house === null ? null : String(house.landAreaSqm),
      location.precision,
      location.precision === "approximate" ? location.areaId : null,
      location.precision === "exact" ? String(location.point.lat) : null,
      location.precision === "exact" ? String(location.point.lng) : null,
      location.precision === "exact" ? location.verifiedOn : null,
    ],
  );
  if (rows.length === 0)
    throw new Error(`${property.id} exists and is not demo data; seed stopped.`);
  await db.query("DELETE FROM property_features WHERE property_id = $1", [property.id]);
  for (const [key, status] of Object.entries(property.features ?? {})) {
    if (!FEATURE_KEYS.has(key as never)) throw new Error(`Unknown feature ${key}`);
    await db.query(
      "INSERT INTO property_features (property_id, feature_key, status) VALUES ($1, $2, $3)",
      [property.id, key, status],
    );
  }
}

async function upsertListing(db: SqlConnection, listing: Listing) {
  const { rows } = await db.query(
    `INSERT INTO listings (id, property_id, title, transaction_type, rent_period, asking_amount,
       asking_currency, status, data_source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'demo')
     ON CONFLICT (id) DO UPDATE SET property_id = EXCLUDED.property_id, title = EXCLUDED.title,
       transaction_type = EXCLUDED.transaction_type, rent_period = EXCLUDED.rent_period,
       asking_amount = EXCLUDED.asking_amount, asking_currency = EXCLUDED.asking_currency,
       status = EXCLUDED.status, updated_at = now()
     WHERE listings.data_source = 'demo'
     RETURNING id`,
    [
      listing.id,
      listing.propertyId,
      listing.title,
      listing.transactionType,
      listing.transactionType === "rent" ? listing.rentPeriod : null,
      String(listing.askingPrice.amount),
      listing.askingPrice.currency,
      listing.status,
    ],
  );
  if (rows.length === 0)
    throw new Error(`${listing.id} exists and is not demo data; seed stopped.`);
  await db.query("DELETE FROM listing_equipment WHERE listing_id = $1", [listing.id]);
  for (const [key, status] of Object.entries(listing.equipment ?? {})) {
    await db.query(
      "INSERT INTO listing_equipment (listing_id, equipment_key, status) VALUES ($1, $2, $3)",
      [listing.id, key, status],
    );
  }
}

async function replaceImages(db: SqlConnection, listingId: string, images: ListingImage[]) {
  await db.query("DELETE FROM listing_images WHERE listing_id = $1", [listingId]);
  for (const image of images) {
    const photo = image.source.kind === "photo" ? image.source : null;
    await db.query(
      `INSERT INTO listing_images (id, listing_id, sort_order, is_cover, alt, caption, source_kind,
         scene, src, width, height)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        image.id,
        image.listingId,
        image.order,
        image.isCover === true,
        image.alt,
        image.caption ?? null,
        image.source.kind,
        image.source.kind === "illustration" ? image.source.scene : null,
        photo?.src ?? null,
        photo?.width ?? null,
        photo?.height ?? null,
      ],
    );
  }
}

/** Inserts or updates the demo dataset in one transaction. */
export async function seedDemoData(
  db: SqlConnection,
  dataset: MemoryDataset = DEMO_DATASET,
): Promise<SeedSummary> {
  assertValidDataset(dataset);
  return withTransaction(db, async () => {
    for (const property of dataset.properties) await upsertProperty(db, property);
    for (const listing of dataset.listings) {
      await upsertListing(db, listing);
      await replaceImages(
        db,
        listing.id,
        dataset.images.filter((image) => image.listingId === listing.id),
      );
    }
    return {
      properties: dataset.properties.length,
      listings: dataset.listings.length,
      images: dataset.images.length,
    };
  });
}
