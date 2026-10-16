/*
 * Draft photo storage maintenance for LOCAL DEVELOPMENT (see docs/STORAGE.md):
 *   npm run photos:orphans             list stored files that no database row refers to
 *   npm run photos:orphans -- --delete remove those files (only ones older than one hour)
 *
 * An orphan can exist only after a crash between storing a file and recording it, or when a file
 * could not be removed after its photo was deleted. Orphans are unreachable (photos are served
 * only through a database row). Files referenced by any row, archived drafts included, are never
 * touched. The database is only read.
 */
import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { describeDatabaseUrl, isLocalDatabaseUrl, parseDatabaseUrl } from "@/lib/db/config";
import { connectPg } from "@/lib/db/pg-client";
import { listAllStorageKeys } from "@/lib/photos/photo-store";
import {
  createLocalPhotoStorage,
  isStorageKey,
  resolvePhotoStorageRoot,
} from "@/lib/photos/storage";

const remove = process.argv.includes("--delete");
const MIN_AGE_MS = 60 * 60_000;

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl || !parseDatabaseUrl(databaseUrl))
  fail("DATABASE_URL is not set. Nothing was changed.");
if (!isLocalDatabaseUrl(databaseUrl)) fail(`${describeDatabaseUrl(databaseUrl)} is not local.`);

const root = resolvePhotoStorageRoot(process.env, process.cwd());
console.log(`Database: ${describeDatabaseUrl(databaseUrl)}`);
console.log(`Storage:  ${path.relative(process.cwd(), root) || "."}`);

const db = await connectPg(databaseUrl).catch((error: Error) =>
  fail(`could not connect (${error.message}).`),
);
let referenced: Set<string>;
try {
  referenced = await listAllStorageKeys(db);
} finally {
  await db.end();
}

const entries = existsSync(root)
  ? await readdir(root, { withFileTypes: true, recursive: true })
  : [];
const files = entries.filter((entry) => entry.isFile());
const orphans: { key: string; ageMs: number }[] = [];
let leftovers = 0;
for (const entry of files) {
  const full = path.join(entry.parentPath, entry.name);
  if (!isStorageKey(entry.name)) {
    leftovers++; // temporary files of interrupted writes, or files that are not ours
    continue;
  }
  if (!referenced.has(entry.name)) {
    orphans.push({ key: entry.name, ageMs: Date.now() - (await stat(full)).mtimeMs });
  }
}

console.log(`Stored photo files: ${files.length - leftovers}, referenced rows: ${referenced.size}`);
console.log(
  `Orphan files: ${orphans.length}${leftovers ? `, other files (left alone): ${leftovers}` : ""}`,
);
if (!remove) {
  if (orphans.length) console.log("Run with -- --delete to remove orphans older than one hour.");
  process.exit(0);
}
const storage = createLocalPhotoStorage(root);
let removed = 0;
for (const orphan of orphans) {
  if (orphan.ageMs < MIN_AGE_MS) continue; // may belong to an upload in progress
  await storage.delete(orphan.key);
  removed++;
}
console.log(`Removed ${removed} orphan file(s).`);
