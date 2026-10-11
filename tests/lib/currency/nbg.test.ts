import { describe, expect, it, vi } from "vitest";
import {
  ExchangeRateUnavailableError,
  NBG_USD_RATE_URL,
  fetchNbgUsdRate,
} from "@/lib/currency/nbg";

const validBody = [
  {
    date: "2026-10-10T00:00:00.000Z",
    currencies: [
      {
        code: "USD",
        quantity: 1,
        rate: 2.6005,
        date: "2026-10-09T17:01:01.779Z",
        validFromDate: "2026-10-10T00:00:00.000Z",
      },
    ],
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchNbgUsdRate", () => {
  it("requests the official NBG endpoint and returns the parsed rate", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(validBody));
    const rate = await fetchNbgUsdRate(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(NBG_USD_RATE_URL, expect.any(Object));
    expect(rate).toMatchObject({ source: "nbg", gelPerUsd: 2.6005, effectiveDate: "2026-10-10" });
  });

  it("throws on a network error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(fetchNbgUsdRate(fetchImpl)).rejects.toBeInstanceOf(ExchangeRateUnavailableError);
  });

  it("throws on a timeout", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    await expect(fetchNbgUsdRate(fetchImpl, 10)).rejects.toBeInstanceOf(
      ExchangeRateUnavailableError,
    );
  });

  it("throws on a non-OK HTTP status", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "down" }, 503));
    await expect(fetchNbgUsdRate(fetchImpl)).rejects.toThrow("HTTP 503");
  });

  it("throws on invalid JSON", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>maintenance</html>", { status: 200 }));
    await expect(fetchNbgUsdRate(fetchImpl)).rejects.toBeInstanceOf(ExchangeRateUnavailableError);
  });

  it("throws on an unexpected response shape", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([{ currencies: [{ code: "EUR" }] }]));
    await expect(fetchNbgUsdRate(fetchImpl)).rejects.toThrow("valid USD rate");
  });
});
