import { describe, expect, it } from "vitest";
import {
  AMENITIES,
  amenityAppliesTo,
  getAmenityStatus,
  groupAmenitiesByStatus,
  hasAllAmenities,
  isAmenityKey,
  normalizeAmenityKeys,
} from "@/lib/properties/amenities";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";

const item: ListingWithProperty = {
  listing: {
    id: "l",
    propertyId: "p",
    title: "დემო: ტესტი",
    transactionType: "sale",
    askingPrice: { amount: 1, currency: "USD" },
    status: "active",
    equipment: { refrigerator: "yes", television: "no", bed: "unknown" },
    dataSource: "demo",
  },
  property: {
    id: "p",
    type: "apartment",
    city: "თბილისი",
    district: "x",
    areaSqm: 50,
    features: { balcony: "yes", elevator: "no" },
    dataSource: "demo",
  },
};

describe("AMENITIES", () => {
  it("lists the ten supported amenities once each, with Georgian labels", () => {
    expect(AMENITIES).toHaveLength(10);
    expect(new Set(AMENITIES.map((amenity) => amenity.key)).size).toBe(10);
    for (const amenity of AMENITIES) {
      expect(amenity.label).toMatch(/[ა-ჿ]/);
    }
  });

  it("puts building features on Property and equipment on Listing", () => {
    const byGroup = (group: string) =>
      AMENITIES.filter((amenity) => amenity.group === group).map((amenity) => amenity.key);
    expect(byGroup("property")).toEqual(["balcony", "parking", "elevator", "centralHeating"]);
    expect(byGroup("listing")).toEqual([
      "television",
      "bed",
      "refrigerator",
      "washingMachine",
      "airConditioning",
      "dishwasher",
    ]);
  });
});

describe("isAmenityKey", () => {
  it("accepts known keys only", () => {
    expect(isAmenityKey("balcony")).toBe(true);
    expect(isAmenityKey("pool")).toBe(false);
    expect(isAmenityKey("")).toBe(false);
  });
});

describe("getAmenityStatus", () => {
  it("reads property features and listing equipment", () => {
    expect(getAmenityStatus(item, "balcony")).toBe("yes");
    expect(getAmenityStatus(item, "elevator")).toBe("no");
    expect(getAmenityStatus(item, "refrigerator")).toBe("yes");
    expect(getAmenityStatus(item, "television")).toBe("no");
  });

  it("treats missing information as unknown, never as no", () => {
    expect(getAmenityStatus(item, "parking")).toBe("unknown");
    expect(getAmenityStatus(item, "dishwasher")).toBe("unknown");
    expect(getAmenityStatus(item, "bed")).toBe("unknown");
  });

  it("treats a completely missing record as unknown", () => {
    const bare = {
      ...item,
      listing: { ...item.listing, equipment: undefined },
      property: { ...item.property, features: undefined },
    };
    expect(getAmenityStatus(bare, "balcony")).toBe("unknown");
    expect(getAmenityStatus(bare, "refrigerator")).toBe("unknown");
  });
});

describe("hasAllAmenities", () => {
  it("uses AND matching on confirmed amenities", () => {
    expect(hasAllAmenities(item, ["balcony"])).toBe(true);
    expect(hasAllAmenities(item, ["balcony", "refrigerator"])).toBe(true);
    expect(hasAllAmenities(item, ["balcony", "elevator"])).toBe(false);
  });

  it("does not count unknown as a match", () => {
    expect(hasAllAmenities(item, ["parking"])).toBe(false);
    expect(hasAllAmenities(item, ["bed"])).toBe(false);
  });

  it("matches everything when nothing is selected", () => {
    expect(hasAllAmenities(item, [])).toBe(true);
  });
});

describe("groupAmenitiesByStatus", () => {
  it("splits a group by status in display order", () => {
    const building = groupAmenitiesByStatus(item, "property");
    expect(building.yes.map((amenity) => amenity.key)).toEqual(["balcony"]);
    expect(building.no.map((amenity) => amenity.key)).toEqual(["elevator"]);
    expect(building.unknown.map((amenity) => amenity.key)).toEqual(["parking", "centralHeating"]);

    const equipment = groupAmenitiesByStatus(item, "listing");
    expect(equipment.yes.map((amenity) => amenity.key)).toEqual(["refrigerator"]);
    expect(equipment.no.map((amenity) => amenity.key)).toEqual(["television"]);
    expect(equipment.unknown).toHaveLength(4);
  });
});

describe("normalizeAmenityKeys", () => {
  it("sorts into display order and removes duplicates", () => {
    expect(normalizeAmenityKeys(["dishwasher", "balcony", "dishwasher"])).toEqual([
      "balcony",
      "dishwasher",
    ]);
  });
});

describe("amenities by property type", () => {
  const house: ListingWithProperty = {
    listing: item.listing,
    property: {
      id: "h",
      type: "house",
      city: "თბილისი",
      district: "x",
      areaSqm: 180,
      features: { balcony: "yes", elevator: "yes" },
      dataSource: "demo",
    },
  };

  it("marks the elevator as apartment-only", () => {
    const elevator = AMENITIES.find((amenity) => amenity.key === "elevator")!;
    expect(amenityAppliesTo(elevator, "apartment")).toBe(true);
    expect(amenityAppliesTo(elevator, "house")).toBe(false);
  });

  it("does not show the elevator for a house", () => {
    const building = groupAmenitiesByStatus(house, "property");
    const keys = [...building.yes, ...building.no, ...building.unknown].map((a) => a.key);
    expect(keys).not.toContain("elevator");
    expect(keys).toContain("balcony");
  });

  it("never matches a house on an apartment-only amenity, even if data says yes", () => {
    expect(hasAllAmenities(house, ["balcony"])).toBe(true);
    expect(hasAllAmenities(house, ["elevator"])).toBe(false);
  });
});
