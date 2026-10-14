import { describe, expect, it } from "vitest";
import {
  AMENITIES,
  amenityAppliesTo,
  getAmenityStatus,
  getTopFloorStatus,
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
    equipment: { refrigerator: "yes", television: "no", washingMachine: "unknown" },
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
  it("lists the sixteen supported characteristics once each, with Georgian labels", () => {
    expect(AMENITIES).toHaveLength(16);
    expect(new Set(AMENITIES.map((amenity) => amenity.key)).size).toBe(16);
    for (const amenity of AMENITIES) {
      expect(amenity.label).toMatch(/[ა-ჿ]/);
    }
  });

  it("puts building features on Property and equipment on Listing", () => {
    const byGroup = (group: string) =>
      AMENITIES.filter((amenity) => amenity.group === group).map((amenity) => amenity.key);
    expect(byGroup("property")).toEqual([
      "balcony",
      "parking",
      "garage",
      "elevator",
      "centralHeating",
      "naturalGas",
      "basement",
      "storageRoom",
      "builtInKitchen",
      "topFloor",
    ]);
    expect(byGroup("listing")).toEqual([
      "furniture",
      "television",
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
    expect(getAmenityStatus(item, "washingMachine")).toBe("unknown");
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
    expect(hasAllAmenities(item, ["washingMachine"])).toBe(false);
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
    // Missing data is unknown; the apartment fixture has no floor data, so top floor is unknown.
    expect(building.unknown.map((amenity) => amenity.key)).toEqual([
      "parking",
      "garage",
      "centralHeating",
      "naturalGas",
      "basement",
      "storageRoom",
      "builtInKitchen",
      "topFloor",
    ]);

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

describe("requested Georgian labels", () => {
  it("uses the agreed labels for the new characteristics", () => {
    const label = (key: string) => AMENITIES.find((amenity) => amenity.key === key)?.label;
    expect(label("basement")).toBe("სარდაფი");
    expect(label("furniture")).toBe("ავეჯი");
    expect(label("garage")).toBe("გარაჟი");
    expect(label("topFloor")).toBe("ბოლო სართული");
    expect(label("naturalGas")).toBe("ბუნებრივი აირი");
    expect(label("storageRoom")).toBe("სათავსო");
    expect(label("builtInKitchen")).toBe("ჩაშენებული სამზარეულო");
  });

  it("keeps furniture as offer equipment and fixed characteristics on the property", () => {
    const group = (key: string) => AMENITIES.find((amenity) => amenity.key === key)?.group;
    expect(group("furniture")).toBe("listing");
    for (const key of ["basement", "garage", "naturalGas", "storageRoom", "builtInKitchen"]) {
      expect(group(key)).toBe("property");
    }
  });
});

describe("top floor (derived, apartments only)", () => {
  const apartment = (floor?: number, totalFloors?: number) =>
    ({
      id: "a",
      type: "apartment",
      city: "თბილისი",
      district: "x",
      areaSqm: 50,
      floor,
      totalFloors,
      dataSource: "demo",
    }) as const;

  it("is yes on the top floor and no below it", () => {
    expect(getTopFloorStatus(apartment(9, 9))).toBe("yes");
    expect(getTopFloorStatus(apartment(4, 9))).toBe("no");
  });

  it("is unknown when floor or total floors is missing, or the data is inconsistent", () => {
    expect(getTopFloorStatus(apartment(undefined, 9))).toBe("unknown");
    expect(getTopFloorStatus(apartment(4, undefined))).toBe("unknown");
    expect(getTopFloorStatus(apartment(12, 9))).toBe("unknown");
  });

  it("is unknown and never applicable for houses", () => {
    const houseItem: ListingWithProperty = {
      listing: item.listing,
      property: {
        id: "h",
        type: "house",
        city: "თბილისი",
        district: "x",
        areaSqm: 180,
        dataSource: "demo",
      },
    };
    expect(getTopFloorStatus(houseItem.property)).toBe("unknown");
    expect(hasAllAmenities(houseItem, ["topFloor"])).toBe(false);
    const building = groupAmenitiesByStatus(houseItem, "property");
    const keys = [...building.yes, ...building.no, ...building.unknown].map((a) => a.key);
    expect(keys).not.toContain("topFloor");
  });

  it("is read through getAmenityStatus and matched by filters", () => {
    const top: ListingWithProperty = { listing: item.listing, property: apartment(9, 9) };
    const lower: ListingWithProperty = { listing: item.listing, property: apartment(3, 9) };
    expect(getAmenityStatus(top, "topFloor")).toBe("yes");
    expect(hasAllAmenities(top, ["topFloor"])).toBe(true);
    expect(hasAllAmenities(lower, ["topFloor"])).toBe(false);
  });
});
