/**
 * Picks a stable illustration variant for a seed (for example a listing id), so the same
 * listing always gets the same placeholder illustration. Returns an index in [0, count).
 */
export function pickIllustrationVariant(seed: string, count: number): number {
  if (!Number.isInteger(count) || count <= 0) {
    throw new RangeError("count must be a positive integer.");
  }

  // Small deterministic string hash (djb2). Not for security, only for variety.
  let hash = 5381;
  for (let index = 0; index < seed.length; index++) {
    hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
  }
  return hash % count;
}
