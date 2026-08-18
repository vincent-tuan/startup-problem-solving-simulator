import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const csp = [
  "default-src 'self'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  "object-src 'none'", "img-src 'self' data: blob:", "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'", `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "connect-src 'self' https://*.neon.tech wss://*.neon.tech", "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  experimental: { optimizePackageImports: ["lucide-react"] },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" }
      ],
    }];
  },
};

export default withWorkflow(nextConfig);
