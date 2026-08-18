import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok", service: "startup-simulator", timestamp: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
}
