import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the end-to-end suite run its own dev server without touching .next (see tests/e2e).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.youtube.com",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
