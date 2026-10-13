import { describe, expect, it } from "vitest";
import { AREA_REFERENCES, type AreaReference } from "@/lib/geo/area-reference";
import {
  PRECISION_LABELS,
  describeLocationPrecision,
  findAreaForDistrict,
  isInGeorgia,
  isValidGeoPoint,
  locationFromDistrict,
  resolveMapPosition,
  validatePropertyLocation,
} from "@/lib/geo/location";
import { demoProperties } from "@/lib/properties/demo-data";
import type { ApartmentProperty, PropertyLocation } from "@/lib/properties/types";

function apartment(location?: PropertyLocation, district = "ვაკე"): ApartmentProperty {
  return {
    id: "p",
    type: "apartment",
    city: "თბილისი",
    district,
    areaSqm: 50,
    dataSource: "demo",
    ...(location ? { location } : {}),
  };
}

describe("coordinates", () => {
  it("validates points and checks they are in Georgia", () => {
    expect(isValidGeoPoint({ lat: 41.7, lng: 44.8 })).toBe(true);
    expect(isValidGeoPoint({ lat: Number.NaN, lng: 44.8 })).toBe(false);
    expect(isValidGeoPoint({ lat: 95, lng: 44.8 })).toBe(false);
    expect(isInGeorgia({ lat: 41.7, lng: 44.8 })).toBe(true);
    // Swapped latitude and longitude end up outside Georgia.
    expect(isInGeorgia({ lat: 44.8, lng: 41.7 })).toBe(false);
  });
});

describe("validatePropertyLocation", () => {
  it("accepts unknown and missing locations", () => {
    expect(validatePropertyLocation(apartment())).toEqual([]);
    expect(validatePropertyLocation(apartment({ precision: "unknown" }))).toEqual([]);
  });

  it("requires exact points to be valid, in Georgia and verified", () => {
    expect(
      validatePropertyLocation(
        apartment({
          precision: "exact",
          point: { lat: 41.7, lng: 44.8 },
          verifiedOn: "2026-10-01",
        }),
      ),
    ).toEqual([]);
    expect(
      validatePropertyLocation(
        apartment({ precision: "exact", point: { lat: 48.8, lng: 2.3 }, verifiedOn: "" }),
      ),
    ).toEqual(["outside-georgia", "missing-verification-date"]);
  });

  it("requires approximate areas to exist and match the property's district", () => {
    expect(
      validatePropertyLocation(apartment({ precision: "approximate", areaId: "nowhere" })),
    ).toEqual(["unknown-area"]);
    expect(
      validatePropertyLocation(
        apartment({ precision: "approximate", areaId: "tbilisi-isani" }, "ვაკე"),
      ),
    ).toEqual(["area-mismatch"]);
  });
});

describe("resolveMapPosition", () => {
  it("shows approximate locations at the area reference point, grouped by area", () => {
    const position = resolveMapPosition(
      apartment({ precision: "approximate", areaId: "tbilisi-vake" }),
    );
    const vake = AREA_REFERENCES.find((area) => area.id === "tbilisi-vake")!;
    expect(position).toEqual({
      precision: "approximate",
      point: vake.point,
      groupKey: "area:tbilisi-vake",
    });
  });

  it("keeps exact points separate from area points", () => {
    const point = { lat: 41.7101, lng: 44.7702 };
    expect(
      resolveMapPosition(apartment({ precision: "exact", point, verifiedOn: "2026-10-01" })),
    ).toMatchObject({ precision: "exact", point });
  });

  it("never places a pin without trustworthy data", () => {
    expect(resolveMapPosition(apartment())).toBeNull();
    expect(resolveMapPosition(apartment({ precision: "unknown" }))).toBeNull();
    expect(
      resolveMapPosition(apartment({ precision: "approximate", areaId: "tbilisi-isani" })),
    ).toBeNull();
  });
});

describe("area reference data", () => {
  it("has unique ids, one point per city and district, all inside Georgia, with a source", () => {
    const ids = AREA_REFERENCES.map((area) => area.id);
    expect(new Set(ids).size).toBe(ids.length);
    const places = AREA_REFERENCES.map((area) => `${area.city}/${area.district}`);
    expect(new Set(places).size).toBe(places.length);
    for (const area of AREA_REFERENCES) {
      expect(isInGeorgia(area.point)).toBe(true);
      expect(area.source.osmId).toBeGreaterThan(0);
      // Rounded to at most 3 decimals: an area point, not a building.
      expect(Math.round(area.point.lat * 1000) / 1000).toBe(area.point.lat);
      expect(Math.round(area.point.lng * 1000) / 1000).toBe(area.point.lng);
    }
  });

  it("finds an area by city and district, and nothing for other cities", () => {
    expect(findAreaForDistrict("თბილისი", " ვაკე ")?.id).toBe("tbilisi-vake");
    expect(findAreaForDistrict("ბათუმი", "ვაკე")).toBeNull();
  });

  it("derives draft locations from the district only, never exact", () => {
    expect(locationFromDistrict("თბილისი", "საბურთალო")).toEqual({
      precision: "approximate",
      areaId: "tbilisi-saburtalo",
    });
    expect(locationFromDistrict("ბათუმი", "ახალი ბულვარი")).toEqual({ precision: "unknown" });
    const custom: AreaReference[] = [];
    expect(locationFromDistrict("თბილისი", "ვაკე", custom)).toEqual({ precision: "unknown" });
  });
});

describe("demo data locations", () => {
  it("are valid, never exact, and leave areas without reference data unmapped", () => {
    for (const property of demoProperties) {
      expect(validatePropertyLocation(property)).toEqual([]);
      expect(property.location?.precision).not.toBe("exact");
    }
    const unmapped = demoProperties.filter((property) => resolveMapPosition(property) === null);
    expect(unmapped.map((property) => property.district).sort()).toEqual(
      ["ახალი ბულვარი", "ახალი ბულვარი", "აეროპორტის დასახლება"].sort(),
    );
  });

  it("have Georgian labels for every precision", () => {
    expect(PRECISION_LABELS.approximate).toBe("მიახლოებითი მდებარეობა");
    expect(describeLocationPrecision("approximate")).toContain("არა კონკრეტული შენობა");
    expect(describeLocationPrecision("unknown")).toContain("სიაში");
  });
});
