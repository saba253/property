import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FAVORITE_LABELS, FavoriteButton } from "@/components/favorites/favorite-button";
import { FavoritesGrid } from "@/components/favorites/favorites-grid";
import { ListingCard } from "@/components/properties/listing-card";
import { getListingDisplayPrice } from "@/lib/pricing/display-price";
import { getDemoListingCover, getDemoListingWithProperty } from "@/lib/properties/get-demo-listing";

// Server rendering, as on the first page load: nothing is saved yet ("loading" snapshot), so the
// markup must not depend on the browser's storage (no hydration mismatch).

describe("FavoriteButton markup", () => {
  it("is a native toggle button with a Georgian label and pressed state", () => {
    const html = renderToStaticMarkup(
      createElement(FavoriteButton, { listingId: "demo-listing-1", title: "დემო: ბინა ვაკეში" }),
    );
    expect(html).toMatch(/^<button type="button"/);
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain(`aria-label="${FAVORITE_LABELS.add}: დემო: ბინა ვაკეში"`);
    expect(html).toContain('fill="none"'); // outline heart, not only a color change
  });

  it("shows text in the detail-page variant", () => {
    const html = renderToStaticMarkup(
      createElement(FavoriteButton, {
        listingId: "demo-listing-1",
        title: "x",
        variant: "inline",
      }),
    );
    expect(html).toContain("შენახვა");
    expect(html).toContain('aria-pressed="false"');
  });
});

describe("ListingCard with a favorite button", () => {
  const item = getDemoListingWithProperty("demo-listing-4")!;
  const html = renderToStaticMarkup(
    createElement(ListingCard, {
      ...item,
      ...getDemoListingCover("demo-listing-4"),
      price: getListingDisplayPrice(item, "USD", { status: "unavailable" }),
      href: "/properties/demo-listing-4",
    }),
  );

  it("keeps the button outside the link, so saving never navigates", () => {
    const linkStart = html.indexOf("<a ");
    const linkEnd = html.indexOf("</a>");
    const button = html.indexOf("<button");
    expect(linkStart).toBeGreaterThanOrEqual(0);
    expect(button).toBeGreaterThan(linkEnd);
    expect(html.slice(linkStart, linkEnd)).not.toContain("<button");
  });

  it("still shows the demo badge, title, price and link", () => {
    expect(html).toContain("დემო");
    expect(html).toContain(item.listing.title);
    expect(html).toContain('href="/properties/demo-listing-4"');
    expect(html).toContain("₾165,000");
  });
});

describe("FavoritesGrid", () => {
  it("renders a loading state on the server instead of guessing saved items", () => {
    const html = renderToStaticMarkup(createElement(FavoritesGrid, { cards: [] }));
    expect(html).toContain("რჩეულები იტვირთება");
    expect(html).not.toContain("<li");
  });
});
