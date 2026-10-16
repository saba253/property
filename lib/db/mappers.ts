import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import type {
  AmenityStatus,
  Currency,
  IllustrationScene,
  Listing,
  ListingEquipmentKey,
  ListingImage,
  ListingStatus,
  Property,
  PropertyFeatureKey,
  PropertyLocation,
} from "@/lib/properties/types";

/*
 * Database rows to domain objects. NUMERIC columns are selected as text and converted here, the
 * single numeric boundary: amounts and areas keep their exact decimal value in the database and
 * become JavaScript numbers (doubles) only for display and calculations, which round at the end.
 * NULL becomes a missing property (unknown), never 0.
 */

export type ListingRow = {
  id: string;
  property_id: string;
  title: string;
  transaction_type: "sale" | "rent";
  rent_period: "month" | null;
  asking_amount: string;
  asking_currency: Currency;
  status: ListingStatus;
  data_source: "demo" | "user";
  property_type: "apartment" | "house";
  city: string;
  district: string;
  area_sqm: string;
  rooms: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  total_floors: number | null;
  storeys: number | null;
  land_area_sqm: string | null;
  location_precision: "exact" | "approximate" | "unknown";
  location_area_id: string | null;
  latitude: string | null;
  longitude: string | null;
  location_verified_on: string | null;
  property_data_source: "demo" | "user";
};

export type FeatureRow = { owner_id: string; key: string; status: AmenityStatus };

export type ImageRow = {
  id: string;
  listing_id: string;
  sort_order: number;
  is_cover: boolean;
  alt: string;
  caption: string | null;
  source_kind: "illustration" | "photo";
  scene: IllustrationScene | null;
  src: string | null;
  width: number | null;
  height: number | null;
};

/** Exact decimal text ("150000.00") to a number; throws on anything that is not a decimal. */
export function decimalToNumber(text: string): number {
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new Error(`Not a decimal: ${text}`);
  return Number(text);
}

const optional = <T>(value: T | null): T | undefined => (value === null ? undefined : value);
const optionalDecimal = (text: string | null) =>
  text === null ? undefined : decimalToNumber(text);

function mapLocation(row: ListingRow): PropertyLocation {
  switch (row.location_precision) {
    case "exact":
      return {
        precision: "exact",
        point: { lat: decimalToNumber(row.latitude!), lng: decimalToNumber(row.longitude!) },
        verifiedOn: row.location_verified_on!,
      };
    case "approximate":
      return { precision: "approximate", areaId: row.location_area_id! };
    case "unknown":
      return { precision: "unknown" };
  }
}

function toStatusRecord<K extends string>(rows: readonly FeatureRow[] | undefined) {
  if (!rows || rows.length === 0) return undefined;
  return Object.fromEntries(rows.map((row) => [row.key, row.status])) as Partial<
    Record<K, AmenityStatus>
  >;
}

/** Drops undefined values, so mapped objects equal the hand-written demo objects. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export function mapListingRow(
  row: ListingRow,
  features: readonly FeatureRow[] | undefined,
  equipment: readonly FeatureRow[] | undefined,
): ListingWithProperty {
  const base = {
    id: row.property_id,
    city: row.city,
    district: row.district,
    areaSqm: decimalToNumber(row.area_sqm),
    location: mapLocation(row),
    features: toStatusRecord<PropertyFeatureKey>(features),
    dataSource: row.property_data_source,
    rooms: optional(row.rooms),
    bedrooms: optional(row.bedrooms),
    bathrooms: optional(row.bathrooms),
  };
  const property: Property =
    row.property_type === "apartment"
      ? compact({
          ...base,
          type: "apartment",
          floor: optional(row.floor),
          totalFloors: optional(row.total_floors),
        })
      : compact({
          ...base,
          type: "house",
          storeys: optional(row.storeys),
          landAreaSqm: optionalDecimal(row.land_area_sqm),
        });

  const listingBase = {
    id: row.id,
    propertyId: row.property_id,
    title: row.title,
    askingPrice: { amount: decimalToNumber(row.asking_amount), currency: row.asking_currency },
    status: row.status,
    equipment: toStatusRecord<ListingEquipmentKey>(equipment),
    dataSource: row.data_source,
  };
  const listing: Listing =
    row.transaction_type === "rent"
      ? compact({ ...listingBase, transactionType: "rent", rentPeriod: row.rent_period ?? "month" })
      : compact({ ...listingBase, transactionType: "sale" });

  return { listing, property };
}

export function mapImageRow(row: ImageRow): ListingImage {
  return compact({
    id: row.id,
    listingId: row.listing_id,
    order: row.sort_order,
    isCover: row.is_cover ? true : undefined,
    alt: row.alt,
    caption: optional(row.caption),
    source:
      row.source_kind === "illustration"
        ? { kind: "illustration" as const, scene: row.scene! }
        : compact({
            kind: "photo" as const,
            src: row.src!,
            width: optional(row.width),
            height: optional(row.height),
          }),
  });
}
