import { describe, expect, it } from "vitest";
import {
  type ListingDraft,
  buildDraftListing,
  createEmptyDraft,
  findFirstInvalidStep,
  getDetailFields,
  getDraftFieldLabel,
  getDraftTopFloorStatus,
  getEditableAmenities,
  isDraftDirty,
  parseDraftNumber,
  suggestDraftTitle,
  validateDraft,
  validateDraftStep,
} from "@/lib/listing-draft/draft";
import { getAmenityStatus } from "@/lib/properties/amenities";
import { getListingDisplayPrice } from "@/lib/pricing/display-price";

function apartmentDraft(overrides: Partial<ListingDraft> = {}): ListingDraft {
  return {
    ...createEmptyDraft(),
    transactionType: "sale",
    propertyType: "apartment",
    citySlug: "tbilisi",
    district: "ვაკე",
    areaSqm: "65",
    rooms: "3",
    bedrooms: "2",
    floor: "5",
    totalFloors: "12",
    price: "150000",
    ...overrides,
  };
}

function houseDraft(overrides: Partial<ListingDraft> = {}): ListingDraft {
  return {
    ...createEmptyDraft(),
    transactionType: "rent",
    propertyType: "house",
    citySlug: "batumi",
    district: "ახალი ბულვარი",
    areaSqm: "140",
    storeys: "2",
    landAreaSqm: "350",
    price: "2000",
    currency: "GEL",
    ...overrides,
  };
}

describe("createEmptyDraft", () => {
  it("starts empty, with USD preselected as the price currency", () => {
    const draft = createEmptyDraft();
    expect(draft.transactionType).toBeNull();
    expect(draft.propertyType).toBeNull();
    expect(draft.currency).toBe("USD");
    expect(draft.photos).toEqual([]);
    expect(isDraftDirty(draft)).toBe(false);
  });
});

describe("parseDraftNumber", () => {
  const options = { required: true, integer: false, min: 5, max: 100 };

  it("accepts plain, decimal and thousands-separated numbers", () => {
    expect(parseDraftNumber("65", options)).toEqual({ value: 65 });
    expect(parseDraftNumber(" 65.5 ", options)).toEqual({ value: 65.5 });
    expect(parseDraftNumber("1 500", { ...options, max: 2000 })).toEqual({ value: 1500 });
  });

  it("explains a decimal comma instead of reading 65,5 as 655", () => {
    expect(parseDraftNumber("65,5", options)).toEqual({
      error: "ათწილადისთვის გამოიყენეთ წერტილი, მაგ. 65.5",
    });
  });

  it("handles empty, required and optional values", () => {
    expect(parseDraftNumber("", options)).toEqual({ error: "სავალდებულო ველი." });
    expect(parseDraftNumber("  ", { ...options, required: false })).toEqual({ value: null });
  });

  it("rejects text, non-integers where integers are required, and out-of-range values", () => {
    expect(parseDraftNumber("abc", options)).toEqual({ error: "შეიყვანეთ რიცხვი." });
    expect(parseDraftNumber("2.5", { ...options, integer: true })).toEqual({
      error: "შეიყვანეთ მთელი რიცხვი.",
    });
    expect(parseDraftNumber("4", options)).toEqual({ error: "დასაშვებია 5–100." });
    expect(parseDraftNumber("101", options)).toEqual({ error: "დასაშვებია 5–100." });
  });

  it("accepts negative numbers only within the allowed range (basement floors)", () => {
    expect(parseDraftNumber("-1", { required: false, integer: true, min: -3, max: 150 })).toEqual({
      value: -1,
    });
    expect(parseDraftNumber("-1", { required: false, integer: true, min: 0, max: 150 })).toEqual({
      error: "დასაშვებია 0–150.",
    });
  });
});

describe("property-type specific fields", () => {
  it("shows floor fields only for apartments and plot fields only for houses", () => {
    expect(getDetailFields("apartment").map((spec) => spec.field)).toEqual([
      "areaSqm",
      "rooms",
      "bedrooms",
      "bathrooms",
      "floor",
      "totalFloors",
    ]);
    expect(getDetailFields("house").map((spec) => spec.field)).toEqual([
      "areaSqm",
      "rooms",
      "bedrooms",
      "bathrooms",
      "storeys",
      "landAreaSqm",
    ]);
  });

  it("names the area field per type", () => {
    expect(getDraftFieldLabel("areaSqm", "apartment")).toBe("ფართი (მ²)");
    expect(getDraftFieldLabel("areaSqm", "house")).toBe("სახლის ფართი (მ²)");
    expect(getDraftFieldLabel("citySlug", null)).toBe("ქალაქი");
  });

  it("offers no elevator for houses and never offers derived characteristics", () => {
    const apartment = getEditableAmenities("apartment").map((amenity) => amenity.key);
    const house = getEditableAmenities("house").map((amenity) => amenity.key);
    expect(apartment).toContain("elevator");
    expect(house).not.toContain("elevator");
    expect(apartment).not.toContain("topFloor");
    expect(apartment).toHaveLength(16);
    expect(house).toHaveLength(15);
  });
});

describe("validateDraftStep", () => {
  it("requires the transaction and property type choices", () => {
    const draft = createEmptyDraft();
    expect(validateDraftStep(draft, "transaction")).toHaveProperty("transactionType");
    expect(validateDraftStep(draft, "propertyType")).toHaveProperty("propertyType");
  });

  it("requires a known city and a district", () => {
    expect(validateDraftStep(apartmentDraft({ citySlug: "kutaisi" }), "location")).toHaveProperty(
      "citySlug",
    );
    expect(validateDraftStep(apartmentDraft({ district: " ვ " }), "location")).toHaveProperty(
      "district",
    );
    expect(validateDraftStep(apartmentDraft(), "location")).toEqual({});
  });

  it("requires the area and checks inconsistent rooms, bedrooms and floors", () => {
    expect(validateDraftStep(apartmentDraft({ areaSqm: "" }), "details")).toEqual({
      areaSqm: "სავალდებულო ველი.",
    });
    expect(validateDraftStep(apartmentDraft({ rooms: "2", bedrooms: "3" }), "details")).toEqual({
      bedrooms: "საძინებლების რაოდენობა ოთახების რაოდენობას არ უნდა აღემატებოდეს.",
    });
    expect(validateDraftStep(apartmentDraft({ floor: "12", totalFloors: "9" }), "details")).toEqual(
      { floor: "სართული კორპუსის სართულიანობას არ უნდა აღემატებოდეს." },
    );
  });

  it("ignores fields that do not apply to the chosen property type", () => {
    // Invalid apartment values left over after switching to a house do not block the house.
    const draft = houseDraft({ floor: "999", totalFloors: "x" });
    expect(validateDraftStep(draft, "details")).toEqual({});
    expect(validateDraftStep(houseDraft({ storeys: "11" }), "details")).toEqual({
      storeys: "დასაშვებია 1–10.",
    });
  });

  it("uses different price limits for sale and monthly rent", () => {
    expect(validateDraftStep(apartmentDraft({ price: "" }), "price")).toEqual({
      price: "მიუთითეთ გასაყიდი ფასი.",
    });
    expect(validateDraftStep(houseDraft({ price: "" }), "price")).toEqual({
      price: "მიუთითეთ თვიური ქირა.",
    });
    expect(validateDraftStep(apartmentDraft({ price: "500" }), "price")).toHaveProperty("price");
    expect(validateDraftStep(houseDraft({ price: "500" }), "price")).toEqual({});
    expect(validateDraftStep(houseDraft({ price: "150000" }), "price")).toHaveProperty("price");
    expect(validateDraftStep(apartmentDraft({ price: "150000.5" }), "price")).toHaveProperty(
      "price",
    );
  });

  it("limits the title length but does not require a title", () => {
    expect(validateDraftStep(apartmentDraft({ title: "" }), "price")).toEqual({});
    expect(validateDraftStep(apartmentDraft({ title: "ა".repeat(81) }), "price")).toHaveProperty(
      "title",
    );
  });

  it("validates everything on the review step", () => {
    expect(validateDraftStep(apartmentDraft(), "review")).toEqual({});
    expect(Object.keys(validateDraft(createEmptyDraft()))).toEqual(
      expect.arrayContaining(["transactionType", "propertyType", "citySlug", "district"]),
    );
  });
});

describe("findFirstInvalidStep", () => {
  it("points to the first step that needs attention", () => {
    expect(findFirstInvalidStep(createEmptyDraft())).toBe(0);
    expect(findFirstInvalidStep(apartmentDraft({ areaSqm: "" }))).toBe(3);
    expect(findFirstInvalidStep(apartmentDraft())).toBeNull();
  });
});

describe("buildDraftListing", () => {
  it("returns null while the draft has errors", () => {
    expect(buildDraftListing(apartmentDraft({ price: "" }))).toBeNull();
  });

  it("builds a sale apartment that keeps the original price and currency", () => {
    const item = buildDraftListing(apartmentDraft({ currency: "GEL", price: "390000" }))!;
    expect(item.property).toMatchObject({
      type: "apartment",
      city: "თბილისი",
      district: "ვაკე",
      areaSqm: 65,
      rooms: 3,
      bedrooms: 2,
      floor: 5,
      totalFloors: 12,
      dataSource: "local-draft",
    });
    expect(item.property.bathrooms).toBeUndefined();
    expect(item.listing).toMatchObject({
      transactionType: "sale",
      askingPrice: { amount: 390000, currency: "GEL" },
      status: "inactive",
      dataSource: "local-draft",
    });
  });

  it("builds a monthly rental house without apartment-only facts or amenities", () => {
    const item = buildDraftListing(
      houseDraft({
        floor: "3",
        amenities: { elevator: "yes", garage: "yes", furniture: "no", balcony: "unknown" },
      }),
    )!;
    expect(item.property.type).toBe("house");
    expect(item.property).not.toHaveProperty("floor");
    expect(item.property).toMatchObject({ storeys: 2, landAreaSqm: 350 });
    expect(item.listing).toMatchObject({ transactionType: "rent", rentPeriod: "month" });
    // Elevator does not apply to houses; "unknown" is stored as a missing key.
    expect(item.property.features).toEqual({ garage: "yes" });
    expect(item.listing.equipment).toEqual({ furniture: "no" });
    expect(getAmenityStatus(item, "balcony")).toBe("unknown");
  });

  it("uses the entered title, or a neutral suggested one", () => {
    expect(buildDraftListing(apartmentDraft({ title: "  ნათელი ბინა  " }))!.listing.title).toBe(
      "ნათელი ბინა",
    );
    expect(buildDraftListing(apartmentDraft())!.listing.title).toBe(
      "იყიდება 3-ოთახიანი ბინა · ვაკე",
    );
  });

  it("works with the shared pricing code (price per m², rent period, conversion)", () => {
    const item = buildDraftListing(houseDraft())!;
    const rateState = {
      status: "available" as const,
      rate: {
        source: "nbg" as const,
        gelPerUsd: 2.5,
        effectiveDate: "2026-10-10",
        publishedAt: null,
      },
      freshness: "current" as const,
    };
    const price = getListingDisplayPrice(item, "USD", rateState);
    expect(price).toMatchObject({
      original: { amount: 2000, currency: "GEL" },
      amount: 800,
      isConverted: true,
      period: "month",
    });
    expect(price.pricePerSqm).toBeCloseTo(800 / 140, 2);
  });
});

describe("suggestDraftTitle", () => {
  it("describes the listing without inventing facts", () => {
    expect(suggestDraftTitle(createEmptyDraft())).toBe("ახალი განცხადება");
    expect(suggestDraftTitle(houseDraft())).toBe("ქირავდება კერძო სახლი · ახალი ბულვარი");
    expect(suggestDraftTitle(apartmentDraft({ district: "" }))).toBe("იყიდება 3-ოთახიანი ბინა");
  });
});

describe("getDraftTopFloorStatus", () => {
  it("derives the top floor like published listings", () => {
    expect(getDraftTopFloorStatus(apartmentDraft({ floor: "12" }))).toBe("yes");
    expect(getDraftTopFloorStatus(apartmentDraft())).toBe("no");
    expect(getDraftTopFloorStatus(apartmentDraft({ totalFloors: "" }))).toBe("unknown");
    expect(getDraftTopFloorStatus(houseDraft())).toBe("unknown");
  });
});

describe("isDraftDirty", () => {
  it("detects any entered value", () => {
    expect(isDraftDirty({ ...createEmptyDraft(), district: "ვ" })).toBe(true);
    expect(isDraftDirty({ ...createEmptyDraft(), amenities: { balcony: "yes" } })).toBe(true);
    expect(isDraftDirty({ ...createEmptyDraft(), currency: "GEL" })).toBe(true);
  });
});
