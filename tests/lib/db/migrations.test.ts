import { afterEach, describe, expect, it } from "vitest";
import {
  getMigrationStatus,
  loadMigrations,
  migrationChecksum,
  parseMigrations,
  runMigrations,
} from "@/lib/db/migrations";
import { type TestDatabase, createTestDatabase } from "./test-database";

// Integration tests on PGlite (PostgreSQL in WebAssembly), see test-database.ts.

let db: TestDatabase | null = null;
afterEach(async () => {
  await db?.close();
  db = null;
});

describe("migration files", () => {
  it("are versioned, ordered and checksummed the same on Windows and Linux", () => {
    const migrations = loadMigrations();
    expect(migrations.map((m) => `${m.version}_${m.name}`)).toEqual([
      "0001_initial_schema",
      "0002_auth_accounts",
      "0003_user_listing_drafts",
      "0004_draft_photo_uploads",
      "0005_listing_moderation",
      "0006_review_assignments_notifications",
    ]);
    expect(migrationChecksum("a\r\nb")).toBe(migrationChecksum("a\nb"));
    expect(() => parseMigrations([{ file: "1_bad.sql", sql: "" }])).toThrow("Unexpected");
    expect(() =>
      parseMigrations([
        { file: "0002_a.sql", sql: "" },
        { file: "0002_b.sql", sql: "" },
      ]),
    ).toThrow("Duplicate");
  });

  it("contain no destructive statements", () => {
    for (const { sql } of loadMigrations()) {
      // Replacing a CHECK constraint (DROP CONSTRAINT + ADD CONSTRAINT), relaxing a NOT NULL and
      // a trigger that FORBIDS truncating (BEFORE TRUNCATE ON ...) remove no data; every other
      // DROP, TRUNCATE or DELETE is forbidden.
      const withoutConstraintSwaps = sql
        .replace(/DROP CONSTRAINT\s+\w+;\s*ALTER TABLE \w+ ADD CONSTRAINT/gi, "")
        .replace(/ALTER COLUMN \w+ DROP NOT NULL;/gi, "")
        .replace(/BEFORE TRUNCATE ON \w+/gi, "");
      expect(withoutConstraintSwaps).not.toMatch(/\b(DROP|TRUNCATE)\b/i);
      expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    }
  });
});

describe("running migrations", () => {
  it("applies pending migrations once and records them", async () => {
    db = await createTestDatabase({ migrate: false });
    const migrations = loadMigrations();
    expect(await runMigrations(db, migrations)).toEqual([
      "0001",
      "0002",
      "0003",
      "0004",
      "0005",
      "0006",
    ]);
    expect(await runMigrations(db, migrations)).toEqual([]);
    const status = await getMigrationStatus(db, migrations);
    expect(status.pending).toEqual([]);
    expect(status.applied).toEqual([
      { version: "0001", name: "initial_schema" },
      { version: "0002", name: "auth_accounts" },
      { version: "0003", name: "user_listing_drafts" },
      { version: "0004", name: "draft_photo_uploads" },
      { version: "0005", name: "listing_moderation" },
      { version: "0006", name: "review_assignments_notifications" },
    ]);
    const { rows } = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM cities");
    expect(rows[0].count).toBe(2);
  });

  it("stops when an applied migration file was changed", async () => {
    db = await createTestDatabase();
    const changed = loadMigrations().map((m) => ({ ...m, checksum: migrationChecksum("edited") }));
    await expect(runMigrations(db, changed)).rejects.toThrow("changed after it was applied");
  });

  it("rolls back a failing migration completely", async () => {
    db = await createTestDatabase();
    const broken = parseMigrations([
      ...loadMigrations().map((m) => ({ file: `${m.version}_${m.name}.sql`, sql: m.sql })),
      { file: "0099_broken.sql", sql: "CREATE TABLE half_done (id int); SELECT 1/0;" },
    ]);
    await expect(runMigrations(db, broken)).rejects.toThrow();
    const { rows } = await db.query("SELECT to_regclass('half_done') AS t");
    expect(rows[0]).toEqual({ t: null });
    expect((await getMigrationStatus(db, broken)).pending.map((m) => m.version)).toEqual(["0099"]);
  });
});
