import { describe, expect, it } from "vitest";
import { formatFloor, getCardFacts, getStructuralFacts } from "@/lib/properties/property-facts";
import type { Property } from "@/lib/properties/types";

const full: Property = {
  id: "p",
  city: "თბილისი",
  district: "x",
  areaSqm: 65,
  rooms: 3,
  bedrooms: 2,
  bathrooms: 1,
  floor: 5,
  totalFloors: 12,
  dataSource: "demo",
};
const bare: Property = {
  id: "q",
  city: "ბათუმი",
  district: "y",
  areaSqm: 48.5,
  dataSource: "demo",
};

describe("formatFloor", () => {
  it("shows floor and total floors when both are known", () => {
    expect(formatFloor(full)).toBe("5 / 12");
  });

  it("shows only the floor when the building height is unknown", () => {
    expect(formatFloor({ ...full, totalFloors: undefined })).toBe("5");
  });

  it("returns null when the floor is unknown", () => {
    expect(formatFloor(bare)).toBeNull();
    expect(formatFloor({ ...bare, totalFloors: 9 })).toBeNull();
  });
});

describe("getStructuralFacts", () => {
  it("lists area, rooms, bedrooms, bathrooms, and floor in a fixed order", () => {
    expect(getStructuralFacts(full)).toEqual([
      { label: "ფართი", value: "65 მ²" },
      { label: "ოთახები", value: "3" },
      { label: "საძინებლები", value: "2" },
      { label: "სველი წერტილები", value: "1" },
      { label: "სართული", value: "5 / 12" },
    ]);
  });

  it("keeps unknown facts as null instead of hiding or guessing them", () => {
    expect(getStructuralFacts(bare).map((fact) => fact.value)).toEqual([
      "48.5 მ²",
      null,
      null,
      null,
      null,
    ]);
  });

  it("keeps rooms and bedrooms distinct", () => {
    const [, rooms, bedrooms] = getStructuralFacts({ ...full, rooms: 4, bedrooms: 3 });
    expect(rooms).toEqual({ label: "ოთახები", value: "4" });
    expect(bedrooms).toEqual({ label: "საძინებლები", value: "3" });
  });

  it("shows zero bedrooms as 0, not as unknown", () => {
    expect(getStructuralFacts({ ...full, bedrooms: 0 })[2].value).toBe("0");
  });
});

describe("getCardFacts", () => {
  it("gives compact facts for cards", () => {
    expect(getCardFacts(full)).toEqual(["3 ოთახი", "2 საძინებელი", "65 მ²", "სართული 5 / 12"]);
  });

  it("describes a studio without bedrooms", () => {
    expect(getCardFacts({ ...full, rooms: 1, bedrooms: 0 })).toContain("საძინებლის გარეშე");
  });

  it("leaves out unknown facts but always shows the area", () => {
    expect(getCardFacts(bare)).toEqual(["48.5 მ²"]);
  });
});
