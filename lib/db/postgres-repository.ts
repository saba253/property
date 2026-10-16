import { areaRange } from "@/lib/analytics/comparables";
import { DataBackendUnavailableError } from "@/lib/db/config";
import {
  LISTING_COLUMNS,
  LISTING_FROM,
  SqlParams,
  displayAmountSql,
  filterConditions,
  orderBySql,
  priceConditions,
} from "@/lib/db/listing-query";
import {
  type FeatureRow,
  type ImageRow,
  type ListingRow,
  mapImageRow,
  mapListingRow,
} from "@/lib/db/mappers";
import type { SqlClient } from "@/lib/db/sql-client";
import { hasPriceFilter } from "@/lib/properties/listing-filters";
import { findCityByName } from "@/lib/properties/cities";
import { getGalleryOrder, selectCoverImage } from "@/lib/properties/listing-images";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import {
  type ListingCover,
  type ListingRepository,
  type ListingSearchQuery,
  PUBLIC_LISTING_STATUSES,
  COUNT_LIMIT,
  normalizeBatchIds,
  normalizePage,
} from "@/lib/repository/listing-repository";

export type PostgresRepositoryOptions = {
  /** Data sources that may be shown. Only "demo" exists today; real data is never mixed in. */
  dataSources?: readonly string[];
  /** Called with the original error when a query fails (server-side logging). */
  onError?: (error: unknown) => void;
};

/*
 * Public image reads: only images of public listings (status and data source like every public
 * query) and never uploaded draft photos (source_kind 'upload', migration 0004). This holds even
 * if a caller passes the id of a private draft.
 */
const IMAGE_COLUMNS =
  "i.id, i.listing_id, i.sort_order, i.is_cover, i.alt, i.caption, i.source_kind, i.scene, i.src, i.width, i.height";
const PUBLIC_IMAGES = `FROM listing_images i JOIN listings l ON l.id = i.listing_id
  WHERE i.source_kind IN ('illustration', 'photo') AND l.status = ANY($1::text[])
    AND l.data_source = ANY($2::text[])`;

/**
 * ListingRepository in PostgreSQL. Filtering, sorting, counting and paging happen in the
 * database; only the requested page is loaded. Comparables are pre-selected in SQL and the final
 * rules and statistics stay in lib/analytics (shared with the memory backend).
 */
export function createPostgresRepository(
  client: SqlClient,
  { dataSources = ["demo"], onError }: PostgresRepositoryOptions = {},
): ListingRepository {
  async function query<Row extends object>(text: string, params: readonly unknown[]) {
    try {
      return (await client.query<Row>(text, params)).rows;
    } catch (error) {
      onError?.(error);
      throw new DataBackendUnavailableError(undefined, { cause: error });
    }
  }

  /** Loads characteristics for the given rows and maps them, keeping the row order. */
  async function hydrate(rows: readonly ListingRow[]): Promise<ListingWithProperty[]> {
    if (rows.length === 0) return [];
    const [features, equipment] = await Promise.all([
      query<FeatureRow>(
        "SELECT property_id AS owner_id, feature_key AS key, status FROM property_features WHERE property_id = ANY($1::text[]) ORDER BY feature_key",
        [[...new Set(rows.map((row) => row.property_id))]],
      ),
      query<FeatureRow>(
        "SELECT listing_id AS owner_id, equipment_key AS key, status FROM listing_equipment WHERE listing_id = ANY($1::text[]) ORDER BY equipment_key",
        [rows.map((row) => row.id)],
      ),
    ]);
    const group = (list: FeatureRow[]) => {
      const map = new Map<string, FeatureRow[]>();
      for (const row of list) map.set(row.owner_id, [...(map.get(row.owner_id) ?? []), row]);
      return map;
    };
    const byProperty = group(features);
    const byListing = group(equipment);
    return rows.map((row) =>
      mapListingRow(row, byProperty.get(row.property_id), byListing.get(row.id)),
    );
  }

  async function activeListings(extraWhere = "", extraParams?: SqlParams) {
    const params = extraParams ?? new SqlParams();
    const sources = params.add(dataSources);
    const rows = await query<ListingRow>(
      `SELECT ${LISTING_COLUMNS} ${LISTING_FROM}
       WHERE l.status = 'active' AND l.data_source = ANY(${sources}::text[]) ${extraWhere}
       ORDER BY l.seq`,
      params.values,
    );
    return hydrate(rows);
  }

  type CountQuery = Omit<ListingSearchQuery, "sort" | "page">;

  /** Matches counted up to COUNT_LIMIT + 1 (the query stops there instead of joining everything). */
  async function boundedTotal({ filters, display, rateState }: CountQuery) {
    const params = new SqlParams();
    const where = filterConditions(filters, dataSources, params).join(" AND ");
    const { priceOk } = priceConditions(filters, display, rateState, params);
    const [{ n }] = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM (
         SELECT 1 ${LISTING_FROM} WHERE ${where} AND ${priceOk}
         LIMIT ${params.add(COUNT_LIMIT + 1)}::int
       ) AS matches`,
      params.values,
    );
    return { total: Math.min(n, COUNT_LIMIT), totalIsExact: n <= COUNT_LIMIT };
  }

  /** Listings priced in the other currency while no rate is available (budget searches only). */
  async function notComparableCount({ filters, display, rateState }: CountQuery) {
    if (!hasPriceFilter(filters) || rateState.status === "available") return 0;
    const params = new SqlParams();
    const where = filterConditions(filters, dataSources, params).join(" AND ");
    const amount = displayAmountSql(display, rateState, params);
    const [{ n }] = await query<{ n: number }>(
      `SELECT count(*)::int AS n ${LISTING_FROM} WHERE ${where} AND ${amount} IS NULL`,
      params.values,
    );
    return n;
  }

  /** Number of original currencies among the matches (needed for a price sort without a rate). */
  async function currencyCount({ filters, display, rateState }: CountQuery) {
    const params = new SqlParams();
    const where = filterConditions(filters, dataSources, params).join(" AND ");
    const { priceOk } = priceConditions(filters, display, rateState, params);
    const [{ c }] = await query<{ c: number }>(
      `SELECT count(DISTINCT l.asking_currency)::int AS c ${LISTING_FROM} WHERE ${where} AND ${priceOk}`,
      params.values,
    );
    return c;
  }

  return {
    backend: "postgres",

    async getListingById(id) {
      const rows = await query<ListingRow>(
        `SELECT ${LISTING_COLUMNS} ${LISTING_FROM}
         WHERE l.id = $1 AND l.status = ANY($2::text[]) AND l.data_source = ANY($3::text[])`,
        [id, PUBLIC_LISTING_STATUSES, dataSources],
      );
      return (await hydrate(rows))[0] ?? null;
    },

    async getListingsByIds(ids) {
      const wanted = normalizeBatchIds(ids);
      if (wanted.length === 0) return [];
      const rows = await query<ListingRow>(
        `SELECT ${LISTING_COLUMNS} ${LISTING_FROM}
         WHERE l.id = ANY($1::text[]) AND l.status = ANY($2::text[]) AND l.data_source = ANY($3::text[])`,
        [wanted, PUBLIC_LISTING_STATUSES, dataSources],
      );
      const byId = new Map((await hydrate(rows)).map((item) => [item.listing.id, item]));
      return wanted
        .map((id) => byId.get(id))
        .filter((item): item is ListingWithProperty => item !== undefined);
    },

    async getListingIds() {
      const rows = await query<{ id: string }>(
        `SELECT id FROM listings WHERE status = ANY($1::text[]) AND data_source = ANY($2::text[]) ORDER BY seq`,
        [PUBLIC_LISTING_STATUSES, dataSources],
      );
      return rows.map((row) => row.id);
    },

    getActiveListings: () => activeListings(),

    async getSearchFacets() {
      const rows = await query<{ city: string; district: string; sale: number; rent: number }>(
        `SELECT c.name AS city, p.district,
                count(*) FILTER (WHERE l.transaction_type = 'sale')::int AS sale,
                count(*) FILTER (WHERE l.transaction_type = 'rent')::int AS rent
         ${LISTING_FROM}
         WHERE l.status = 'active' AND l.data_source = ANY($1::text[])
         GROUP BY c.name, p.district ORDER BY min(l.seq)`,
        [dataSources],
      );
      return {
        cityNames: [...new Set(rows.map((row) => row.city))],
        districts: rows.map((row) => ({ name: row.district, city: row.city })),
        totals: {
          sale: rows.reduce((sum, row) => sum + row.sale, 0),
          rent: rows.reduce((sum, row) => sum + row.rent, 0),
        },
      };
    },

    async countListings(search) {
      const [total, notComparable] = await Promise.all([
        boundedTotal(search),
        notComparableCount(search),
      ]);
      return { ...total, notComparableCount: notComparable };
    },

    async searchListings(search) {
      const page = normalizePage(search.page);
      // The currency mix matters only for a price sort without an exchange rate.
      const priceSort = search.sort !== "default" && !search.sort.startsWith("area_");
      const currencies =
        priceSort && search.rateState.status !== "available" ? await currencyCount(search) : 1;
      const params = new SqlParams();
      const where = filterConditions(search.filters, dataSources, params).join(" AND ");
      const { priceOk } = priceConditions(search.filters, search.display, search.rateState, params);
      const order = orderBySql(search.sort, search.rateState, currencies, params);
      // One extra row tells whether a next page exists.
      const rows = await query<ListingRow>(
        `SELECT ${LISTING_COLUMNS} ${LISTING_FROM}
         WHERE ${where} AND ${priceOk}
         ORDER BY ${order ?? "l.seq ASC"}
         LIMIT ${params.add(page.limit + 1)}::int OFFSET ${params.add(page.offset)}::int`,
        params.values,
      );
      const hasNextPage = rows.length > page.limit;
      // A page that is not full and not past the end already gives the exact total; only larger
      // result sets (or a page past the end) need the bounded count query.
      const known = !hasNextPage && (rows.length > 0 || page.offset === 0);
      const [counted, notComparable] = await Promise.all([
        known ? { total: page.offset + rows.length, totalIsExact: true } : boundedTotal(search),
        notComparableCount(search),
      ]);
      return {
        items: await hydrate(rows.slice(0, page.limit)),
        total: Math.min(counted.total, COUNT_LIMIT),
        totalIsExact: counted.totalIsExact && counted.total <= COUNT_LIMIT,
        notComparableCount: notComparable,
        page,
        hasNextPage,
        sortApplied: order === null ? "default" : search.sort,
        sortNotice: order === null ? "rate-unavailable" : null,
      };
    },

    async getListingImages(listingId) {
      const rows = await query<ImageRow>(
        `SELECT ${IMAGE_COLUMNS} ${PUBLIC_IMAGES} AND i.listing_id = $3 ORDER BY i.sort_order, i.id`,
        [PUBLIC_LISTING_STATUSES, dataSources, listingId],
      );
      return getGalleryOrder(rows.map(mapImageRow));
    },

    async getListingCovers(listingIds) {
      const rows = await query<ImageRow>(
        `SELECT ${IMAGE_COLUMNS} ${PUBLIC_IMAGES} AND i.listing_id = ANY($3::text[])
         ORDER BY i.sort_order, i.id`,
        [PUBLIC_LISTING_STATUSES, dataSources, normalizeBatchIds(listingIds)],
      );
      const covers: Record<string, ListingCover> = {};
      for (const id of listingIds) {
        const images = rows.filter((row) => row.listing_id === id).map(mapImageRow);
        covers[id] = { coverImage: selectCoverImage(images), imageCount: images.length };
      }
      return covers;
    },

    async findComparableCandidates(subject) {
      const { listing, property } = subject;
      const { min, max } = areaRange(property.areaSqm);
      // Same city by name, as in selectComparables; an unknown city has no stored listings.
      const citySlug = findCityByName(property.city.trim())?.slug;
      if (!citySlug) return [];
      const params = new SqlParams();
      const conditions = [
        `l.transaction_type = ${params.add(listing.transactionType)}`,
        listing.transactionType === "rent"
          ? `l.rent_period = ${params.add(listing.rentPeriod)}`
          : "l.rent_period IS NULL",
        `p.type = ${params.add(property.type)}`,
        `p.city_slug = ${params.add(citySlug)}`,
        // The numeric range (slightly wider) lets PostgreSQL use properties_city_type_area; the
        // float8 comparison then applies exactly the JavaScript rule (isWithinAreaRange).
        `p.area_sqm BETWEEN ${params.add(String(Math.floor(min * 100) / 100 - 0.01))}::numeric AND ${params.add(String(Math.ceil(max * 100) / 100 + 0.01))}::numeric`,
        `p.area_sqm::float8 BETWEEN ${params.add(min)}::float8 AND ${params.add(max)}::float8`,
        `l.id <> ${params.add(listing.id)}`,
        `l.property_id <> ${params.add(listing.propertyId)}`,
      ];
      return activeListings(`AND ${conditions.join(" AND ")}`, params);
    },
  };
}
