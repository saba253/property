import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        // Makes "@/lib/..." point to the project root, matching tsconfig.json ("@/*": ["./*"]).
        find: /^@\//,
        replacement: fileURLToPath(new URL("./", import.meta.url)),
      },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    // Database tests start PGlite (PostgreSQL in WebAssembly), which can take several seconds when
    // many test files run in parallel.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
