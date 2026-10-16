import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ListingCard } from "@/components/properties/listing-card";
import { getListingDisplayPrice } from "@/lib/pricing/display-price";
import { formatDisplayPricePerSqm } from "@/lib/pricing/format-display-price";
import { sortForTransaction, sortOptionsFor } from "@/lib/properties/listing-sort";
import { createMemoryRepository } from "@/lib/repository/memory-repository";

// Product decision: rentals never show a price per m² (cards, carousel, map, comparison, detail
// page, sorting); sales keep it. Area and monthly rent stay visible.

const unavailable = { status: "unavailable" } as const;

async function listings() {
  const items = await createMemoryRepository().getActiveListings();
  return {
    rent: items.filter((item) => item.listing.transactionType === "rent"),
    sale: items.filter((item) => item.listing.transactionType === "sale"),
  };
}

function cardHtml(item: Awaited<ReturnType<typeof listings>>["rent"][number]) {
  return renderToStaticMarkup(
    createElement(ListingCard, {
      ...item,
      // In the listing's own currency, so no exchange rate is needed.
      price: getListingDisplayPrice(item, item.listing.askingPrice.currency, unavailable),
      href: `/properties/${item.listing.id}`,
      coverImage: null,
      imageCount: 0,
    }),
  );
}

describe("price per m² for rentals and sales", () => {
  it("hides it on every rental card but keeps the area and the monthly rent", async () => {
    const { rent } = await listings();
    expect(rent.length).toBeGreaterThan(0);
    for (const item of rent) {
      const html = cardHtml(item);
      expect(html, item.listing.id).not.toContain("ფასი მ²-ზე");
      expect(html, item.listing.id).not.toMatch(/\/ მ² \/ თვე|\/ მ²</);
      expect(html, item.listing.id).toContain(" მ²");
      expect(html, item.listing.id).toMatch(/[$₾][\d,]+ \/ თვე/);
      expect(formatDisplayPricePerSqm(getListingDisplayPrice(item, "GEL", unavailable))).toBeNull();
    }
  });

  it("keeps it on every sale card", async () => {
    const { sale } = await listings();
    for (const item of sale) {
      const html = cardHtml(item);
      expect(html, item.listing.id).toContain("ფასი მ²-ზე");
      expect(html, item.listing.id).toMatch(/\/ მ²/);
      expect(html, item.listing.id).not.toContain("/ თვე");
    }
  });

  it("offers no price-per-m² sorting for rentals, only for sales", () => {
    const rentValues = sortOptionsFor("rent").map((o) => o.value);
    expect(rentValues.some((v) => v.startsWith("price_per_sqm"))).toBe(false);
    expect(rentValues).toContain("price_asc");
    expect(sortOptionsFor("sale").map((o) => o.value)).toContain("price_per_sqm_asc");
    expect(sortForTransaction("price_per_sqm_desc", "rent")).toBe("default");
    expect(sortForTransaction("price_per_sqm_desc", "sale")).toBe("price_per_sqm_desc");
    expect(sortForTransaction("area_asc", "rent")).toBe("area_asc");
  });
});

describe("map entries", () => {
  it("carry no price per m² for rentals and keep it for sales", async () => {
    const { toMapListing } = await import("@/lib/map/map-listings");
    const { rent, sale } = await listings();
    const entry = (item: (typeof rent)[number]) =>
      toMapListing(item, {
        price: getListingDisplayPrice(item, "USD", unavailable),
        href: "/x",
        coverImage: null,
        imageCount: 0,
      });
    expect(entry(rent[0]).pricePerSqmText).toBeNull();
    expect(entry(sale[0]).pricePerSqmText).toMatch(/\/ მ²$/);
  });
});
