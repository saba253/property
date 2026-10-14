import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SaveSearchButton } from "@/components/saved-searches/save-search-button";
import { SavedSearchesList } from "@/components/saved-searches/saved-searches-list";

const props = {
  query: "city=tbilisi",
  suggestedName: "იყიდება · თბილისი",
  criteria: ["იყიდება", "ქალაქი: თბილისი"],
  ignored: [] as string[],
};

describe("SaveSearchButton markup", () => {
  it("is disabled, with an explanation, for the default search", () => {
    const html = renderToStaticMarkup(
      createElement(SaveSearchButton, { ...props, query: "", saveable: false }),
    );
    expect(html).toContain("disabled");
    expect(html).toContain("ძიების შესანახად აირჩიეთ მინიმუმ ერთი ფილტრი");
  });

  it("shows the criteria, a labelled name field and what will not be saved", () => {
    const html = renderToStaticMarkup(
      createElement(SaveSearchButton, {
        ...props,
        saveable: true,
        ignored: ["ტექსტში ვერ ამოცნობილი სიტყვები: ლამაზი"],
      }),
    );
    expect(html).toContain("<summary");
    expect(html).toContain("ძიების შენახვა");
    expect(html).toMatch(/<label for="[^"]+"[^>]*>ძიების სახელი<\/label>/);
    expect(html).toContain('placeholder="იყიდება · თბილისი"');
    expect(html).toContain("ქალაქი: თბილისი");
    expect(html).toContain("არ შეინახება:");
    expect(html).toContain("ლამაზი");
  });
});

describe("SavedSearchesList before hydration", () => {
  it("shows a loading state instead of guessing saved searches or result counts", () => {
    const html = renderToStaticMarkup(createElement(SavedSearchesList, { districts: [] }));
    expect(html).toContain("შენახული ძიებები იტვირთება");
    expect(html).not.toContain("<li");
  });
});
