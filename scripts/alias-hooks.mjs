// Resolves the project's "@/..." imports (tsconfig paths) for the db scripts, which run with
// Node's built-in TypeScript support (Node 22.18+ / 23.6+), without a bundler.
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = path.join(root, specifier.slice(2));
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        // Project files are ES modules written in TypeScript.
        return {
          url: pathToFileURL(candidate).href,
          format: "module-typescript",
          shortCircuit: true,
        };
      }
    }
  }
  return nextResolve(specifier, context);
}
