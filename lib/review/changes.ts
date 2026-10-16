/*
 * Fields compared between two submissions of a listing (change summary for moderators). Only
 * the field names and Georgian labels; the fingerprints themselves are made on the server
 * (lib/review/fingerprints.ts). No server code: safe for the browser.
 */

export const CHANGE_FIELDS = [
  "transactionType",
  "propertyType",
  "citySlug",
  "district",
  "areaSqm",
  "rooms",
  "bedrooms",
  "bathrooms",
  "floor",
  "totalFloors",
  "storeys",
  "landAreaSqm",
  "amenities",
  "price",
  "currency",
  "title",
  "photos",
  "photoOrder",
  "photoDescriptions",
] as const;
export type ChangeField = (typeof CHANGE_FIELDS)[number];

export const CHANGE_LABELS: Record<ChangeField, string> = {
  transactionType: "გარიგების ტიპი",
  propertyType: "ქონების ტიპი",
  citySlug: "ქალაქი",
  district: "უბანი",
  areaSqm: "ფართი",
  rooms: "ოთახები",
  bedrooms: "საძინებლები",
  bathrooms: "სააბაზანოები",
  floor: "სართული",
  totalFloors: "სართულები შენობაში",
  storeys: "სართულიანობა",
  landAreaSqm: "ეზოს ფართი",
  amenities: "კეთილმოწყობა",
  price: "ფასი",
  currency: "ვალუტა",
  title: "სათაური",
  photos: "ფოტოები (დამატება/წაშლა)",
  photoOrder: "ფოტოების რიგი ან მთავარი ფოტო",
  photoDescriptions: "ფოტოების აღწერა",
};

export function isChangeField(value: unknown): value is ChangeField {
  return (CHANGE_FIELDS as readonly unknown[]).includes(value);
}
