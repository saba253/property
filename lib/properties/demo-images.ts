import type { IllustrationScene, ListingImage } from "@/lib/properties/types";

// DEMO DATA ONLY. Every demo image is an original illustration drawn in the app (see
// components/gallery/illustration-scenes.tsx). None of them is a photo, and none depicts a real
// property. They are labelled "ილუსტრაცია" wherever they appear.

const SCENE_TEXT: Record<IllustrationScene, string> = {
  "building-exterior": "საცხოვრებელი კორპუსის ფასადი",
  "house-exterior": "კერძო სახლის ფასადი",
  "living-room": "მისაღები ოთახი",
  kitchen: "სამზარეულო",
  bedroom: "საძინებელი",
  bathroom: "სააბაზანო",
  "balcony-view": "ხედი აივნიდან",
  yard: "ეზო",
};

/**
 * Builds a listing's illustrated images in the given order. `coverIndex` marks a cover that is
 * not the first image (to exercise explicit cover selection); otherwise the first is the cover.
 */
function illustrated(
  listingId: string,
  place: string,
  scenes: readonly IllustrationScene[],
  coverIndex?: number,
): ListingImage[] {
  return scenes.map((scene, index) => ({
    id: `${listingId}-image-${index + 1}`,
    listingId,
    order: index,
    ...(index === coverIndex ? { isCover: true } : {}),
    alt: `ილუსტრაცია: ${SCENE_TEXT[scene]} (${place}). არა რეალური ფოტო.`,
    caption: SCENE_TEXT[scene],
    source: { kind: "illustration", scene },
  }));
}

/**
 * Demo images, as a separate collection keyed by listing id. demo-listing-8 deliberately has no
 * images, and demo-listing-10 has just one, to show the fallbacks.
 */
export const demoListingImages: readonly ListingImage[] = [
  ...illustrated("demo-listing-1", "დემო ბინა ვაკეში", [
    "building-exterior",
    "living-room",
    "kitchen",
    "bedroom",
    "bathroom",
    "balcony-view",
  ]),
  ...illustrated("demo-listing-2", "დემო ბინა ძველ ბათუმში", [
    "building-exterior",
    "balcony-view",
    "living-room",
    "bedroom",
  ]),
  // The living room is the cover although it is not the first image by order.
  ...illustrated(
    "demo-listing-3",
    "დემო ბინა საბურთალოზე",
    ["building-exterior", "living-room", "kitchen", "bedroom", "bathroom"],
    1,
  ),
  ...illustrated("demo-listing-4", "დემო ბინა ისანში", ["building-exterior", "kitchen", "bedroom"]),
  ...illustrated("demo-listing-5", "დემო სტუდიო ახალ ბულვარზე", [
    "building-exterior",
    "living-room",
    "bathroom",
  ]),
  ...illustrated("demo-listing-6", "დემო ბინა ბონი-გოროდოკში", [
    "building-exterior",
    "living-room",
    "kitchen",
    "bedroom",
    "bathroom",
    "balcony-view",
  ]),
  ...illustrated("demo-listing-7", "დემო სახლი დიღომში", [
    "house-exterior",
    "yard",
    "living-room",
    "kitchen",
    "bedroom",
  ]),
  ...illustrated("demo-listing-9", "დემო ბინა ვაკეში, ქირით", [
    "building-exterior",
    "living-room",
    "bedroom",
    "kitchen",
  ]),
  ...illustrated("demo-listing-10", "დემო ბინა ახალ ბულვარზე, ქირით", ["building-exterior"]),
  ...illustrated("demo-listing-11", "დემო სახლი წყნეთში, ქირით", [
    "house-exterior",
    "yard",
    "living-room",
    "bedroom",
  ]),
];
