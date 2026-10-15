import { type DataBackendConfig, resolveDataBackend } from "@/lib/db/config";
import type { SqlClient } from "@/lib/db/sql-client";
import type { ListingRepository } from "@/lib/repository/listing-repository";
import { createMemoryRepository } from "@/lib/repository/memory-repository";

/*
 * The one place that decides which backend serves listings (see lib/db/config.ts). PostgreSQL
 * code and the `pg` driver are loaded only when DATA_BACKEND=postgres. A configuration error is
 * thrown, never replaced by demo data.
 */

export type RepositoryFactories = {
  /** Creates the SQL client for a database URL (default: a `pg` pool). */
  createSqlClient?: (databaseUrl: string) => Promise<SqlClient>;
};

export async function createRepository(
  config: DataBackendConfig,
  { createSqlClient }: RepositoryFactories = {},
): Promise<ListingRepository> {
  if (config.backend === "memory") return createMemoryRepository();
  const [{ createPostgresRepository }, client] = await Promise.all([
    import("@/lib/db/postgres-repository"),
    createSqlClient
      ? createSqlClient(config.databaseUrl)
      : import("@/lib/db/pg-client").then(({ createPgPool }) => createPgPool(config.databaseUrl)),
  ]);
  return createPostgresRepository(client, {
    // Server log only; the error shown to visitors is generic.
    onError: (error) => console.error("[listings] database query failed:", error),
  });
}

let shared: Promise<ListingRepository> | null = null;

/** The application's repository, created once per server process from the environment. */
export function getListingRepository(): Promise<ListingRepository> {
  shared ??= (async () => createRepository(resolveDataBackend(process.env)))();
  return shared;
}
