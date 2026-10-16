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
      expect(sql).not.toMatch(/\b(DROP|TRUNCATE)\b/i);
      expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    }
  });
});

describe("running migrations", () => {
  it("applies pending migrations once and records them", async () => {
    db = await createTestDatabase({ migrate: false });
    const migrations = loadMigrations();
    expect(await runMigrations(db, migrations)).toEqual(["0001", "0002"]);
    expect(await runMigrations(db, migrations)).toEqual([]);
    const status = await getMigrationStatus(db, migrations);
    expect(status.pending).toEqual([]);
    expect(status.applied).toEqual([
      { version: "0001", name: "initial_schema" },
      { version: "0002", name: "auth_accounts" },
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
      { file: "0003_broken.sql", sql: "CREATE TABLE half_done (id int); SELECT 1/0;" },
    ]);
    await expect(runMigrations(db, broken)).rejects.toThrow();
    const { rows } = await db.query("SELECT to_regclass('half_done') AS t");
    expect(rows[0]).toEqual({ t: null });
    expect((await getMigrationStatus(db, broken)).pending.map((m) => m.version)).toEqual(["0003"]);
  });
});
