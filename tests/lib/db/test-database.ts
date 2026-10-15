import { PGlite } from "@electric-sql/pglite";
import { loadMigrations, runMigrations } from "@/lib/db/migrations";
import type { SqlConnection } from "@/lib/db/sql-client";

/*
 * A real PostgreSQL engine for integration tests: PGlite runs PostgreSQL compiled to WebAssembly
 * in memory, inside the test process. Each call creates a fresh, empty, isolated database; no
 * server, no files, no network, no user data. It is NOT a PostgreSQL server: connection handling,
 * pooling and the `pg` driver itself are not exercised here.
 */
export type TestDatabase = SqlConnection & { close(): Promise<void> };

export async function createTestDatabase({ migrate = true } = {}): Promise<TestDatabase> {
  const pglite = new PGlite();
  const db: TestDatabase = {
    singleConnection: true,
    async query<Row extends object>(text: string, params: readonly unknown[] = []) {
      const result = await pglite.query<Row>(text, [...params]);
      return { rows: result.rows };
    },
    async exec(text: string) {
      await pglite.exec(text);
    },
    close: () => pglite.close(),
  };
  if (migrate) await runMigrations(db, loadMigrations());
  return db;
}
