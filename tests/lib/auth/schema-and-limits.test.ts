import { PGlite } from "@electric-sql/pglite";
import { getMigrations } from "better-auth/db/migration";
import { PostgresDialect } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth } from "@/lib/auth/server";
import { loadMigrations, runMigrations } from "@/lib/db/migrations";
import { seedDemoData } from "@/lib/db/seed-demo";
import { type Harness, createHarness } from "./auth-harness";
import { pglitePool } from "./pglite-pool";

describe("auth schema", () => {
  it("contains everything Better Auth needs for this configuration (no drift)", async () => {
    const db = new PGlite();
    const connection = {
      singleConnection: true as const,
      query: async (text: string, params: readonly unknown[] = []) => ({
        rows: (await db.query(text, [...params])).rows as never[],
      }),
      exec: async (text: string) => void (await db.exec(text)),
    };
    await runMigrations(connection, loadMigrations());
    const auth = createAuth({
      dialect: new PostgresDialect({ pool: pglitePool(db) as never }),
      secret: "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
      baseURL: "http://localhost:3000",
      emailSender: { send: async () => {} },
      google: null,
      production: false,
    });
    const migrations = await getMigrations(auth.options);
    expect(migrations.toBeCreated).toEqual([]);
    expect(migrations.toBeAdded).toEqual([]);
    await db.close();
  });

  it("keeps demo listings without an owner and protects users with listings", async () => {
    const db = new PGlite();
    const connection = {
      singleConnection: true as const,
      query: async (text: string, params: readonly unknown[] = []) => ({
        rows: (await db.query(text, [...params])).rows as never[],
      }),
      exec: async (text: string) => void (await db.exec(text)),
    };
    await runMigrations(connection, loadMigrations());
    await seedDemoData(connection);
    const { rows } = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM listings WHERE owner_user_id IS NOT NULL",
    );
    expect(rows[0].n).toBe(0);
    await db.query(
      `INSERT INTO users (id, name, email, "emailVerified") VALUES ('u1', '', 'owner@example.com', true)`,
    );
    // A demo listing can never be assigned to a person.
    await expect(
      db.query("UPDATE listings SET owner_user_id = 'u1' WHERE id = 'demo-listing-1'"),
    ).rejects.toThrow();
    // Emails must be stored normalized; names are short.
    await expect(
      db.query(`INSERT INTO users (id, name, email) VALUES ('u2', '', 'Upper@Example.com')`),
    ).rejects.toThrow();
    await expect(
      db.query(`INSERT INTO users (id, name, email) VALUES ('u3', $1, 'n@example.com')`, [
        "ა".repeat(61),
      ]),
    ).rejects.toThrow();
    await db.close();
  });
});

describe("rate limiting (stored in the database)", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness({ rateLimit: true });
  }, 60_000);
  afterAll(() => h.close());

  it("throttles repeated sign-in attempts per address", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const response = await h.request("/sign-in/email", {
        body: { email: "nobody@example.com", password: "wrong-password-123" },
        ip: "203.0.113.7",
      });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 3).every((status) => status === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    // Another address is not affected.
    const other = await h.request("/sign-in/email", {
      body: { email: "nobody@example.com", password: "wrong-password-123" },
      ip: "198.51.100.9",
    });
    expect(other.status).toBe(401);
    const { rows } = await h.db.query<{ n: number }>("SELECT count(*)::int AS n FROM rate_limits");
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it("throttles password-reset requests", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const response = await h.request("/request-password-reset", {
        body: { email: "someone@example.com", redirectTo: "/reset-password" },
        ip: "203.0.113.8",
      });
      statuses.push(response.status);
    }
    expect(statuses.at(-1)).toBe(429);
  });
});
