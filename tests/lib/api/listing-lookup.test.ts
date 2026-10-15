import { describe, expect, it } from "vitest";
import {
  MAX_LOOKUP_BODY_BYTES,
  buildLookupResponse,
  parseIdsParam,
  parseLookupBody,
} from "@/lib/api/listing-lookup";
import { clientKey, createRateLimiter } from "@/lib/api/rate-limit";
import { getDemoListingWithProperty } from "@/lib/properties/get-demo-listing";
import { MAX_BATCH_IDS } from "@/lib/repository/listing-repository";

describe("lookup request validation", () => {
  it("accepts 1–100 valid ids and merges duplicates", () => {
    expect(parseLookupBody('{"ids":["demo-listing-1","demo-listing-1","demo-listing-2"]}')).toEqual(
      { ok: true, ids: ["demo-listing-1", "demo-listing-2"] },
    );
    const many = Array.from({ length: MAX_BATCH_IDS }, (_, i) => `l-${i}`);
    expect(parseLookupBody(JSON.stringify({ ids: many })).ok).toBe(true);
  });

  it.each([
    ["not json", "{ids:", "invalid-json"],
    ["an array", "[]", "invalid-body"],
    ["no ids", "{}", "invalid-ids"],
    ["empty ids", '{"ids":[]}', "invalid-ids"],
    ["a number", '{"ids":[1]}', "invalid-ids"],
    ["an injection attempt", '{"ids":["x\' OR 1=1 --"]}', "invalid-ids"],
    ["upper case", '{"ids":["DEMO"]}', "invalid-ids"],
  ])("refuses %s", (_name, body, error) => {
    expect(parseLookupBody(body)).toEqual({ ok: false, error });
  });

  it("refuses too many ids and oversized bodies", () => {
    const many = Array.from({ length: MAX_BATCH_IDS + 1 }, (_, i) => `l-${i}`);
    expect(parseLookupBody(JSON.stringify({ ids: many }))).toEqual({
      ok: false,
      error: "too-many-ids",
    });
    expect(parseLookupBody(" ".repeat(MAX_LOOKUP_BODY_BYTES + 1))).toEqual({
      ok: false,
      error: "too-large",
    });
  });
});

describe("lookup response", () => {
  it("returns active public fields in the requested order and reports the rest as missing", () => {
    const a = getDemoListingWithProperty("demo-listing-3")!;
    const b = getDemoListingWithProperty("demo-listing-9")!;
    const ended = { ...a, listing: { ...a.listing, id: "ended-1", status: "inactive" as const } };
    const response = buildLookupResponse(
      ["demo-listing-9", "ended-1", "demo-listing-3", "gone-1"],
      [b, ended, a],
      { "demo-listing-3": { coverImage: null } },
    );
    expect(response.listings.map((l) => l.id)).toEqual(["demo-listing-9", "demo-listing-3"]);
    expect(response.missing).toEqual(["ended-1", "gone-1"]);
    expect(Object.keys(response.listings[0]).sort()).toEqual(
      ["coverImage", "href", "id", "title", "transactionType"].sort(),
    );
    expect(JSON.stringify(response)).not.toContain("askingPrice");
  });
});

describe("ids in page URLs", () => {
  it("keeps valid, distinct ids up to the limit and ignores everything else", () => {
    expect(parseIdsParam("demo-listing-1,demo-listing-1, bad id,demo-listing-2", 4)).toEqual([
      "demo-listing-1",
      "demo-listing-2",
    ]);
    expect(parseIdsParam("a,b,c,d,e", 4)).toEqual(["a", "b", "c", "d"]);
    expect(parseIdsParam(undefined, 4)).toEqual([]);
    expect(parseIdsParam(["x,y", "z"], 4)).toEqual(["x", "y"]);
    expect(parseIdsParam("a".repeat(10_000), 4)).toEqual([]);
  });
});

describe("rate limiter", () => {
  it("allows the limit per window and reports when to retry", () => {
    let time = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: () => time });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a")).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(limiter.check("b").allowed).toBe(true);
    time = 60_000;
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("keeps memory bounded and reads the proxy address", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0, maxKeys: 2 });
    limiter.check("a");
    limiter.check("b");
    limiter.check("c"); // clears the table instead of growing without limit
    expect(limiter.check("a").allowed).toBe(true);
    expect(clientKey(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe(
      "203.0.113.5",
    );
    expect(clientKey(new Headers())).toBe("local");
  });
});
