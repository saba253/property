import sharp from "sharp";
import { MAX_PHOTO_BYTES } from "@/lib/listing-draft/draft-photos";

/*
 * Turns an untrusted upload into a safe image. Nothing from the browser is believed: not the file
 * name, not the declared type. Steps:
 * 1. size: 1 byte to MAX_PHOTO_BYTES (10 MB);
 * 2. signature: the first bytes must be JPEG, PNG or WebP (SVG, GIF, TIFF, HEIC, HTML... are
 *    rejected before any decoder runs);
 * 3. header: sharp reads the dimensions without decoding; the decoded format must match the
 *    signature, and width, height and pixel count are limited (decompression bombs);
 * 4. decode + re-encode: the image is decoded (truncated or corrupt data fails), turned upright
 *    from its EXIF orientation, converted to sRGB, reduced to at most MAX_OUTPUT_SIDE pixels on its
 *    long side and written as a fresh WebP. Only pixels survive: EXIF (camera, GPS position, dates),
 *    XMP, IPTC, ICC profiles and comments are not copied (sharp drops metadata unless asked).
 * Only the first frame of an animated PNG/WebP is kept.
 */

export const MAX_INPUT_SIDE = 10_000;
export const MAX_INPUT_PIXELS = 40_000_000;
export const MAX_OUTPUT_SIDE = 2048;
export const OUTPUT_MIME = "image/webp";
const WEBP_QUALITY = 82;

export type ImageRejection = "empty" | "too-large" | "type" | "dimensions" | "corrupt";

export type ProcessedImage = {
  data: Buffer;
  width: number;
  height: number;
  mime: typeof OUTPUT_MIME;
};

export type ProcessResult =
  { ok: true; image: ProcessedImage } | { ok: false; reason: ImageRejection };

type Signature = "jpeg" | "png" | "webp";

/** The image format announced by the file's first bytes, or null. */
export function sniffImageType(bytes: Uint8Array): Signature | null {
  const starts = (offset: number, values: number[]) =>
    bytes.length >= offset + values.length && values.every((v, i) => bytes[offset + i] === v);
  if (starts(0, [0xff, 0xd8, 0xff])) return "jpeg";
  if (starts(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  // "RIFF" <size> "WEBP"
  if (starts(0, [0x52, 0x49, 0x46, 0x46]) && starts(8, [0x57, 0x45, 0x42, 0x50])) return "webp";
  return null;
}

/** sharp refuses images above limitInputPixels already when reading the header. */
const pixelLimitError = (error: unknown) =>
  error instanceof Error && /pixel limit/i.test(error.message);

// Bounded parallelism: decoding large photos uses a lot of memory, so at most two at a time.
const MAX_PARALLEL = 2;
let running = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await work();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

export async function processUpload(bytes: Uint8Array): Promise<ProcessResult> {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, reason: "too-large" };
  const signature = sniffImageType(bytes);
  if (!signature) return { ok: false, reason: "type" };

  return withSlot(async () => {
    const input = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // failOn "warning": truncated or damaged data is an error, not a partly grey image.
    const options = { limitInputPixels: MAX_INPUT_PIXELS, failOn: "warning" as const };
    let width: number;
    let height: number;
    try {
      const meta = await sharp(input, options).metadata();
      if (meta.format !== signature) return { ok: false, reason: "type" };
      width = meta.width ?? 0;
      height = meta.height ?? 0;
    } catch (error) {
      return { ok: false, reason: pixelLimitError(error) ? "dimensions" : "corrupt" };
    }
    if (
      width < 1 ||
      height < 1 ||
      width > MAX_INPUT_SIDE ||
      height > MAX_INPUT_SIDE ||
      width * height > MAX_INPUT_PIXELS
    ) {
      return { ok: false, reason: "dimensions" };
    }
    try {
      const { data, info } = await sharp(input, options)
        .rotate()
        .toColourspace("srgb")
        .resize({
          width: MAX_OUTPUT_SIDE,
          height: MAX_OUTPUT_SIDE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer({ resolveWithObject: true });
      return {
        ok: true,
        image: { data, width: info.width, height: info.height, mime: OUTPUT_MIME },
      };
    } catch (error) {
      // The pixel limit is checked again by the decoder itself.
      return { ok: false, reason: pixelLimitError(error) ? "dimensions" : "corrupt" };
    }
  });
}
