import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { type SqlConnection, withTransaction } from "@/lib/db/sql-client";

/*
 * Versioned SQL migrations (db/migrations/NNNN_name.sql), applied in order, each in its own
 * transaction, and recorded in schema_migrations with a checksum. An applied migration that was
 * edited afterwards stops the run instead of drifting silently. Migrations only move forward;
 * there is no "down" or reset command.
 */

export type Migration = { version: string; name: string; sql: string; checksum: string };

const FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;

/** Same checksum on Windows (CRLF checkouts) and Linux. */
export function migrationChecksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
}

/** Parses migration files; throws on unexpected names or duplicate versions. */
export function parseMigrations(files: readonly { file: string; sql: string }[]): Migration[] {
  const migrations = files.map(({ file, sql }) => {
    const match = FILE_PATTERN.exec(file);
    if (!match) throw new Error(`Unexpected migration file name: ${file}`);
    return { version: match[1], name: match[2], sql, checksum: migrationChecksum(sql) };
  });
  migrations.sort((a, b) => a.version.localeCompare(b.version));
  for (let index = 1; index < migrations.length; index++) {
    if (migrations[index].version === migrations[index - 1].version) {
      throw new Error(`Duplicate migration version ${migrations[index].version}`);
    }
  }
  return migrations;
}

export const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

export function loadMigrations(dir = MIGRATIONS_DIR): Migration[] {
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => ({ file, sql: readFileSync(path.join(dir, file), "utf8") }));
  return parseMigrations(files);
}

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    name text NOT NULL,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;

export type MigrationStatus = {
  applied: { version: string; name: string }[];
  pending: Migration[];
};

async function readApplied(connection: SqlConnection) {
  const { rows } = await connection.query<{ version: string; name: string; checksum: string }>(
    "SELECT version, name, checksum FROM schema_migrations ORDER BY version",
  );
  return rows;
}

/** Compares the database with the migration files; throws if an applied file was changed. */
export async function getMigrationStatus(
  connection: SqlConnection,
  migrations: readonly Migration[],
): Promise<MigrationStatus> {
  await connection.exec(CREATE_TABLE);
  const applied = await readApplied(connection);
  const byVersion = new Map(migrations.map((migration) => [migration.version, migration]));
  for (const row of applied) {
    const file = byVersion.get(row.version);
    if (!file) throw new Error(`Migration ${row.version} is applied but its file is missing.`);
    if (file.checksum !== row.checksum) {
      throw new Error(`Migration ${row.version}_${row.name} was changed after it was applied.`);
    }
  }
  const done = new Set(applied.map((row) => row.version));
  return {
    applied: applied.map(({ version, name }) => ({ version, name })),
    pending: migrations.filter((migration) => !done.has(migration.version)),
  };
}

/** Applies pending migrations in order; returns the versions applied in this run. */
/** Georgian text needs a UTF-8 database (Windows installers may default to WIN1252). */
export async function assertUtf8Database(connection: SqlConnection): Promise<void> {
  const { rows } = await connection.query<{ encoding: string }>(
    "SELECT pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datname = current_database()",
  );
  const encoding = rows[0]?.encoding;
  if (encoding !== "UTF8") {
    throw new Error(
      `The database uses ${encoding ?? "an unknown"} encoding; create it with ENCODING 'UTF8'.`,
    );
  }
}

export async function runMigrations(
  connection: SqlConnection,
  migrations: readonly Migration[],
): Promise<string[]> {
  await assertUtf8Database(connection);
  const { pending } = await getMigrationStatus(connection, migrations);
  const appliedNow: string[] = [];
  for (const migration of pending) {
    await withTransaction(connection, async () => {
      // Serializes concurrent runs: a second runner waits, then skips what was just applied.
      await connection.query("SELECT pg_advisory_xact_lock(727274001)");
      const { rows } = await connection.query(
        "SELECT 1 FROM schema_migrations WHERE version = $1",
        [migration.version],
      );
      if (rows.length > 0) return;
      await connection.exec(migration.sql);
      await connection.query(
        "INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)",
        [migration.version, migration.name, migration.checksum],
      );
      appliedNow.push(migration.version);
    });
  }
  return appliedNow;
}
