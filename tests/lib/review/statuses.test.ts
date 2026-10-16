import { describe, expect, it } from "vitest";
import { PREVIEW_LABEL, USER_LISTING_STATUSES } from "@/lib/review/statuses";

describe("preview labels", () => {
  it("name the real status and never call a reviewed listing a draft", () => {
    for (const status of USER_LISTING_STATUSES) {
      expect(PREVIEW_LABEL[status], status).toMatch(/გამოქვეყნ|ქვეყნდება|არსად ჩანს/);
      if (status !== "draft") expect(PREVIEW_LABEL[status], status).not.toContain("დრაფტი");
    }
    expect(PREVIEW_LABEL.submitted).toContain("განხილვაზე");
    expect(PREVIEW_LABEL.approved).toContain("ჯერ არ გამოქვეყნებულა");
  });
});
