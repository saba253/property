import { describe, expect, it } from "vitest";
import { formatFloor, getCardFacts, getStructuralFacts } from "@/lib/properties/property-facts";
import type { ApartmentProperty, HouseProperty } from "@/lib/properties/types";

const full: ApartmentProperty = {
  id: "p",
  type: "apartment",
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
const bare: ApartmentProperty = {
  id: "q",
  type: "apartment",
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

describe("private houses", () => {
  const house: HouseProperty = {
    id: "h",
    type: "house",
    city: "თბილისი",
    district: "x",
    areaSqm: 180,
    landAreaSqm: 400,
    rooms: 5,
    bedrooms: 4,
    bathrooms: 3,
    storeys: 2,
    dataSource: "demo",
  };

  it("lists house facts, with storeys and yard area but no floor", () => {
    const facts = getStructuralFacts(house);
    expect(facts).toEqual([
      { label: "სახლის ფართი", value: "180 მ²" },
      { label: "ეზოს ფართი", value: "400 მ²" },
      { label: "ოთახები", value: "5" },
      { label: "საძინებლები", value: "4" },
      { label: "სველი წერტილები", value: "3" },
      { label: "სართულიანობა", value: "2" },
    ]);
    expect(facts.map((fact) => fact.label)).not.toContain("სართული");
  });

  it("keeps unknown house facts as null", () => {
    const bareHouse: HouseProperty = { ...house, landAreaSqm: undefined, storeys: undefined };
    const facts = getStructuralFacts(bareHouse);
    expect(facts.find((fact) => fact.label === "ეზოს ფართი")?.value).toBeNull();
    expect(facts.find((fact) => fact.label === "სართულიანობა")?.value).toBeNull();
  });

  it("never gives an apartment house-only facts", () => {
    const labels = getStructuralFacts(full).map((fact) => fact.label);
    expect(labels).not.toContain("ეზოს ფართი");
    expect(labels).not.toContain("სართულიანობა");
  });

  it("gives compact card facts for a house", () => {
    expect(getCardFacts(house)).toEqual([
      "5 ოთახი",
      "4 საძინებელი",
      "180 მ²",
      "2-სართულიანი",
      "ეზო 400 მ²",
    ]);
    expect(getCardFacts({ ...house, storeys: undefined, landAreaSqm: undefined })).toEqual([
      "5 ოთახი",
      "4 საძინებელი",
      "180 მ²",
    ]);
  });
});
