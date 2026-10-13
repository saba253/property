import type { DraftPhoto } from "@/lib/listing-draft/draft";
import { DRAFT_LISTING_ID } from "@/lib/listing-draft/draft";
import { MAX_LISTING_IMAGES } from "@/lib/properties/listing-images";
import type { ListingImage } from "@/lib/properties/types";

/*
 * Photo rules for the local draft preview. Photos are only shown in this browser tab through
 * object URLs; they are never uploaded or saved.
 */

/** Formats every current browser can display. HEIC and others are rejected with a message. */
export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ACCEPTED_PHOTO_EXTENSIONS = ".jpg,.jpeg,.png,.webp";
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_DRAFT_PHOTOS = Math.min(10, MAX_LISTING_IMAGES);

/** The parts of a File that the checks need (plain data, so it is easy to test). */
export type PhotoFileInfo = { name: string; type: string; size: number };

export type PhotoRejectionReason = "type" | "size" | "empty" | "count";

export type PhotoRejection = { name: string; reason: PhotoRejectionReason };

/**
 * Decides which chosen files can be previewed, in their original order: supported type, not
 * empty, at most MAX_PHOTO_BYTES, and no more than MAX_DRAFT_PHOTOS in total.
 */
export function checkPhotoFiles(
  files: readonly PhotoFileInfo[],
  existingCount: number,
): { accepted: number[]; rejected: PhotoRejection[] } {
  const accepted: number[] = [];
  const rejected: PhotoRejection[] = [];
  files.forEach((file, index) => {
    let reason: PhotoRejectionReason | null = null;
    if (!(ACCEPTED_PHOTO_TYPES as readonly string[]).includes(file.type)) reason = "type";
    else if (file.size === 0) reason = "empty";
    else if (file.size > MAX_PHOTO_BYTES) reason = "size";
    else if (existingCount + accepted.length >= MAX_DRAFT_PHOTOS) reason = "count";

    if (reason) rejected.push({ name: file.name, reason });
    else accepted.push(index);
  });
  return { accepted, rejected };
}

/** Georgian explanation of why a file was not added. */
export function describePhotoRejection(rejection: PhotoRejection): string {
  switch (rejection.reason) {
    case "type":
      return `${rejection.name}: ფორმატი არ არის მხარდაჭერილი (მხოლოდ JPG, PNG ან WebP).`;
    case "size":
      return `${rejection.name}: ფაილი 10 მბ-ზე დიდია.`;
    case "empty":
      return `${rejection.name}: ფაილი ცარიელია.`;
    case "count":
      return `${rejection.name}: დასაშვებია მაქსიმუმ ${MAX_DRAFT_PHOTOS} ფოტო.`;
  }
}

/** "2.4 მბ" / "350 კბ", for showing file sizes. */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} მბ`;
  return `${Math.max(1, Math.round(bytes / 1024))} კბ`;
}

/**
 * Draft photos as listing images, so the preview uses the same gallery as published listings.
 * The first photo is the cover; empty descriptions get a generic one.
 */
export function draftPhotosToImages(photos: readonly DraftPhoto[]): ListingImage[] {
  return photos.map((photo, index) => ({
    id: photo.id,
    listingId: DRAFT_LISTING_ID,
    order: index,
    ...(index === 0 ? { isCover: true } : {}),
    alt: photo.alt.trim() || `განცხადების ფოტო ${index + 1}`,
    source: { kind: "photo", src: photo.url },
  }));
}

/** Moves a photo one place left (-1) or right (+1); unchanged at the ends. */
export function movePhoto(photos: readonly DraftPhoto[], id: string, delta: -1 | 1): DraftPhoto[] {
  const index = photos.findIndex((photo) => photo.id === id);
  const target = index + delta;
  if (index === -1 || target < 0 || target >= photos.length) return [...photos];
  const result = [...photos];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}

/** Makes a photo the cover by moving it to the front, keeping the others in order. */
export function makeCoverPhoto(photos: readonly DraftPhoto[], id: string): DraftPhoto[] {
  const photo = photos.find((item) => item.id === id);
  return photo ? [photo, ...photos.filter((item) => item.id !== id)] : [...photos];
}
