import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/lib/repository/memory-repository";

// The route reads through lib/data/listings (Next.js caching, server-only). Here it is backed by
// the memory repository directly, or made to fail, to test the HTTP behaviour.
const repository = createMemoryRepository();
const failing = { value: false };
vi.mock("@/lib/data/listings", () => ({
  getListingsByIds: async (ids: string[]) => {
    if (failing.value) throw new Error("connect ECONNREFUSED 10.0.0.5:5432 password=secret");
    return repository.getListingsByIds(ids);
  },
  getListingCoversUncached: (ids: string[]) => repository.getListingCovers(ids),
}));

const { POST } = await import("@/app/api/listings/summaries/route");

let ip = 0;
function request(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/listings/summaries", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // A different address per test, so the rate limit test is isolated.
      "x-forwarded-for": `192.0.2.${ip}`,
      ...headers,
    },
    body,
  });
}

beforeEach(() => {
  ip++;
  failing.value = false;
});

describe("POST /api/listings/summaries", () => {
  it("returns public summaries in order and lists missing ids", async () => {
    const response = await POST(
      request(JSON.stringify({ ids: ["demo-listing-9", "nope-1", "demo-listing-3"] })),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const data = await response.json();
    expect(data.listings.map((l: { id: string }) => l.id)).toEqual([
      "demo-listing-9",
      "demo-listing-3",
    ]);
    expect(data.listings[0]).toMatchObject({
      transactionType: "rent",
      href: "/properties/demo-listing-9",
    });
    expect(data.missing).toEqual(["nope-1"]);
  });

  it("validates the input", async () => {
    expect((await POST(request("{bad"))).status).toBe(400);
    expect((await POST(request('{"ids":["DROP TABLE"]}'))).status).toBe(400);
    const tooMany = JSON.stringify({ ids: Array.from({ length: 101 }, (_, i) => `l-${i}`) });
    expect((await POST(request(tooMany))).status).toBe(400);
    expect((await POST(request("x".repeat(9000)))).status).toBe(413);
    expect((await POST(request("{}", { "content-length": "999999" }))).status).toBe(413);
    expect((await POST(request('{"ids":["a"]}', { "content-type": "text/plain" }))).status).toBe(
      415,
    );
  });

  it("rate-limits one address", async () => {
    const body = JSON.stringify({ ids: ["demo-listing-1"] });
    const statuses = [];
    for (let i = 0; i < 61; i++) statuses.push((await POST(request(body))).status);
    expect(statuses.slice(0, 60).every((status) => status === 200)).toBe(true);
    const limited = await POST(request(body));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("answers a database failure with a generic 503, without details", async () => {
    failing.value = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(request(JSON.stringify({ ids: ["demo-listing-1"] })));
    spy.mockRestore();
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toBe('{"error":"unavailable"}');
  });
});
