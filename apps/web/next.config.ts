import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Turbopack ignores WATCHPACK_POLLING; Docker Compose sets it for bind mounts on
  // Windows/macOS where native file events don't reach the container, so poll instead.
  ...(process.env.WATCHPACK_POLLING === "true"
    ? { watchOptions: { pollIntervalMs: 1000 } }
    : {}),
};

export default nextConfig;
