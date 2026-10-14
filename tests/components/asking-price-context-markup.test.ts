import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AskingPriceContextSection,
  INSUFFICIENT_DATA_MESSAGE,
} from "@/components/properties/asking-price-context";
import { getAskingPriceContext } from "@/lib/analytics/asking-price-context";
import type { ExchangeRateState } from "@/lib/currency/exchange-rate";
import {
  getActiveDemoListingsWithProperties,
  getDemoListingWithProperty,
} from "@/lib/properties/get-demo-listing";
import { comparablesWithPerSqm, synthetic } from "../lib/analytics/fixtures";

const noRate: ExchangeRateState = { status: "unavailable" };
const render = (
  subject: ReturnType<typeof synthetic>,
  candidates: ReturnType<typeof synthetic>[],
) =>
  renderToStaticMarkup(
    createElement(AskingPriceContextSection, {
      subject,
      context: getAskingPriceContext(subject, candidates, noRate),
    }),
  );

describe("AskingPriceContextSection", () => {
  it("renders a compact, honest insufficient-data state for demo listings", () => {
    const subject = getDemoListingWithProperty("demo-listing-1")!;
    const html = renderToStaticMarkup(
      createElement(AskingPriceContextSection, {
        subject,
        context: getAskingPriceContext(subject, getActiveDemoListingsWithProperties(), noRate),
      }),
    );
    expect(html).toContain("მოთხოვნილი ფასის შედარება");
    expect(html).toContain("მონაცემები არასაკმარისია.");
    expect(html).toContain(INSUFFICIENT_DATA_MESSAGE);
    expect(html).toContain("საჭიროა მინიმუმ 5");
    // No statistics, no bar, no disclosure in this state.
    expect(html).not.toContain("მედიანა");
    expect(html).not.toContain("<details");
    expect(html).not.toContain("%");
  });

  it("shows the statistics, scope, demo disclaimer and real comparables when ready", () => {
    const subject = synthetic("subject", { area: 100, price: 220000 });
    const comparables = comparablesWithPerSqm([2100, 1900, 2000, 2400, 2300]);
    const html = render(subject, comparables);
    expect(html).toContain("ფასი მ²-ზე");
    expect(html).toContain("მსგავსი განცხადებების მედიანა");
    expect(html).toContain("შესადარებელი განცხადებები");
    expect(html).toContain("$2,100 / მ²");
    expect(html).toContain("მედიანაზე 5%-ით მაღალია");
    expect(html).toContain("შედარება იმავე უბანში");
    expect(html).toContain("დემო მონაცემებით და არა ქონების შეფასება ან");
    expect(html).toContain("<details");
    for (const item of comparables) expect(html).toContain(item.listing.title);
    expect(html).not.toMatch(/იაფ|ძვირ|კარგი შეთავაზება|ცუდი შეთავაზება/);
  });

  it("says when the comparison widened to the whole city", () => {
    const subject = synthetic("subject", { area: 100, price: 220000 });
    const html = render(
      subject,
      comparablesWithPerSqm([2100, 1900, 2000, 2400, 2300], { district: "უბანი-9" }),
    );
    expect(html).toContain("შედარება მთელ ქალაქში");
  });
});
