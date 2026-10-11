import { describe, expect, it } from "vitest";
import { findCityBySlug, getCitiesPresentIn, knownCities } from "@/lib/properties/cities";
import { demoProperties } from "@/lib/properties/demo-data";

describe("findCityBySlug", () => {
  it("finds a known city", () => {
    expect(findCityBySlug("batumi")?.name).toBe("ბათუმი");
  });

  it("returns null for an unknown slug", () => {
    expect(findCityBySlug("kutaisi")).toBeNull();
  });
});

describe("getCitiesPresentIn", () => {
  it("returns only cities that appear, in known order", () => {
    expect(getCitiesPresentIn(["ბათუმი", "ბათუმი"]).map((city) => city.slug)).toEqual(["batumi"]);
    expect(getCitiesPresentIn(["ბათუმი", "თბილისი"]).map((city) => city.slug)).toEqual([
      "tbilisi",
      "batumi",
    ]);
  });

  it("covers every city used in the demo data", () => {
    const names = knownCities.map((city) => city.name);
    for (const property of demoProperties) {
      expect(names).toContain(property.city);
    }
  });
});
