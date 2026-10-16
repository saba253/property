import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createRateLimiter } from "@/lib/api/rate-limit";
import type { SqlConnection } from "@/lib/db/sql-client";
import type { PhotoDeps } from "@/lib/photos/photo-service";
import { type PhotoStorage, createLocalPhotoStorage } from "@/lib/photos/storage";

/** Harmless synthetic test images (solid colours), generated in memory. */
export function solidImage(width = 64, height = 48, colour = "#3478D4") {
  return sharp({ create: { width, height, channels: 3, background: colour } });
}

export const jpeg = (width?: number, height?: number) =>
  solidImage(width, height).jpeg().toBuffer();
export const png = (width?: number, height?: number) => solidImage(width, height).png().toBuffer();
export const webp = (width?: number, height?: number) =>
  solidImage(width, height).webp().toBuffer();

/** A JPEG with camera details, a GPS position and "rotate 90°" orientation in its EXIF. */
export function jpegWithGps(width = 60, height = 40) {
  return solidImage(width, height)
    .jpeg()
    .withExif({
      IFD0: { Make: "TestCamMake", Artist: "SecretArtist" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "41/1 43/1 1234/100",
        GPSLongitudeRef: "E",
        GPSLongitude: "44/1 47/1 0/1",
      },
    })
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

/** A temporary storage folder, removed by `cleanup`. */
export async function tempStorage(): Promise<{
  root: string;
  storage: PhotoStorage;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "property-photos-test-"));
  return {
    root,
    storage: createLocalPhotoStorage(root),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export function photoDepsFor(
  db: SqlConnection,
  userId: string | null,
  storage: PhotoStorage,
): PhotoDeps {
  return {
    currentUserId: async () => userId,
    withConnection: (work) => work(db),
    storage,
    // Generous limits for tests; the real limits have their own test.
    limiters: {
      upload: createRateLimiter({ limit: 10_000, windowMs: 60_000 }),
      change: createRateLimiter({ limit: 10_000, windowMs: 60_000 }),
    },
  };
}
