import { describe, expect, it } from "vitest";
import type { DraftPhoto } from "@/lib/listing-draft/draft";
import {
  MAX_DRAFT_PHOTOS,
  MAX_PHOTO_BYTES,
  checkPhotoFiles,
  describePhotoRejection,
  draftPhotosToImages,
  formatFileSize,
  makeCoverPhoto,
  movePhoto,
} from "@/lib/listing-draft/draft-photos";
import {
  MAX_LISTING_IMAGES,
  findListingImageIssues,
  selectCoverImage,
} from "@/lib/properties/listing-images";

const jpg = (name: string, size = 1000) => ({ name, type: "image/jpeg", size });

function photo(id: string, alt = ""): DraftPhoto {
  return {
    id,
    url: `blob:${id}`,
    fileName: `${id}.jpg`,
    sizeBytes: 1000,
    mimeType: "image/jpeg",
    alt,
  };
}

describe("checkPhotoFiles", () => {
  it("accepts JPG, PNG and WebP files within the size limit", () => {
    const files = [
      jpg("a.jpg"),
      { name: "b.png", type: "image/png", size: 5 },
      { name: "c.webp", type: "image/webp", size: MAX_PHOTO_BYTES },
    ];
    expect(checkPhotoFiles(files, 0)).toEqual({ accepted: [0, 1, 2], rejected: [] });
  });

  it("rejects unsupported types, empty files and files that are too large", () => {
    const files = [
      { name: "a.heic", type: "image/heic", size: 100 },
      { name: "b.txt", type: "text/plain", size: 100 },
      jpg("c.jpg", 0),
      jpg("d.jpg", MAX_PHOTO_BYTES + 1),
    ];
    expect(checkPhotoFiles(files, 0).rejected).toEqual([
      { name: "a.heic", reason: "type" },
      { name: "b.txt", reason: "type" },
      { name: "c.jpg", reason: "empty" },
      { name: "d.jpg", reason: "size" },
    ]);
  });

  it("stops at the photo limit, counting photos already chosen", () => {
    const result = checkPhotoFiles(
      [jpg("a.jpg"), jpg("b.jpg"), jpg("c.jpg")],
      MAX_DRAFT_PHOTOS - 1,
    );
    expect(result.accepted).toEqual([0]);
    expect(result.rejected).toEqual([
      { name: "b.jpg", reason: "count" },
      { name: "c.jpg", reason: "count" },
    ]);
  });

  it("keeps the draft limit within the listing image limit", () => {
    expect(MAX_DRAFT_PHOTOS).toBeLessThanOrEqual(MAX_LISTING_IMAGES);
  });
});

describe("describePhotoRejection", () => {
  it("explains each reason in Georgian with the file name", () => {
    expect(describePhotoRejection({ name: "x.heic", reason: "type" })).toContain("x.heic");
    expect(describePhotoRejection({ name: "x.jpg", reason: "size" })).toContain("10 მბ");
    expect(describePhotoRejection({ name: "x.jpg", reason: "count" })).toContain(
      String(MAX_DRAFT_PHOTOS),
    );
  });
});

describe("formatFileSize", () => {
  it("formats kilobytes and megabytes", () => {
    expect(formatFileSize(350 * 1024)).toBe("350 კბ");
    expect(formatFileSize(2.4 * 1024 * 1024)).toBe("2.4 მბ");
    expect(formatFileSize(10)).toBe("1 კბ");
  });
});

describe("photo ordering", () => {
  const ids = (photos: readonly DraftPhoto[]) => photos.map((item) => item.id);

  it("moves a photo one place and ignores moves past the ends", () => {
    const photos = [photo("a"), photo("b"), photo("c")];
    expect(ids(movePhoto(photos, "b", -1))).toEqual(["b", "a", "c"]);
    expect(ids(movePhoto(photos, "b", 1))).toEqual(["a", "c", "b"]);
    expect(ids(movePhoto(photos, "a", -1))).toEqual(["a", "b", "c"]);
    expect(ids(movePhoto(photos, "missing", 1))).toEqual(["a", "b", "c"]);
  });

  it("makes a photo the cover by moving it to the front", () => {
    expect(ids(makeCoverPhoto([photo("a"), photo("b"), photo("c")], "c"))).toEqual(["c", "a", "b"]);
  });
});

describe("draftPhotosToImages", () => {
  it("creates valid listing images with the first photo as cover and fallback alt text", () => {
    const images = draftPhotosToImages([photo("a", " მისაღები "), photo("b")]);
    expect(findListingImageIssues(images)).toEqual([]);
    expect(selectCoverImage(images)?.id).toBe("a");
    expect(images.map((image) => image.alt)).toEqual(["მისაღები", "განცხადების ფოტო 2"]);
    expect(images[1].source).toEqual({ kind: "photo", src: "blob:b" });
  });

  it("is empty without photos", () => {
    expect(draftPhotosToImages([])).toEqual([]);
  });
});
