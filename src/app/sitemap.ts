import type { MetadataRoute } from "next";
import { publicScenarios } from "@/content/scenarios";
export default function sitemap(): MetadataRoute.Sitemap { const base=process.env.NEXT_PUBLIC_APP_URL??"http://localhost:3000";return [{url:base,changeFrequency:"monthly",priority:1},{url:`${base}/scenarios`,changeFrequency:"weekly",priority:.8},...publicScenarios.map(scenario=>({url:`${base}/scenarios/${scenario.slug}`,changeFrequency:"monthly" as const,priority:.7}))] }
