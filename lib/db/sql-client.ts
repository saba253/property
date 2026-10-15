/**
 * The minimum the data layer needs from a PostgreSQL connection. Both `pg` (Pool/Client, used by
 * the application and the scripts) and PGlite (PostgreSQL compiled to WebAssembly, used by the
 * integration tests) fit this shape through small adapters, so the same SQL runs on both.
 *
 * Every value goes through `params` ($1, $2, ...); SQL text is never built from user input.
 */
export interface SqlClient {
  query<Row extends object = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<{ rows: Row[] }>;
  /** Runs several statements without parameters (migration files). */
  exec(text: string): Promise<void>;
}

/**
 * A client bound to ONE connection, required for transactions (BEGIN/COMMIT must run on the same
 * connection): a `pg.Client` or PGlite, never a pool.
 */
export type SqlConnection = SqlClient & { readonly singleConnection: true };

/** Runs `work` in a transaction on a single connection; rolls back on any error. */
export async function withTransaction<T>(
  connection: SqlConnection,
  work: () => Promise<T>,
): Promise<T> {
  await connection.exec("BEGIN");
  try {
    const result = await work();
    await connection.exec("COMMIT");
    return result;
  } catch (error) {
    await connection.exec("ROLLBACK");
    throw error;
  }
}
