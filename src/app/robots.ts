import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots { return { rules: { userAgent: "*", allow: ["/", "/scenarios"], disallow: ["/dashboard", "/runs", "/settings", "/api"] } }; }
