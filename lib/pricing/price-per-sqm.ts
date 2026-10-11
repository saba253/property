/**
 * Calculates the asking price per square metre.
 *
 * - Works for any currency (USD, GEL, ...) because it does no currency conversion.
 *   The caller is responsible for keeping track of which currency the price is in.
 * - This is a simple arithmetic helper for ASKING prices. It is not a verified
 *   transaction price and not a statement of fair value.
 * - The result is rounded to 2 decimal places.
 *
 * @param askingPrice - The advertised price. Must be a finite number greater than 0.
 * @param areaSqm - The area in square metres. Must be a finite number greater than 0.
 * @throws RangeError if either input is not a finite number greater than 0.
 */
export function calculateAskingPricePerSqm(askingPrice: number, areaSqm: number): number {
  if (!Number.isFinite(askingPrice) || askingPrice <= 0) {
    throw new RangeError("askingPrice must be a finite number greater than 0.");
  }

  if (!Number.isFinite(areaSqm) || areaSqm <= 0) {
    throw new RangeError("areaSqm must be a finite number greater than 0.");
  }

  return Math.round((askingPrice / areaSqm) * 100) / 100;
}
