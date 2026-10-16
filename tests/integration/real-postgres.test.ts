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
import { addUser, depsFor, sampleDraft } from "../lib/drafts/draft-fixtures";

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
});
