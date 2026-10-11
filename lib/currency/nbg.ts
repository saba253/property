import { type ExchangeRate, parseNbgUsdRate } from "@/lib/currency/exchange-rate";

/** Official, free National Bank of Georgia endpoint. No API key is needed. */
export const NBG_USD_RATE_URL =
  "https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/en/json/?currencies=USD";

export const NBG_REQUEST_TIMEOUT_MS = 5000;

export class ExchangeRateUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ExchangeRateUnavailableError";
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Fetches and validates the official USD rate. Throws ExchangeRateUnavailableError on network
 * errors, timeouts, non-OK responses, invalid JSON, or an unexpected response shape.
 */
export async function fetchNbgUsdRate(
  fetchImpl: FetchLike = fetch,
  timeoutMs: number = NBG_REQUEST_TIMEOUT_MS,
): Promise<ExchangeRate> {
  let response: Response;
  try {
    response = await fetchImpl(NBG_USD_RATE_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new ExchangeRateUnavailableError("NBG request failed.", { cause: error });
  }

  if (!response.ok) {
    throw new ExchangeRateUnavailableError(`NBG responded with HTTP ${response.status}.`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (error) {
    throw new ExchangeRateUnavailableError("NBG response was not valid JSON.", { cause: error });
  }

  const rate = parseNbgUsdRate(json);
  if (!rate) {
    throw new ExchangeRateUnavailableError("NBG response did not contain a valid USD rate.");
  }
  return rate;
}
