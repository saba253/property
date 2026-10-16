import { randomUUID } from "node:crypto";
import { PostgresDialect } from "kysely";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EmailMessage } from "@/lib/auth/email";
import { type Auth, createAuth } from "@/lib/auth/server";
import { connectPg } from "@/lib/db/pg-client";
import { createPostgresRepository } from "@/lib/db/postgres-repository";
import { loadMigrations, runMigrations } from "@/lib/db/migrations";
import { seedDemoData } from "@/lib/db/seed-demo";
import type { SqlConnection } from "@/lib/db/sql-client";
import { getDraftForUser, listDraftsForUser, saveDraftForUser } from "@/lib/drafts/draft-service";
import { createRateLimiter } from "@/lib/api/rate-limit";
import {
  type PhotoDeps,
  listDraftPhotos,
  readDraftPhoto,
  uploadDraftPhoto,
} from "@/lib/photos/photo-service";
import { addUser, depsFor, sampleDraft } from "../lib/drafts/draft-fixtures";
import { jpeg, tempStorage } from "../lib/photos/photo-fixtures";
import { type ReviewDeps, moderate, submitForReview } from "@/lib/review/review-service";

/*
 * OPT-IN integration tests against a real PostgreSQL SERVER through the `pg` driver (not PGlite).
 * They run only when TEST_DATABASE_URL points to a disposable LOCAL test database, e.g. the
 * "property_test" database of tools/local-dev/postgres.mjs; CI skips them. Every run uses new,
 * unique test users, so nothing existing is changed and nothing needs to be deleted.
 */

const url = process.env.TEST_DATABASE_URL;
const local = url ? /@(127\.0\.0\.1|localhost)[:/]/.test(url) : false;
const run = describe.runIf(Boolean(url) && local);

const BASE_URL = "http://localhost:3000";
const runId = randomUUID().slice(0, 8);

let db: SqlConnection & { end(): Promise<void> };
let pool: pg.Pool;
let auth: Auth;
const outbox: EmailMessage[] = [];

run("real PostgreSQL server", () => {
  beforeAll(async () => {
    db = await connectPg(url!);
    await runMigrations(db, loadMigrations());
    await seedDemoData(db);
    pool = new pg.Pool({ connectionString: url, max: 3 });
    auth = createAuth({
      dialect: new PostgresDialect({ pool }),
      secret: "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
      baseURL: BASE_URL,
      emailSender: { send: async (message) => void outbox.push(message) },
      google: null,
      production: false,
      rateLimit: false,
    });
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await db?.end();
  });

  const request = (path: string, body?: unknown, cookie?: string) =>
    auth.handler(
      new Request(`${BASE_URL}/api/auth${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          origin: BASE_URL,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...(cookie ? { cookie } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  const linkIn = (message?: EmailMessage) => {
    const match = message?.text.match(/https?:\/\/\S+/);
    if (!match) throw new Error("no link");
    const link = new URL(match[0]);
    return link.pathname.replace("/api/auth", "") + link.search;
  };

  it("uses a UTF-8 PostgreSQL server with all migrations", async () => {
    const { rows } = await db.query<{ v: string; e: string }>(
      "SELECT current_setting('server_version') AS v, pg_encoding_to_char(encoding) AS e FROM pg_database WHERE datname = current_database()",
    );
    expect(rows[0].e).toBe("UTF8");
    expect(Number.parseInt(rows[0].v, 10)).toBeGreaterThanOrEqual(15);
    const listings = await createPostgresRepository(db).getListingById("demo-listing-1");
    expect(listings?.listing.title).toBe("დემო: ბინა ვაკეში");
  });

  it("registers, verifies, signs in and out, and resets a password with the pg driver", async () => {
    const email = `real-${runId}@example.com`;
    const password = "real-server-password-1";
    expect(
      (await request("/sign-up/email", { email, password, name: "", callbackURL: "/login" }))
        .status,
    ).toBe(200);
    expect((await request("/sign-in/email", { email, password })).status).toBe(403);
    const verify = outbox.filter((m) => m.to === email).at(-1);
    expect([200, 302]).toContain((await request(linkIn(verify))).status);

    const signIn = await request("/sign-in/email", { email, password });
    expect(signIn.status).toBe(200);
    const cookie = signIn.headers
      .getSetCookie()
      .find((c) => c.includes("session_token="))!
      .split(";")[0];
    expect((await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.email).toBe(
      email,
    );

    expect((await request("/sign-out", {}, cookie)).status).toBe(200);
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();

    await request("/request-password-reset", { email, redirectTo: "/reset-password" });
    const redirect = await request(linkIn(outbox.at(-1)));
    const token = new URL(redirect.headers.get("location")!, BASE_URL).searchParams.get("token")!;
    expect(
      (await request("/reset-password", { token, newPassword: "changed-password-22" })).status,
    ).toBe(200);
    expect(
      (await request("/sign-in/email", { email, password: "changed-password-22" })).status,
    ).toBe(200);
  });

  it("stores drafts per user, isolated, with exact NUMERIC prices", async () => {
    const a = `real-a-${runId}`;
    const b = `real-b-${runId}`;
    await addUser(db, a);
    await addUser(db, b);
    const saved = await saveDraftForUser(depsFor(db, a), sampleDraft({ price: "145000" }), null);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const { rows } = await db.query<{ amount: string; owner: string; status: string }>(
      "SELECT asking_amount::text AS amount, owner_user_id AS owner, status FROM listings WHERE id = $1",
      [saved.id],
    );
    expect(rows[0]).toEqual({ amount: "145000", owner: a, status: "draft" });
    expect(await getDraftForUser(depsFor(db, b), saved.id)).toBeNull();
    expect((await listDraftsForUser(depsFor(db, b)))!.map((d) => d.id)).not.toContain(saved.id);
    const search = await createPostgresRepository(db).searchListings({
      filters: {},
      display: "USD",
      rateState: { status: "unavailable" },
      sort: "default",
    });
    expect(search.items.every((item) => item.listing.dataSource === "demo")).toBe(true);
  });

  it("enforces the 10-photo limit under truly concurrent uploads (pg pool)", async () => {
    const owner = `real-photo-${runId}`;
    const other = `real-photo-other-${runId}`;
    await addUser(db, owner);
    await addUser(db, other);
    const saved = await saveDraftForUser(depsFor(db, owner), sampleDraft(), null);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const temp = await tempStorage();
    try {
      const limits = () => ({
        upload: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
        change: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
      });
      // Separate pool connections per operation: real parallel transactions on the server.
      const withPool: PhotoDeps["withConnection"] = async (work) => {
        const client = await pool.connect();
        try {
          return await work({
            singleConnection: true,
            query: async (text, params = []) => ({
              rows: (await client.query(text, [...params])).rows,
            }),
            exec: async (text) => {
              await client.query(text);
            },
          });
        } finally {
          client.release();
        }
      };
      const deps: PhotoDeps = {
        currentUserId: async () => owner,
        withConnection: withPool,
        storage: temp.storage,
        limiters: limits(),
      };
      const bytes = await jpeg(24, 24);
      const results = await Promise.all(
        Array.from({ length: 14 }, () => uploadDraftPhoto(deps, saved.id, bytes)),
      );
      expect(results.filter((r) => r.ok).length).toBe(10);
      expect(results.filter((r) => !r.ok && r.reason === "limit").length).toBe(4);
      const photos = await listDraftPhotos(deps, saved.id);
      expect(photos?.map((p) => p.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(photos?.filter((p) => p.isCover).length).toBe(1);
      const { readdir } = await import("node:fs/promises");
      const files = (await readdir(temp.root, { recursive: true, withFileTypes: true })).filter(
        (e) => e.isFile(),
      );
      expect(files.length).toBe(10);
      // Another user cannot read one of them.
      const otherDeps: PhotoDeps = { ...deps, currentUserId: async () => other };
      expect(await readDraftPhoto(otherDeps, saved.id, photos![0].id)).toBeNull();
      expect((await readDraftPhoto(deps, saved.id, photos![0].id))?.mimeType).toBe("image/webp");
    } finally {
      await temp.cleanup();
    }
  });

  it("accepts exactly one of many simultaneous moderation decisions (pg pool)", async () => {
    const owner = `real-rev-owner-${runId}`;
    const mods = [`real-rev-mod1-${runId}`, `real-rev-mod2-${runId}`];
    for (const id of [owner, ...mods]) await addUser(db, id);
    for (const id of mods) {
      await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'moderator')", [id]);
    }
    const saved = await saveDraftForUser(depsFor(db, owner), sampleDraft(), null);
    if (!saved.ok) throw new Error(saved.reason);
    const temp = await tempStorage();
    try {
      const withPool: ReviewDeps["withConnection"] = async (work) => {
        const client = await pool.connect();
        try {
          return await work({
            singleConnection: true,
            query: async (text, params = []) => ({
              rows: (await client.query(text, [...params])).rows,
            }),
            exec: async (text) => {
              await client.query(text);
            },
          });
        } finally {
          client.release();
        }
      };
      const limits = () => ({
        submit: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
        decide: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
      });
      const photo = await uploadDraftPhoto(
        {
          currentUserId: async () => owner,
          withConnection: withPool,
          storage: temp.storage,
          limiters: {
            upload: createRateLimiter({ limit: 100, windowMs: 60_000 }),
            change: createRateLimiter({ limit: 100, windowMs: 60_000 }),
          },
        },
        saved.id,
        await jpeg(16, 16),
      );
      expect(photo.ok).toBe(true);
      const as = (userId: string): ReviewDeps => ({
        currentUserId: async () => userId,
        withConnection: withPool,
        limiters: limits(),
      });
      expect(await submitForReview(as(owner), saved.id)).toEqual({ ok: true });
      const results = await Promise.all([
        moderate(as(mods[0]), saved.id, "approve", null),
        moderate(as(mods[1]), saved.id, "reject", "duplicate"),
        moderate(as(mods[0]), saved.id, "request-changes", "fix"),
        moderate(as(mods[1]), saved.id, "approve", null),
        moderate(as(mods[0]), saved.id, "reject", "no"),
        moderate(as(mods[1]), saved.id, "request-changes", "x"),
      ]);
      expect(results.filter((r) => r.ok).length).toBe(1);
      expect(results.filter((r) => !r.ok && r.reason === "conflict").length).toBe(5);
      const { rows } = await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM listing_status_events WHERE listing_id = $1 AND actor_role = 'moderator'",
        [saved.id],
      );
      expect(rows[0].n).toBe(1);
    } finally {
      await temp.cleanup();
    }
  });
});
