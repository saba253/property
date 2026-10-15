import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureSummaries, readSummaries } from "@/components/compare/compare-state";
import { Pagination } from "@/components/properties/pagination";
import { buildComparePageHref, buildFavoritesPageHref } from "@/lib/compare/selection-urls";
import { splitRequestedFavorites } from "@/lib/favorites/favorites";
import { buildListingsHref } from "@/lib/properties/filter-chips";

const hrefFor = (page: number) =>
  buildListingsHref({ transaction: "rent" }, "GEL", "map", "price_asc", page);

describe("Pagination", () => {
  it("renders plain links with Georgian labels and the current page", () => {
    const html = renderToStaticMarkup(
      createElement(Pagination, { page: 2, lastPage: 5, hasNextPage: true, hrefFor }),
    );
    expect(html).toContain('aria-label="შედეგების გვერდები"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('rel="prev"');
    expect(html).toContain('rel="next"');
    expect(html).toContain("გვერდი 2 / 5");
    // Links keep every other setting.
    expect(html).toContain(
      'href="/properties?display=GEL&amp;view=map&amp;sort=price_asc&amp;transaction=rent&amp;page=3"',
    );
    expect(html).toContain(
      'href="/properties?display=GEL&amp;view=map&amp;sort=price_asc&amp;transaction=rent"',
    );
  });

  it("is absent for a single page and has no next link on the last page", () => {
    expect(
      renderToStaticMarkup(
        createElement(Pagination, { page: 1, lastPage: 1, hasNextPage: false, hrefFor }),
      ),
    ).toBe("");
    const last = renderToStaticMarkup(
      createElement(Pagination, { page: 5, lastPage: 5, hasNextPage: false, hrefFor }),
    );
    expect(last).not.toContain('rel="next"');
  });

  it("does not invent a last page when the total is only a lower bound", () => {
    const html = renderToStaticMarkup(
      createElement(Pagination, { page: 3, lastPage: null, hasNextPage: true, hrefFor }),
    );
    expect(html).toContain("გვერდი 3<");
    expect(html).not.toContain("გვერდი 3 /");
    expect(html).toContain('rel="next"');
  });
});

describe("favorites and comparison pages", () => {
  it("split saved ids into shown, missing (looked up, not found) and pending", () => {
    expect(splitRequestedFavorites(["a", "b", "c", "d"], ["a", "b", "c"], ["a", "c"])).toEqual({
      available: ["c", "a"],
      missing: ["b"],
      pending: true,
    });
    // Ids only in the URL (not saved here) are never shown or added.
    expect(splitRequestedFavorites([], ["x"], ["x"])).toEqual({
      available: [],
      missing: [],
      pending: false,
    });
  });

  it("carry the selected ids and currency in their URLs, bounded", () => {
    expect(buildComparePageHref(["a", "b"], "GEL")).toBe("/compare?display=GEL&ids=a%2Cb");
    expect(buildComparePageHref([])).toBe("/compare");
    expect(buildComparePageHref(["a", "b", "c", "d", "e"])).toBe("/compare?ids=a%2Cb%2Cc%2Cd");
    expect(buildFavoritesPageHref(["x"])).toBe("/favorites?ids=x");
  });
});

describe("comparison summaries in the browser", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("never treats a failed lookup as missing listings (no data loss)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 503 })),
    );
    await ensureSummaries(["demo-listing-1", "demo-listing-2"]);
    expect(readSummaries().failed).toBe(true);
    expect(readSummaries().missing.size).toBe(0);
  });

  it("stores found summaries and reported missing ids, one request per batch", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            listings: [
              {
                id: "demo-listing-1",
                title: "t",
                href: "/properties/demo-listing-1",
                transactionType: "sale",
                coverImage: null,
              },
            ],
            missing: ["gone-1"],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await ensureSummaries(["demo-listing-1", "gone-1"]);
    await ensureSummaries(["demo-listing-1", "gone-1"]); // already known: no new request
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const state = readSummaries();
    expect(state.byId.get("demo-listing-1")?.transactionType).toBe("sale");
    expect([...state.missing]).toEqual(["gone-1"]);
    expect(state.failed).toBe(false);
  });
});
