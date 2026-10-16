/*
 * Shapes shared by the photo routes and the upload UI (no server code, safe for the browser).
 */

/** One stored draft photo as the owner sees it. */
export type PhotoView = {
  id: string;
  order: number;
  isCover: boolean;
  /** Optional description; "" when none was given. */
  alt: string;
  width: number;
  height: number;
  byteSize: number;
  /** Owner-only URL of the processed image (/api/drafts/<draft>/photos/<photo>). */
  url: string;
};

/** The owner-only URL of a stored draft photo. */
export function photoUrl(draftId: string, photoId: string): string {
  return `/api/drafts/${draftId}/photos/${photoId}`;
}

/** Georgian messages for the error codes the photo routes return. */
export const PHOTO_ERRORS: Record<string, string> = {
  unauthenticated: "სესია დასრულდა. შედით ანგარიშში და სცადეთ თავიდან.",
  "not-found": "დრაფტი ან ფოტო ვერ მოიძებნა.",
  "rate-limited": "ძალიან ბევრი მოთხოვნა მოკლე დროში. სცადეთ რამდენიმე წუთში.",
  limit: "დრაფტს უკვე აქვს მაქსიმუმ 10 ფოტო.",
  empty: "ფაილი ცარიელია.",
  "too-large": "ფაილი 10 მბ-ზე დიდია.",
  type: "ეს არ არის JPG, PNG ან WebP სურათი.",
  dimensions: "სურათის ზომა ძალიან დიდია (მაქს. 10 000 პიქსელი გვერდზე, 40 მეგაპიქსელი).",
  corrupt: "ფაილი დაზიანებულია ან ვერ წაიკითხება.",
  invalid: "მოთხოვნა არასწორია. განაახლეთ გვერდი და სცადეთ თავიდან.",
  forbidden: "მოთხოვნა უარყოფილია. განაახლეთ გვერდი და სცადეთ თავიდან.",
  unavailable: "შენახვა ახლა ვერ მოხერხდა. სცადეთ ცოტა ხანში.",
  network: "კავშირი გაწყდა. შეამოწმეთ ინტერნეტი და სცადეთ თავიდან.",
};

export function photoErrorMessage(code: string | null | undefined): string {
  return PHOTO_ERRORS[code ?? ""] ?? PHOTO_ERRORS.unavailable;
}
