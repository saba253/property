import pg from "pg";
import type { SqlClient, SqlConnection } from "@/lib/db/sql-client";

/*
 * `pg` (node-postgres) adapters. Server-side only: imported dynamically by the repository
 * selection when DATA_BACKEND=postgres, and by the database scripts. Next.js keeps `pg` out of
 * bundles (it is in Next's default serverExternalPackages list).
 */

/** Pooled client for the application: small pool, bounded waits, no endless queries. */
export function createPgPool(databaseUrl: string): SqlClient & { end(): Promise<void> } {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
    application_name: "property-intelligence",
  });
  // An idle client error must not crash the server; the next query reports the problem.
  pool.on("error", () => {});
  return {
    async query<Row extends object>(text: string, params: readonly unknown[] = []) {
      const result = await pool.query(text, [...params]);
      return { rows: result.rows as Row[] };
    },
    async exec(text: string) {
      await pool.query(text);
    },
    end: () => pool.end(),
  };
}

/** One connection, for migrations and the development seed (transactions). */
export async function connectPg(
  databaseUrl: string,
): Promise<SqlConnection & { end(): Promise<void> }> {
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 });
  await client.connect();
  return {
    singleConnection: true,
    async query<Row extends object>(text: string, params: readonly unknown[] = []) {
      const result = await client.query(text, [...params]);
      return { rows: result.rows as Row[] };
    },
    async exec(text: string) {
      await client.query(text);
    },
    end: () => client.end(),
  };
}
