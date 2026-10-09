import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev server only: let phones/colleagues load dev assets through the sharing tunnels
  // (localhost.run and Tailscale). Without this the page renders but its JS is blocked (403),
  // so nothing is clickable. Production builds don't need it.
  allowedDevOrigins: ["*.lhr.life", "*.*.ts.net"],
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
