import { cacheLife } from "next/cache";
import { type ExchangeRateState, assessRateFreshness } from "@/lib/currency/exchange-rate";
import { fetchNbgUsdRate } from "@/lib/currency/nbg";

/**
 * Server-side, cached access to the official NBG rate. This is the only file in lib/currency
 * that depends on Next.js; the logic it calls is plain TypeScript and unit tested.
 *
 * - A successful result is cached with the "hours" profile (refreshed in the background about
 *   hourly), which is plenty for a rate NBG publishes once per business day.
 * - A failure is cached briefly (about 5 minutes), so an NBG outage causes at most one retry
 *   every few minutes instead of a slow request on every page view. No rate is invented.
 * - Freshness is judged when the rate is fetched, so it is at most one cache period old.
 */
export async function getExchangeRateState(): Promise<ExchangeRateState> {
  "use cache";

  try {
    const rate = await fetchNbgUsdRate();
    cacheLife("hours");
    return { status: "available", rate, freshness: assessRateFreshness(rate, new Date()) };
  } catch {
    cacheLife({ stale: 60, revalidate: 300, expire: 900 });
    return { status: "unavailable" };
  }
}
