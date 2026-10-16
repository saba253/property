// LOCAL DEVELOPMENT ONLY: a real PostgreSQL 18 server running as a normal user process (no
// installer, no Windows service, no admin rights). Data persists in <project>/.data/postgres;
// it listens only on 127.0.0.1. Credentials are generated once into .data/local-dev.json
// (git-ignored) and never printed. Stop with Ctrl+C (data stays).
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const root = path.resolve(import.meta.dirname, "..", "..");
const dataRoot = path.join(root, ".data");
const databaseDir = path.join(dataRoot, "postgres");
const configFile = path.join(dataRoot, "local-dev.json");
mkdirSync(dataRoot, { recursive: true });

const config = existsSync(configFile)
  ? JSON.parse(readFileSync(configFile, "utf8"))
  : {
      user: "property_dev",
      password: randomBytes(24).toString("base64url"),
      port: 5433,
      database: "property_dev",
    };
if (!existsSync(configFile))
  writeFileSync(configFile, JSON.stringify(config, null, 2), { mode: 0o600 });

const server = new EmbeddedPostgres({
  databaseDir,
  user: config.user,
  password: config.password,
  port: config.port,
  authMethod: "scram-sha-256",
  persistent: true,
  // UTF-8 is required for Georgian text; on Windows initdb would otherwise pick WIN1252.
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
  onLog: () => {},
  onError: (error) =>
    console.error("[postgres]", error instanceof Error ? error.message : String(error).trim()),
});

if (!existsSync(path.join(databaseDir, "PG_VERSION"))) {
  console.log("Initialising a new local database cluster in .data/postgres …");
  await server.initialise();
}
await server.start();
// "property_dev" for the app, "property_test" for the opt-in real-server integration tests.
for (const name of [config.database, "property_test"]) {
  try {
    await server.createDatabase(name);
  } catch {
    // Already exists.
  }
}
console.log(
  `PostgreSQL 18 is running on 127.0.0.1:${config.port}, database "${config.database}" (data: .data/postgres). Ctrl+C stops it.`,
);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await server.stop();
  console.log("PostgreSQL stopped (data kept).");
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
