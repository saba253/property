import { describe, expect, it } from "vitest";
import { demoListings, demoProperties } from "@/lib/properties/demo-data";
import { demoListingImages } from "@/lib/properties/demo-images";
import { getDemoListingCover, getDemoListingImages } from "@/lib/properties/get-demo-listing";
import {
  MAX_LISTING_IMAGES,
  findListingImageIssues,
  formatImageCount,
  formatImagePosition,
  getGalleryOrder,
  getImagesForListing,
  isIllustration,
  selectCoverImage,
  sortImagesByOrder,
  stepImageIndex,
} from "@/lib/properties/listing-images";
import type { ListingImage } from "@/lib/properties/types";

function image(id: string, order: number, extra: Partial<ListingImage> = {}): ListingImage {
  return {
    id,
    listingId: "listing-a",
    order,
    alt: `ilustracia ${id}`,
    source: { kind: "illustration", scene: "living-room" },
    ...extra,
  };
}

const ids = (images: readonly ListingImage[]) => images.map((item) => item.id);

describe("sortImagesByOrder", () => {
  it("sorts by order and breaks ties by id, independent of input order", () => {
    const images = [image("c", 2), image("b", 1), image("a", 1), image("d", 0)];
    expect(ids(sortImagesByOrder(images))).toEqual(["d", "a", "b", "c"]);
    expect(ids(sortImagesByOrder([...images].reverse()))).toEqual(["d", "a", "b", "c"]);
  });

  it("does not mutate the input", () => {
    const images = [image("b", 1), image("a", 0)];
    sortImagesByOrder(images);
    expect(ids(images)).toEqual(["b", "a"]);
  });
});

describe("selectCoverImage", () => {
  it("returns null when there are no images", () => {
    expect(selectCoverImage([])).toBeNull();
  });

  it("uses the first image by order when no cover is marked", () => {
    expect(selectCoverImage([image("b", 1), image("a", 0)])?.id).toBe("a");
  });

  it("prefers the image marked as cover", () => {
    expect(selectCoverImage([image("a", 0), image("b", 3, { isCover: true })])?.id).toBe("b");
  });

  it("picks the first marked cover by order if several are marked by mistake", () => {
    const images = [image("x", 5, { isCover: true }), image("y", 2, { isCover: true })];
    expect(selectCoverImage(images)?.id).toBe("y");
  });
});

describe("getGalleryOrder", () => {
  it("puts the cover first and keeps the others in order", () => {
    const images = [image("a", 0), image("b", 1), image("c", 2, { isCover: true }), image("d", 3)];
    expect(ids(getGalleryOrder(images))).toEqual(["c", "a", "b", "d"]);
  });

  it("is empty without images", () => {
    expect(getGalleryOrder([])).toEqual([]);
  });
});

describe("getImagesForListing", () => {
  it("returns only that listing's images, in gallery order", () => {
    const images = [image("a2", 1), image("b1", 0, { listingId: "listing-b" }), image("a1", 0)];
    expect(ids(getImagesForListing("listing-a", images))).toEqual(["a1", "a2"]);
    expect(getImagesForListing("missing", images)).toEqual([]);
  });

  it("lets two listings of the same property have different image sets", () => {
    // Images belong to listings: an older and a newer offer of one property keep their own.
    const images = [
      image("old-1", 0, { listingId: "old-offer" }),
      image("new-1", 0, { listingId: "new-offer" }),
      image("new-2", 1, { listingId: "new-offer" }),
    ];
    expect(ids(getImagesForListing("old-offer", images))).toEqual(["old-1"]);
    expect(ids(getImagesForListing("new-offer", images))).toEqual(["new-1", "new-2"]);
  });
});

describe("findListingImageIssues", () => {
  it("accepts a valid collection", () => {
    expect(findListingImageIssues([image("a", 0), image("b", 1, { isCover: true })])).toEqual([]);
  });

  it("reports duplicate ids, missing alt text and invalid order values", () => {
    const issues = findListingImageIssues([
      image("a", 0),
      image("a", 1),
      image("b", -1, { alt: "  " }),
      image("c", 1.5),
    ]);
    expect(issues).toEqual([
      { code: "duplicate-id", imageId: "a" },
      { code: "missing-alt", imageId: "b" },
      { code: "invalid-order", imageId: "b" },
      { code: "invalid-order", imageId: "c" },
    ]);
  });

  it("reports several covers, too many images and unknown listings", () => {
    const many = Array.from({ length: MAX_LISTING_IMAGES + 1 }, (_, index) =>
      image(`m${index}`, index, { listingId: "big" }),
    );
    const issues = findListingImageIssues(
      [image("a", 0, { isCover: true }), image("b", 1, { isCover: true }), ...many],
      ["listing-a"],
    );
    expect(issues).toContainEqual({ code: "multiple-covers", listingId: "listing-a" });
    expect(issues).toContainEqual({ code: "too-many-images", listingId: "big" });
    expect(issues).toContainEqual({ code: "unknown-listing", imageId: "m0" });
  });
});

describe("viewer helpers", () => {
  it("wraps previous/next navigation around both ends", () => {
    expect(stepImageIndex(0, 1, 3)).toBe(1);
    expect(stepImageIndex(2, 1, 3)).toBe(0);
    expect(stepImageIndex(0, -1, 3)).toBe(2);
    expect(stepImageIndex(0, 1, 1)).toBe(0);
    expect(stepImageIndex(4, 1, 0)).toBe(0);
  });

  it("formats positions and counts in Georgian", () => {
    expect(formatImagePosition(0, 6)).toBe("1 / 6");
    expect(formatImageCount(6)).toBe("6 სურათი");
    expect(formatImageCount(0)).toBe("სურათები არ არის დამატებული");
  });

  it("recognizes illustrations, which must be labelled as such", () => {
    expect(isIllustration(image("a", 0))).toBe(true);
    expect(isIllustration(image("p", 0, { source: { kind: "photo", src: "blob:x" } }))).toBe(false);
  });
});

describe("demo images", () => {
  it("are a valid collection that only refers to existing listings", () => {
    expect(
      findListingImageIssues(
        demoListingImages,
        demoListings.map((listing) => listing.id),
      ),
    ).toEqual([]);
  });

  it("are all original illustrations with descriptive alt text that says so", () => {
    for (const item of demoListingImages) {
      expect(isIllustration(item)).toBe(true);
      expect(item.alt).toMatch(/^ილუსტრაცია: /);
      expect(item.alt).toContain("არა რეალური ფოტო");
    }
  });

  it("include a listing without images and one with a single image (fallbacks)", () => {
    expect(getDemoListingImages("demo-listing-8")).toEqual([]);
    expect(getDemoListingCover("demo-listing-8")).toEqual({ coverImage: null, imageCount: 0 });
    expect(getDemoListingImages("demo-listing-10")).toHaveLength(1);
  });

  it("use an explicitly marked cover when it is not the first image", () => {
    const images = getDemoListingImages("demo-listing-3");
    expect(images[0].isCover).toBe(true);
    expect(images[0].source).toEqual({ kind: "illustration", scene: "living-room" });
    expect(getDemoListingCover("demo-listing-3").coverImage?.id).toBe(images[0].id);
  });

  it("show house scenes only for houses and apartment scenes only for apartments", () => {
    const houseListings = new Set(
      demoListings
        .filter(
          (listing) =>
            demoProperties.find((property) => property.id === listing.propertyId)?.type === "house",
        )
        .map((listing) => listing.id),
    );
    expect(houseListings.size).toBeGreaterThan(0);
    for (const item of demoListingImages) {
      if (item.source.kind !== "illustration") continue;
      if (item.source.scene === "house-exterior" || item.source.scene === "yard") {
        expect(houseListings.has(item.listingId)).toBe(true);
      }
      if (item.source.scene === "building-exterior" || item.source.scene === "balcony-view") {
        expect(houseListings.has(item.listingId)).toBe(false);
      }
    }
  });
});
