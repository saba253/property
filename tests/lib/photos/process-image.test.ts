import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES } from "@/lib/listing-draft/draft-photos";
import { MAX_OUTPUT_SIDE, processUpload, sniffImageType } from "@/lib/photos/process-image";
import { jpeg, jpegWithGps, png, solidImage, webp } from "./photo-fixtures";

// Real decoding with sharp on synthetic images; no network, no files.

async function accepted(bytes: Uint8Array) {
  const result = await processUpload(bytes);
  if (!result.ok) throw new Error(`rejected: ${result.reason}`);
  return result.image;
}

describe("accepted formats", () => {
  it.each([
    ["JPEG", jpeg],
    ["PNG", png],
    ["WebP", webp],
  ])("re-encodes a %s as WebP with its dimensions", async (_name, make) => {
    const image = await accepted(await make(64, 48));
    expect(image.mime).toBe("image/webp");
    expect(sniffImageType(image.data)).toBe("webp");
    expect((await sharp(image.data).metadata()).format).toBe("webp");
    expect([image.width, image.height]).toEqual([64, 48]);
  });

  it("reduces large photos to at most 2048 px on the long side, never enlarging small ones", async () => {
    const big = await accepted(await jpeg(4000, 3000));
    expect([big.width, big.height]).toEqual([MAX_OUTPUT_SIDE, 1536]);
    const small = await accepted(await png(20, 10));
    expect([small.width, small.height]).toEqual([20, 10]);
  });

  it("keeps only the first frame of an animated image", async () => {
    const frames = await sharp({
      create: { width: 16, height: 32, channels: 3, background: "#172B46" },
    })
      .webp({ loop: 0 })
      .toBuffer();
    const image = await accepted(frames);
    expect(image.height).toBe(32);
  });
});

describe("metadata removal", () => {
  it("removes EXIF (camera, GPS) and applies the orientation", async () => {
    const input = await jpegWithGps(60, 40);
    const before = await sharp(input).metadata();
    expect(before.orientation).toBe(6);
    expect(before.exif?.length).toBeGreaterThan(0);
    expect(input.includes("TestCamMake")).toBe(true);

    const image = await accepted(input);
    const after = await sharp(image.data).metadata();
    expect(after.exif).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(after.icc).toBeUndefined();
    expect(after.orientation).toBeUndefined();
    expect(image.data.includes("TestCamMake")).toBe(false);
    expect(image.data.includes("SecretArtist")).toBe(false);
    // Rotated upright: the 60x40 landscape with "rotate 90°" becomes 40x60.
    expect([image.width, image.height]).toEqual([40, 60]);
  });
});

describe("rejected uploads", () => {
  it("rejects empty and oversized input before decoding", async () => {
    expect(await processUpload(new Uint8Array(0))).toEqual({ ok: false, reason: "empty" });
    const oversized = new Uint8Array(MAX_PHOTO_BYTES + 1);
    oversized.set([0xff, 0xd8, 0xff]);
    expect(await processUpload(oversized)).toEqual({ ok: false, reason: "too-large" });
  });

  it("rejects other content even when it would be named .jpg", async () => {
    const samples = [
      new TextEncoder().encode("<html><script>alert(1)</script></html>"),
      new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      await solidImage(8, 8).gif().toBuffer(),
      await solidImage(8, 8).tiff().toBuffer(),
      new TextEncoder().encode("%PDF-1.7 fake"),
    ];
    for (const sample of samples) {
      expect(await processUpload(sample)).toEqual({ ok: false, reason: "type" });
    }
  });

  it("rejects a file whose signature and real format disagree", async () => {
    // A PNG body behind a JPEG signature.
    const pngBytes = await png(8, 8);
    const disguised = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), pngBytes]);
    const result = await processUpload(disguised);
    expect(result.ok).toBe(false);
  });

  it("rejects truncated and corrupt images", async () => {
    const full = await jpeg(200, 150);
    const truncated = full.subarray(0, Math.floor(full.length / 2));
    expect(await processUpload(truncated)).toMatchObject({ ok: false });
    const garbage = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(500, 7)]);
    expect(await processUpload(garbage)).toEqual({ ok: false, reason: "corrupt" });
  });

  it("rejects excessive dimensions and pixel counts (decompression bombs)", async () => {
    // Tiny files that decode to huge images.
    const wide = await solidImage(12_000, 10).png({ compressionLevel: 9 }).toBuffer();
    expect(await processUpload(wide)).toEqual({ ok: false, reason: "dimensions" });
    const manyPixels = await solidImage(7_000, 7_000).png({ compressionLevel: 9 }).toBuffer();
    expect(manyPixels.length).toBeLessThan(MAX_PHOTO_BYTES);
    expect(await processUpload(manyPixels)).toEqual({ ok: false, reason: "dimensions" });
  });
});
