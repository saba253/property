/*
 * Database commands for LOCAL DEVELOPMENT (see db/README.md):
 *   npm run db:status      - applied and pending migrations
 *   npm run db:migrate     - apply pending migrations
 *   npm run db:seed:demo   - insert/update the invented demo listings (development only)
 *
 * The target is always DATABASE_URL (from the environment or .env.local); nothing has a default.
 * Non-local hosts are refused. Only db:migrate accepts --allow-remote, for a future deliberate
 * deployment step; the demo seed never runs against a non-local database or in production.
 * There is no reset/drop command.
 */
import { existsSync } from "node:fs";
import { describeDatabaseUrl, isLocalDatabaseUrl, parseDatabaseUrl } from "@/lib/db/config";
import { getMigrationStatus, loadMigrations, runMigrations } from "@/lib/db/migrations";
import { connectPg } from "@/lib/db/pg-client";
import { seedDemoData } from "@/lib/db/seed-demo";

const [command, ...flags] = process.argv.slice(2);

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) fail("DATABASE_URL is not set (see .env.example). Nothing was changed.");
if (!parseDatabaseUrl(databaseUrl)) fail("DATABASE_URL must be a postgres:// URL.");
const local = isLocalDatabaseUrl(databaseUrl);
if (!local && !(command === "migrate" && flags.includes("--allow-remote"))) {
  fail(`${describeDatabaseUrl(databaseUrl)} is not a local database. Nothing was changed.`);
}
if (command === "seed-demo" && process.env.NODE_ENV === "production") {
  fail("The demo seed never runs with NODE_ENV=production.");
}

console.log(`Database: ${describeDatabaseUrl(databaseUrl)}`);
const db = await connectPg(databaseUrl).catch((error: Error) =>
  fail(`could not connect (${error.message}).`),
);
try {
  const migrations = loadMigrations();
  if (command === "status") {
    const { applied, pending } = await getMigrationStatus(db, migrations);
    console.log(`Applied: ${applied.map((m) => `${m.version}_${m.name}`).join(", ") || "none"}`);
    console.log(`Pending: ${pending.map((m) => `${m.version}_${m.name}`).join(", ") || "none"}`);
  } else if (command === "migrate") {
    const done = await runMigrations(db, migrations);
    console.log(done.length ? `Applied: ${done.join(", ")}` : "Already up to date.");
  } else if (command === "seed-demo") {
    const { pending } = await getMigrationStatus(db, migrations);
    if (pending.length > 0) fail("Run npm run db:migrate first.");
    const summary = await seedDemoData(db);
    console.log(
      `Demo data (invented examples) seeded: ${summary.properties} properties, ` +
        `${summary.listings} listings, ${summary.images} images.`,
    );
  } else {
    fail("Usage: node scripts/db.mts status | migrate [--allow-remote] | seed-demo");
  }
} finally {
  await db.end();
}
