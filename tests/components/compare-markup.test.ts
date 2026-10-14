import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { COMPARE_LABELS, CompareButton } from "@/components/compare/compare-button";
import { CompareTray } from "@/components/compare/compare-tray";
import { ComparisonView } from "@/components/compare/comparison-view";
import { ListingCard } from "@/components/properties/listing-card";
import { getListingDisplayPrice } from "@/lib/pricing/display-price";
import { getDemoListingCover, getDemoListingWithProperty } from "@/lib/properties/get-demo-listing";

// Server rendering, as on the first page load: the selection is not read yet, so the markup does
// not depend on the browser's storage (no hydration mismatch).

describe("CompareButton markup", () => {
  it("is a native toggle button with a Georgian label, distinct from the heart", () => {
    const html = renderToStaticMarkup(
      createElement(CompareButton, { listingId: "demo-listing-1", title: "დემო: ბინა ვაკეში" }),
    );
    expect(html).toMatch(/^<button type="button"/);
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain(`aria-label="${COMPARE_LABELS.add}: დემო: ბინა ვაკეში"`);
    expect(html).toContain(">შედარება<");
  });
});

describe("ListingCard actions", () => {
  const item = getDemoListingWithProperty("demo-listing-2")!;
  const html = renderToStaticMarkup(
    createElement(ListingCard, {
      ...item,
      ...getDemoListingCover("demo-listing-2"),
      price: getListingDisplayPrice(item, "USD", { status: "unavailable" }),
      href: "/properties/demo-listing-2",
    }),
  );

  it("has favorite and compare buttons, both outside the link", () => {
    const link = html.slice(html.indexOf("<a "), html.indexOf("</a>"));
    expect(link).not.toContain("<button");
    const afterLink = html.slice(html.indexOf("</a>"));
    expect(afterLink.match(/<button/g)).toHaveLength(2);
    expect(afterLink).toContain(COMPARE_LABELS.add);
    expect(afterLink).toContain("რჩეულებში დამატება");
  });
});

describe("comparison UI before hydration", () => {
  it("renders no tray and a loading state instead of guessing the selection", () => {
    expect(renderToStaticMarkup(createElement(CompareTray))).toBe("");
    const view = renderToStaticMarkup(createElement(ComparisonView, { columns: [] }));
    expect(view).toContain("შედარება იტვირთება");
    expect(view).not.toContain("<table");
  });
});
