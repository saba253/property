import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    // Off: when on, `next dev` writes agent instructions into AGENTS.md that ask coding agents to
    // send feedback to Next.js. Decided by the project owner on 2026-10-16.
    agentFeedback: false,
  },
  cacheComponents: true,
  // Saved searches were removed after Step 1.17; old bookmarks open the ordinary search.
  // Temporary (307), because the feature may return.
  redirects() {
    return [{ source: "/saved-searches", destination: "/properties", permanent: false }];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
