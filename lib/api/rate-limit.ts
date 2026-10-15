/*
 * A small fixed-window rate limiter for the read-only lookup endpoint. It runs per server process,
 * so it only slows down obvious abuse; a production deployment should add rate limiting at the
 * edge (hosting platform or proxy) as well.
 */
export type RateLimiter = {
  check(key: string): { allowed: boolean; retryAfterSeconds: number };
};

export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
  maxKeys = 10_000,
}: {
  limit: number;
  windowMs: number;
  now?: () => number;
  maxKeys?: number;
}): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    check(key) {
      const time = now();
      let entry = windows.get(key);
      if (!entry || time - entry.start >= windowMs) {
        // Bounded memory: forget all windows when there are too many keys.
        if (!entry && windows.size >= maxKeys) windows.clear();
        entry = { start: time, count: 0 };
        windows.set(key, entry);
      }
      entry.count++;
      const allowed = entry.count <= limit;
      const retryAfterSeconds = allowed ? 0 : Math.ceil((entry.start + windowMs - time) / 1000);
      return { allowed, retryAfterSeconds };
    },
  };
}

/** The client address as reported by the hosting proxy, or "local" in development. */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "local";
}
