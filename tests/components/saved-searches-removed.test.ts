import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "@/components/site/site-header";
import nextConfig from "@/next.config";
import { COMPARE_STORAGE_KEY, parseStoredComparison } from "@/lib/compare/compare-selection";
import { FAVORITES_STORAGE_KEY, parseStoredFavorites } from "@/lib/favorites/favorites";
import { getCitiesPresentIn, getDistrictsPresentIn } from "@/lib/properties/cities";
import { buildListingsHref } from "@/lib/properties/filter-chips";
import { getActiveDemoListingsWithProperties } from "@/lib/properties/get-demo-listing";
import { filterListings, parseListingFilters } from "@/lib/properties/listing-filters";
import { parseSort, sortListings } from "@/lib/properties/listing-sort";
import { parseSearchQuery } from "@/lib/search/parse-search-query";

// Saved searches (Step 1.17) were removed on purpose; ordinary search, favorites and comparison
// must keep working, and nothing may link to the removed feature.

const root = join(__dirname, "..", "..");
const items = getActiveDemoListingsWithProperties();
const properties = items.map((item) => item.property);
const knownDistricts = getDistrictsPresentIn(properties);
const rate = { status: "unavailable" as const };

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) ? [path] : [];
  });
}

describe("removed saved searches", () => {
  it("has no header or menu link and no save action in the source", () => {
    const header = renderToStaticMarkup(createElement(SiteHeader));
    expect(header).not.toContain("/saved-searches");
    expect(header).not.toContain("შენახული ძიებები");
    for (const file of ["app", "components", "lib"].flatMap((dir) =>
      sourceFiles(join(root, dir)),
    )) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toContain("ძიების შენახვა");
      expect(text, file).not.toContain("saved-searches");
      expect(text, file).not.toContain("შენახული ძიებები");
    }
    expect(existsSync(join(root, "app", "saved-searches"))).toBe(false);
  });

  it("sends the old /saved-searches address to the ordinary search (temporary redirect)", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toContainEqual({
      source: "/saved-searches",
      destination: "/properties",
      permanent: false,
    });
  });

  it("keeps the menu entries that still exist", () => {
    const header = renderToStaticMarkup(createElement(SiteHeader));
    for (const href of ["/properties", "/favorites", "/compare", "/properties/new"]) {
      expect(header).toContain(`href="${href}"`);
    }
  });
});

describe("ordinary search after the removal", () => {
  const search = (query: Record<string, string | string[]>) => {
    const { filters, display } = parseListingFilters(query, { knownDistricts });
    return filterListings(items, filters, display, rate).matches;
  };

  it("still opens a formerly saved search URL as a normal search", () => {
    const query = Object.fromEntries(
      new URLSearchParams("transaction=rent&city=tbilisi&amenity=furniture&sort=price_asc"),
    );
    const parsed = parseListingFilters(query, { knownDistricts });
    expect(parsed.issues).toEqual([]);
    const ids = search(query).map((item) => item.listing.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(buildListingsHref(parsed.filters, parsed.display, "list", parseSort(query).sort)).toBe(
      "/properties?sort=price_asc&transaction=rent&city=tbilisi&amenity=furniture",
    );
  });

  it("filters by city and district and sorts", () => {
    const vake = search({ city: "tbilisi", district: "ვაკე" });
    expect(vake.length).toBeGreaterThan(0);
    expect(vake.every((item) => item.property.district === "ვაკე")).toBe(true);
    const sorted = sortListings(search({}), "area_asc", rate).items;
    const areas = sorted.map((item) => item.property.areaSqm);
    expect(areas).toEqual([...areas].sort((a, b) => a - b));
  });

  it("recognizes cities and districts in the homepage text search", () => {
    const context = {
      cities: getCitiesPresentIn(properties.map((property) => property.city)),
      districts: knownDistricts,
      defaultCurrency: "USD" as const,
    };
    expect(parseSearchQuery("ბინა ვაკეში", context).params).toMatchObject({
      type: "apartment",
      district: "ვაკე",
    });
    expect(parseSearchQuery("ბათუმი", context).params).toMatchObject({ city: "batumi" });
  });

  it("leaves favorites and comparison storage formats untouched", () => {
    expect(FAVORITES_STORAGE_KEY).toBe("property-intelligence:favorites:v1");
    expect(COMPARE_STORAGE_KEY).toBe("property-intelligence:compare:v1");
    expect(parseStoredFavorites(JSON.stringify({ version: 1, ids: ["demo-listing-1"] }))).toEqual([
      "demo-listing-1",
    ]);
    expect(
      parseStoredComparison(
        JSON.stringify({ version: 1, ids: ["demo-listing-1", "demo-listing-3"] }),
      ),
    ).toEqual(["demo-listing-1", "demo-listing-3"]);
  });
});
