import { PGlite } from "@electric-sql/pglite";

/*
 * Test helper: PGlite (PostgreSQL in WebAssembly) in the shape of a `pg` pool as Kysely's
 * PostgresDialect expects it, so Better Auth runs its real SQL on a real PostgreSQL engine in
 * tests. One in-process connection; the production code uses the `pg` driver instead.
 */
export function pglitePool(db: PGlite) {
  const client = {
    async query(sql: string, params: readonly unknown[] = []) {
      const result = await db.query<Record<string, unknown>>(sql, [...params]);
      const command = (sql.trim().split(/\s+/)[0] ?? "SELECT").toUpperCase();
      return {
        command: command as "SELECT",
        rowCount: result.affectedRows ?? result.rows.length,
        rows: result.rows,
      };
    },
    release() {},
  };
  return { options: {}, connect: async () => client, end: async () => {} };
}
