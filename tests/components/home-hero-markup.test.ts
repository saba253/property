import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomeHero } from "@/components/home/home-hero";

describe("HomeHero transaction tabs", () => {
  const html = renderToStaticMarkup(createElement(HomeHero));

  it("uses the shared labels იყიდება / ქირავდება", () => {
    expect(html).toContain(">იყიდება</label>");
    expect(html).toContain(">ქირავდება</label>");
    expect(html).not.toContain(">ყიდვა</label>");
    expect(html).not.toContain(">ქირაობა</label>");
  });

  it("keeps the sale/rent values, the parameter name and sale as the default", () => {
    const radios = html.match(/<input type="radio"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(2);
    expect(radios[0]).toContain('name="transaction"');
    expect(radios[0]).toContain('value="sale"');
    expect(radios[0]).toContain('checked=""');
    expect(radios[1]).toContain('value="rent"');
    expect(radios[1]).not.toContain("checked");
    expect(html).toContain('action="/properties"');
  });
});
