import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FeaturedCarousel } from "@/components/home/featured-carousel";
import { ListingCard } from "@/components/properties/listing-card";
import { getListingDisplayPrice } from "@/lib/pricing/display-price";
import { createMemoryRepository } from "@/lib/repository/memory-repository";

describe("featured carousel markup", () => {
  it("is a labelled region with arrow buttons, a focusable track and no autoplay", () => {
    const html = renderToStaticMarkup(
      createElement(
        FeaturedCarousel,
        { label: "გამორჩეული განცხადებები თბილისში", count: 3 },
        createElement("li", null, "a"),
      ),
    );
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-roledescription="კარუსელი"');
    expect(html).toContain('aria-label="წინა განცხადებები"');
    expect(html).toContain('aria-label="შემდეგი განცხადებები"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="წინა განცხადებები"/);
    expect(html).toContain('tabindex="0"');
    expect(html).not.toMatch(/autoplay|setInterval/i);
  });

  it("shows a clear sale/rent badge, monthly rent and the demo label on cards", async () => {
    const repository = createMemoryRepository();
    const items = await repository.getActiveListings();
    const rent = items.find((item) => item.listing.transactionType === "rent")!;
    const sale = items.find((item) => item.listing.transactionType === "sale")!;
    const card = (item: typeof rent) =>
      renderToStaticMarkup(
        createElement(ListingCard, {
          ...item,
          price: getListingDisplayPrice(item, "USD", { status: "unavailable" }),
          href: `/properties/${item.listing.id}`,
          coverImage: null,
          imageCount: 0,
          titleAs: "h3",
          transactionBadge: true,
        }),
      );
    const rentHtml = card(rent);
    expect(rentHtml).toContain(">ქირავდება</span>");
    expect(rentHtml).toContain("/ თვე");
    expect(rentHtml).toContain("<h3");
    expect(rentHtml).not.toContain("<h2");
    expect(rentHtml).toMatch(/დემო/);
    expect(card(sale)).toContain(">იყიდება</span>");
    expect(card(sale)).not.toContain("/ თვე");
  });
});
