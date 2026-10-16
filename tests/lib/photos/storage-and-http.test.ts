import { readdir } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BodyTooLargeError, isSameOrigin, readLimitedBody, statusFor } from "@/lib/photos/http";
import {
  createLocalPhotoStorage,
  isStorageKey,
  newStorageKey,
  resolvePhotoStorageRoot,
} from "@/lib/photos/storage";
import { tempStorage } from "./photo-fixtures";

let cleanup: (() => Promise<void>) | null = null;
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

async function allFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).map((e) => e.name);
}

describe("local photo storage", () => {
  it("generates random 128-bit keys", () => {
    const keys = new Set(Array.from({ length: 200 }, newStorageKey));
    expect(keys.size).toBe(200);
    for (const key of keys) expect(isStorageKey(key)).toBe(true);
  });

  it("stores, reads and deletes by key, and keeps files for a new instance (restart)", async () => {
    const temp = await tempStorage();
    cleanup = temp.cleanup;
    const key = newStorageKey();
    await temp.storage.put(key, new Uint8Array([1, 2, 3]));
    // A fresh adapter on the same folder, as after a server restart.
    const reopened = createLocalPhotoStorage(temp.root);
    expect([...((await reopened.get(key)) ?? [])]).toEqual([1, 2, 3]);
    expect(await allFiles(temp.root)).toEqual([key]);
    await reopened.delete(key);
    await reopened.delete(key); // deleting twice is fine
    expect(await reopened.get(key)).toBeNull();
  });

  it("refuses keys that could name another path", async () => {
    const temp = await tempStorage();
    cleanup = temp.cleanup;
    const bad = [
      "../../.env.local",
      "..\\..\\secret",
      "C:\\Windows\\win.ini",
      "/etc/passwd",
      "ab/cd.webp",
      `${"a".repeat(32)}.png`,
      `${"A".repeat(32)}.webp`,
      "",
    ];
    for (const key of bad) {
      await expect(temp.storage.put(key, new Uint8Array([1]))).rejects.toThrow(
        "Invalid storage key",
      );
      await expect(temp.storage.get(key)).rejects.toThrow("Invalid storage key");
    }
    expect(await allFiles(temp.root)).toEqual([]);
  });

  it("never overwrites an existing object and leaves no temporary files", async () => {
    const temp = await tempStorage();
    cleanup = temp.cleanup;
    const key = newStorageKey();
    await temp.storage.put(key, new Uint8Array([1]));
    await temp.storage.put(key, new Uint8Array([2])).catch(() => {});
    expect(await allFiles(temp.root)).toEqual([key]);
  });

  it("uses .data/uploads by default and refuses the public folder", () => {
    const cwd = path.resolve("/project");
    expect(resolvePhotoStorageRoot({}, cwd)).toBe(path.join(cwd, ".data", "uploads"));
    expect(resolvePhotoStorageRoot({ PHOTO_STORAGE_DIR: "D:/photos" }, cwd)).toBe(
      path.resolve(cwd, "D:/photos"),
    );
    expect(() => resolvePhotoStorageRoot({ PHOTO_STORAGE_DIR: "public/uploads" }, cwd)).toThrow(
      "public",
    );
    expect(() => resolvePhotoStorageRoot({ PHOTO_STORAGE_DIR: "public" }, cwd)).toThrow("public");
  });
});

describe("photo request helpers", () => {
  const request = (headers: Record<string, string>, body?: BodyInit) =>
    new Request("http://localhost:3000/api/drafts/x/photos", { method: "POST", headers, body });

  it("accepts only this site's Origin", () => {
    expect(isSameOrigin(request({ origin: "http://localhost:3000" }))).toBe(true);
    expect(isSameOrigin(request({}))).toBe(false);
    expect(isSameOrigin(request({ origin: "https://evil.example" }))).toBe(false);
    expect(isSameOrigin(request({ origin: "null" }))).toBe(false);
    expect(
      isSameOrigin(request({ origin: "https://site.example" }), ["https://site.example"]),
    ).toBe(true);
  });

  it("reads bodies up to the limit and stops reading beyond it", async () => {
    expect([...(await readLimitedBody(request({}, new Uint8Array([1, 2, 3])), 3))]).toEqual([
      1, 2, 3,
    ]);
    await expect(readLimitedBody(request({}, new Uint8Array(4)), 3)).rejects.toBeInstanceOf(
      BodyTooLargeError,
    );
    // A declared length above the limit is refused before reading.
    await expect(
      readLimitedBody(request({ "content-length": "999999999" }, new Uint8Array(1)), 3),
    ).rejects.toBeInstanceOf(BodyTooLargeError);
    // A stream without a length is cut off as well.
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array(1024));
        if (pulled > 1000) controller.close();
      },
    });
    const streaming = new Request("http://localhost:3000/x", {
      method: "POST",
      body: stream,
      // @ts-expect-error Node's fetch needs this for streamed request bodies.
      duplex: "half",
    });
    await expect(readLimitedBody(streaming, 4096)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(pulled).toBeLessThan(20);
  });

  it("maps failure codes to HTTP statuses", () => {
    expect(statusFor("unauthenticated")).toBe(401);
    expect(statusFor("not-found")).toBe(404);
    expect(statusFor("too-large")).toBe(413);
    expect(statusFor("limit")).toBe(409);
    expect(statusFor("rate-limited")).toBe(429);
    expect(statusFor("type")).toBe(400);
  });
});
