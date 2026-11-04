import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  devIndicators: false,
  // Dev only: without these, a phone on the tunnel or LAN gets a page that
  // renders but never hydrates, so no button responds.
  allowedDevOrigins: ["blimp-numerous-stubbly.ngrok-free.dev", "192.168.1.106"],
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
};

export default nextConfig;
