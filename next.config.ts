import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Exposes the D1 binding from wrangler.jsonc to `next dev` (local SQLite).
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  ...(process.env.GLOSS_DESKTOP === "1" ? { output: "standalone", distDir: ".next-desktop" } as const : {}),
  serverExternalPackages: ["linkedom"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
