import {
  AMENITIES,
  type AmenityDefinition,
  amenityAppliesTo,
  getTopFloorStatus,
} from "@/lib/properties/amenities";
import { locationFromDistrict } from "@/lib/geo/location";
import { findCityBySlug } from "@/lib/properties/cities";
import type { ListingWithProperty } from "@/lib/properties/get-demo-listing";
import { parseNonNegativeNumber } from "@/lib/properties/listing-filters";
import { PROPERTY_TYPES, TRANSACTION_TYPES, assertNever } from "@/lib/properties/listing-types";
import type {
  AmenityStatus,
  Currency,
  Listing,
  ListingEquipmentKey,
  Property,
  PropertyFeatureKey,
  PropertyType,
  TransactionType,
} from "@/lib/properties/types";

/*
 * A listing draft prepared in the browser on /properties/new. It is never published, uploaded
 * or stored: it lives in page memory only and is lost on refresh. Field values are kept as the
 * text the user typed, so going Back and Next never changes what they entered; they are parsed
 * and validated here, and turned into the normal Property and Listing types for the preview.
 */

export const DRAFT_STEPS = [
  { id: "transaction", title: "გარიგების ტიპი" },
  { id: "propertyType", title: "ქონების ტიპი" },
  { id: "location", title: "მდებარეობა" },
  { id: "details", title: "ქონების მონაცემები" },
  { id: "amenities", title: "კეთილმოწყობა" },
  { id: "price", title: "ფასი და სათაური" },
  { id: "photos", title: "ფოტოები" },
  { id: "review", title: "გადახედვა" },
] as const;

export type DraftStepId = (typeof DRAFT_STEPS)[number]["id"];

/** Amenities a user can set; derived ones (top floor) are calculated, never entered. */
export type EditableAmenityKey = PropertyFeatureKey | ListingEquipmentKey;

/** A photo chosen for local preview only. `url` is a browser object URL; nothing is uploaded. */
export type DraftPhoto = {
  id: string;
  url: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  /** Description for screen readers; a generic one is used when left empty. */
  alt: string;
};

export type ListingDraft = {
  transactionType: TransactionType | null;
  propertyType: PropertyType | null;
  citySlug: string;
  district: string;
  areaSqm: string;
  rooms: string;
  bedrooms: string;
  bathrooms: string;
  floor: string;
  totalFloors: string;
  storeys: string;
  landAreaSqm: string;
  /** Missing keys mean "unknown", exactly as in Property.features and Listing.equipment. */
  amenities: Partial<Record<EditableAmenityKey, AmenityStatus>>;
  /** Original asking price (for rent: per month), in `currency`. Never converted. */
  price: string;
  currency: Currency;
  title: string;
  /** In display order; the first photo is the cover. */
  photos: DraftPhoto[];
};

export type DetailField =
  | "areaSqm"
  | "rooms"
  | "bedrooms"
  | "bathrooms"
  | "floor"
  | "totalFloors"
  | "storeys"
  | "landAreaSqm";

export type DraftTextField = DetailField | "citySlug" | "district" | "price" | "title";

export type DraftField = DraftTextField | "transactionType" | "propertyType" | "photos";

/** Georgian error message per field; only fields with a problem are present. */
export type DraftErrors = Partial<Record<DraftField, string>>;

export const MAX_DISTRICT_LENGTH = 50;
export const MAX_TITLE_LENGTH = 80;
export const MAX_PHOTO_ALT_LENGTH = 150;

export function createEmptyDraft(): ListingDraft {
  return {
    transactionType: null,
    propertyType: null,
    citySlug: "",
    district: "",
    areaSqm: "",
    rooms: "",
    bedrooms: "",
    bathrooms: "",
    floor: "",
    totalFloors: "",
    storeys: "",
    landAreaSqm: "",
    amenities: {},
    price: "",
    // Prices are entered in their original currency; USD is preselected like the display default.
    currency: "USD",
    title: "",
    photos: [],
  };
}

export type DetailFieldSpec = {
  field: DetailField;
  label: string;
  /** Label for private houses when it differs (the house area is not the plot area). */
  houseLabel?: string;
  hint?: string;
  required: boolean;
  integer: boolean;
  min: number;
  max: number;
  /** Property types the field applies to; omitted means every type. */
  appliesTo?: readonly PropertyType[];
};

/** Property detail fields in form order, with their ranges and the types they apply to. */
export const DETAIL_FIELDS: readonly DetailFieldSpec[] = [
  {
    field: "areaSqm",
    label: "ფართი (მ²)",
    houseLabel: "სახლის ფართი (მ²)",
    hint: "მაგ. 65 ან 65.5",
    required: true,
    integer: false,
    min: 5,
    max: 10_000,
  },
  { field: "rooms", label: "ოთახები", required: false, integer: true, min: 1, max: 30 },
  {
    field: "bedrooms",
    label: "საძინებლები",
    hint: "0 — სტუდიო",
    required: false,
    integer: true,
    min: 0,
    max: 30,
  },
  { field: "bathrooms", label: "სველი წერტილები", required: false, integer: true, min: 0, max: 20 },
  {
    field: "floor",
    label: "სართული",
    hint: "სარდაფი: -1",
    required: false,
    integer: true,
    min: -3,
    max: 150,
    appliesTo: ["apartment"],
  },
  {
    field: "totalFloors",
    label: "კორპუსის სართულიანობა",
    required: false,
    integer: true,
    min: 1,
    max: 150,
    appliesTo: ["apartment"],
  },
  {
    field: "storeys",
    label: "სახლის სართულიანობა",
    required: false,
    integer: true,
    min: 1,
    max: 10,
    appliesTo: ["house"],
  },
  {
    field: "landAreaSqm",
    label: "ეზოს ფართი (მ²)",
    required: false,
    integer: false,
    min: 1,
    max: 1_000_000,
    appliesTo: ["house"],
  },
];

/** Detail fields shown for a property type (a house has no floor; an apartment has no yard). */
export function getDetailFields(type: PropertyType): DetailFieldSpec[] {
  return DETAIL_FIELDS.filter(
    (spec) => spec.appliesTo === undefined || spec.appliesTo.includes(type),
  );
}

export function detailFieldLabel(spec: DetailFieldSpec, type: PropertyType | null): string {
  return type === "house" && spec.houseLabel ? spec.houseLabel : spec.label;
}

const OTHER_FIELD_LABELS: Record<Exclude<DraftField, DetailField>, string> = {
  transactionType: "გარიგების ტიპი",
  propertyType: "ქონების ტიპი",
  citySlug: "ქალაქი",
  district: "უბანი",
  price: "ფასი",
  title: "სათაური",
  photos: "ფოტოები",
};

/** Short Georgian name of a field, for example in an error summary. */
export function getDraftFieldLabel(field: DraftField, type: PropertyType | null): string {
  const spec = DETAIL_FIELDS.find((item) => item.field === field);
  return spec
    ? detailFieldLabel(spec, type)
    : OTHER_FIELD_LABELS[field as keyof typeof OTHER_FIELD_LABELS];
}

/** Amenities a user can set for a property type, in display order (derived ones excluded). */
export function getEditableAmenities(type: PropertyType): AmenityDefinition[] {
  return AMENITIES.filter((amenity) => !amenity.derived && amenityAppliesTo(amenity, type));
}

/** Price limits per transaction type. Rent is per month, so its limits are much lower. */
export const PRICE_LIMITS: Record<TransactionType, { min: number; max: number }> = {
  sale: { min: 1_000, max: 100_000_000 },
  rent: { min: 10, max: 100_000 },
};

type NumberResult = { value: number } | { error: string } | { value: null };

const formatLimit = (value: number) => value.toLocaleString("en-US");

/**
 * Parses one typed number with the same rules as the search filters (spaces and thousands
 * commas are ignored), plus an optional minus sign. "65,5" is rejected with a hint, because a
 * comma is read as a thousands separator and would silently become 655.
 */
export function parseDraftNumber(
  raw: string,
  options: { required: boolean; integer: boolean; min: number; max: number },
): NumberResult {
  const text = raw.trim();
  if (text === "") {
    return options.required ? { error: "სავალდებულო ველი." } : { value: null };
  }
  if (/^-?\d+,\d{1,2}$/.test(text)) {
    return { error: "ათწილადისთვის გამოიყენეთ წერტილი, მაგ. 65.5" };
  }
  const negative = text.startsWith("-");
  const parsed = parseNonNegativeNumber(negative ? text.slice(1) : text);
  if (parsed === null) {
    return { error: "შეიყვანეთ რიცხვი." };
  }
  const value = negative ? -parsed : parsed;
  if (options.integer && !Number.isInteger(value)) {
    return { error: "შეიყვანეთ მთელი რიცხვი." };
  }
  if (value < options.min || value > options.max) {
    return { error: `დასაშვებია ${formatLimit(options.min)}–${formatLimit(options.max)}.` };
  }
  return { value };
}

function numberOrNull(result: NumberResult): number | null {
  return "value" in result ? result.value : null;
}

function validateDetails(draft: ListingDraft, errors: DraftErrors): void {
  if (!draft.propertyType) {
    errors.propertyType = "ჯერ აირჩიეთ ქონების ტიპი.";
    return;
  }
  const values: Partial<Record<DetailField, number | null>> = {};
  for (const spec of getDetailFields(draft.propertyType)) {
    const result = parseDraftNumber(draft[spec.field], spec);
    if ("error" in result) {
      errors[spec.field] = result.error;
    } else {
      values[spec.field] = result.value;
    }
  }

  const { rooms, bedrooms, floor, totalFloors } = values;
  if (!errors.bedrooms && rooms != null && bedrooms != null && bedrooms > rooms) {
    errors.bedrooms = "საძინებლების რაოდენობა ოთახების რაოდენობას არ უნდა აღემატებოდეს.";
  }
  if (!errors.floor && floor != null && totalFloors != null && floor > totalFloors) {
    errors.floor = "სართული კორპუსის სართულიანობას არ უნდა აღემატებოდეს.";
  }
}

/** Validates the fields of one step. An empty result means the step is complete. */
export function validateDraftStep(draft: ListingDraft, step: DraftStepId): DraftErrors {
  const errors: DraftErrors = {};
  switch (step) {
    case "transaction":
      if (!draft.transactionType) errors.transactionType = "აირჩიეთ: იყიდება თუ ქირავდება.";
      break;
    case "propertyType":
      if (!draft.propertyType) errors.propertyType = "აირჩიეთ ქონების ტიპი.";
      break;
    case "location": {
      if (!findCityBySlug(draft.citySlug)) errors.citySlug = "აირჩიეთ ქალაქი.";
      const district = draft.district.trim();
      if (district.length < 2) {
        errors.district = "მიუთითეთ უბანი (მინიმუმ 2 სიმბოლო).";
      } else if (district.length > MAX_DISTRICT_LENGTH) {
        errors.district = `უბნის სახელი ${MAX_DISTRICT_LENGTH} სიმბოლოზე მოკლე უნდა იყოს.`;
      }
      break;
    }
    case "details":
      validateDetails(draft, errors);
      break;
    case "amenities":
      // Every amenity may stay "unknown"; nothing is required.
      break;
    case "price": {
      if (!draft.transactionType) {
        errors.transactionType = "ჯერ აირჩიეთ: იყიდება თუ ქირავდება.";
        break;
      }
      const limits = PRICE_LIMITS[draft.transactionType];
      const result = parseDraftNumber(draft.price, { required: true, integer: true, ...limits });
      if ("error" in result) {
        errors.price =
          result.error === "სავალდებულო ველი."
            ? draft.transactionType === "rent"
              ? "მიუთითეთ თვიური ქირა."
              : "მიუთითეთ გასაყიდი ფასი."
            : result.error;
      }
      if (draft.title.trim().length > MAX_TITLE_LENGTH) {
        errors.title = `სათაური ${MAX_TITLE_LENGTH} სიმბოლოზე მოკლე უნდა იყოს.`;
      }
      break;
    }
    case "photos":
      if (draft.photos.some((photo) => photo.alt.trim().length > MAX_PHOTO_ALT_LENGTH)) {
        errors.photos = `ფოტოს აღწერა ${MAX_PHOTO_ALT_LENGTH} სიმბოლოზე მოკლე უნდა იყოს.`;
      }
      break;
    case "review":
      return validateDraft(draft);
    default:
      return assertNever(step);
  }
  return errors;
}

/** All errors of the draft (every step before the review). */
export function validateDraft(draft: ListingDraft): DraftErrors {
  return Object.assign(
    {},
    ...DRAFT_STEPS.filter((step) => step.id !== "review").map((step) =>
      validateDraftStep(draft, step.id),
    ),
  );
}

/** Index of the first step with errors, or null when the whole draft is valid. */
export function findFirstInvalidStep(draft: ListingDraft): number | null {
  const index = DRAFT_STEPS.findIndex(
    (step) => step.id !== "review" && Object.keys(validateDraftStep(draft, step.id)).length > 0,
  );
  return index === -1 ? null : index;
}

/** A neutral title from the entered facts, used when the user leaves the title empty. */
export function suggestDraftTitle(draft: ListingDraft): string {
  if (!draft.transactionType || !draft.propertyType) {
    return "ახალი განცხადება";
  }
  const rooms = parseDraftNumber(draft.rooms, { required: false, integer: true, min: 1, max: 30 });
  const roomCount = numberOrNull(rooms);
  const type = PROPERTY_TYPES[draft.propertyType].label;
  const what = roomCount === null ? type : `${roomCount}-ოთახიანი ${type.toLowerCase()}`;
  const district = draft.district.trim();
  return `${TRANSACTION_TYPES[draft.transactionType].label} ${what}${district ? ` · ${district}` : ""}`;
}

export const DRAFT_PROPERTY_ID = "local-draft-property";
export const DRAFT_LISTING_ID = "local-draft-listing";

/** A detail field's valid value, or undefined when it is empty or invalid. */
export function readDraftNumber(draft: ListingDraft, field: DetailField): number | undefined {
  const spec = DETAIL_FIELDS.find((item) => item.field === field)!;
  return numberOrNull(parseDraftNumber(draft[field], spec)) ?? undefined;
}

/** The valid asking price for the chosen transaction type, or null. */
export function readDraftPrice(draft: ListingDraft): number | null {
  if (!draft.transactionType) return null;
  return numberOrNull(
    parseDraftNumber(draft.price, {
      required: true,
      integer: true,
      ...PRICE_LIMITS[draft.transactionType],
    }),
  );
}

function pickAmenities<K extends EditableAmenityKey>(
  draft: ListingDraft,
  type: PropertyType,
  group: AmenityDefinition["group"],
): Partial<Record<K, AmenityStatus>> {
  const result: Partial<Record<K, AmenityStatus>> = {};
  for (const amenity of getEditableAmenities(type)) {
    const status = draft.amenities[amenity.key as EditableAmenityKey];
    // "unknown" is stored as a missing key, like everywhere else in the data model.
    if (amenity.group === group && status && status !== "unknown") {
      result[amenity.key as K] = status;
    }
  }
  return result;
}

/**
 * Turns a valid draft into the normal Property and Listing types (data source "local-draft"),
 * so the preview reuses the same facts, amenities and pricing code as published demo listings.
 * Fields that do not apply to the chosen property type are left out. Returns null while the
 * draft has errors.
 */
export function buildDraftListing(draft: ListingDraft): ListingWithProperty | null {
  if (findFirstInvalidStep(draft) !== null) {
    return null;
  }
  const city = findCityBySlug(draft.citySlug)!;
  const type = draft.propertyType!;
  const transaction = draft.transactionType!;

  const base = {
    id: DRAFT_PROPERTY_ID,
    city: city.name,
    district: draft.district.trim(),
    // Area level at most: the form never asks for an address or coordinates.
    location: locationFromDistrict(city.name, draft.district),
    areaSqm: readDraftNumber(draft, "areaSqm")!,
    rooms: readDraftNumber(draft, "rooms"),
    bedrooms: readDraftNumber(draft, "bedrooms"),
    bathrooms: readDraftNumber(draft, "bathrooms"),
    features: pickAmenities<PropertyFeatureKey>(draft, type, "property"),
    dataSource: "local-draft" as const,
  };

  let property: Property;
  switch (type) {
    case "apartment":
      property = {
        ...base,
        type,
        floor: readDraftNumber(draft, "floor"),
        totalFloors: readDraftNumber(draft, "totalFloors"),
      };
      break;
    case "house":
      property = {
        ...base,
        type,
        storeys: readDraftNumber(draft, "storeys"),
        landAreaSqm: readDraftNumber(draft, "landAreaSqm"),
      };
      break;
    default:
      return assertNever(type);
  }

  const listingBase = {
    id: DRAFT_LISTING_ID,
    propertyId: DRAFT_PROPERTY_ID,
    title: draft.title.trim() || suggestDraftTitle(draft),
    askingPrice: {
      amount: readDraftPrice(draft)!,
      currency: draft.currency,
    },
    status: "inactive" as const,
    equipment: pickAmenities<ListingEquipmentKey>(draft, type, "listing"),
    dataSource: "local-draft" as const,
  };

  let listing: Listing;
  switch (transaction) {
    case "sale":
      listing = { ...listingBase, transactionType: "sale" };
      break;
    case "rent":
      listing = { ...listingBase, transactionType: "rent", rentPeriod: "month" };
      break;
    default:
      return assertNever(transaction);
  }

  return { listing, property };
}

/** True when the user has entered anything, so leaving the page would lose work. */
export function isDraftDirty(draft: ListingDraft): boolean {
  const empty = createEmptyDraft();
  return (Object.keys(empty) as (keyof ListingDraft)[]).some((key) => {
    if (key === "amenities") return Object.keys(draft.amenities).length > 0;
    if (key === "photos") return draft.photos.length > 0;
    return draft[key] !== empty[key];
  });
}

/**
 * The derived "top floor" characteristic for the entered apartment, with the same rule as
 * published listings (getTopFloorStatus): unknown until both floor and building height are valid.
 */
export function getDraftTopFloorStatus(draft: ListingDraft): AmenityStatus {
  if (draft.propertyType !== "apartment") return "unknown";
  return getTopFloorStatus({
    id: DRAFT_PROPERTY_ID,
    type: "apartment",
    city: "",
    district: "",
    areaSqm: 1,
    floor: readDraftNumber(draft, "floor"),
    totalFloors: readDraftNumber(draft, "totalFloors"),
    dataSource: "local-draft",
  });
}
