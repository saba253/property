/** Date and time in Tbilisi, e.g. "16.10.2026, 14:05" (Georgian locale). */
export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("ka-GE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tbilisi",
  }).format(new Date(iso));
}

/** Remaining claim time in whole minutes, at least 1 while it has not expired. */
export function minutesLeft(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}
