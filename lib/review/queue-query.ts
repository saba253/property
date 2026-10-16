/** URL query for the review queue filters (city slug, property type), plus extra values. */
export function queueQuery(
  filters: { city?: string; propertyType?: string },
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams(extra);
  if (filters.city) params.set("city", filters.city);
  if (filters.propertyType) params.set("type", filters.propertyType);
  const text = params.toString();
  return text ? `?${text}` : "";
}
