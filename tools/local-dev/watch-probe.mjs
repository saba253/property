// LOCAL DEVELOPMENT ONLY: diagnostic for the recurring `next dev` reload loop (see
// docs/STORAGE.md and PROJECT_CONTEXT.md). Read-only for the project: it never changes, moves or
// deletes a project file.
//
//   node tools/local-dev/watch-probe.mjs            log every file change under the project
//   node tools/local-dev/watch-probe.mjs --snapshot  first copy the evidence, then log
//
// --snapshot copies .next/dev/logs and a listing (path, size, time) of .next/dev into
// .data/diagnostics/<time>/ BEFORE anything is cleared, so the state of a loop is kept.
// The log shows which files change between reloads (node_modules, .git and the probe's own
// folder are left out). Press Ctrl+C to stop; the log stays in .data/diagnostics/ (git-ignored).
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  watch,
} from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = path.join(root, ".data", "diagnostics", stamp);
mkdirSync(out, { recursive: true });
const logFile = path.join(out, "changes.log");

function listing(dir, base = dir, lines = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // The Turbopack cache has thousands of files; its folders are listed, not every file.
      if (path.relative(base, full).startsWith("cache")) {
        lines.push(`${statSync(full).mtime.toISOString()}\tdir\t${path.relative(base, full)}`);
        continue;
      }
      listing(full, base, lines);
    } else {
      const info = statSync(full);
      lines.push(`${info.mtime.toISOString()}\t${info.size}\t${path.relative(base, full)}`);
    }
  }
  return lines;
}

if (process.argv.includes("--snapshot")) {
  const dev = path.join(root, ".next", "dev");
  if (existsSync(path.join(dev, "logs"))) {
    cpSync(path.join(dev, "logs"), path.join(out, "next-dev-logs"), { recursive: true });
  }
  if (existsSync(dev)) {
    appendFileSync(path.join(out, "next-dev-listing.tsv"), `${listing(dev).sort().join("\n")}\n`);
  }
  console.log(`Evidence copied to ${path.relative(root, out)}`);
}

const ignored = /^(node_modules|\.git)([\\/]|$)|^\.data[\\/]diagnostics([\\/]|$)/;
let count = 0;
watch(root, { recursive: true }, (event, file) => {
  if (!file || ignored.test(file)) return;
  count += 1;
  appendFileSync(logFile, `${new Date().toISOString()}\t${event}\t${file}\n`);
});
console.log(`Watching ${root} (log: ${path.relative(root, logFile)}). Ctrl+C to stop.`);
process.on("SIGINT", () => {
  console.log(`\n${count} change events logged.`);
  process.exit(0);
});
