import { NextRequest, NextResponse } from "next/server";
import { requestUser } from "@/server/auth/session";

export async function GET(request: NextRequest) {
  const user = await requestUser(request);
  return user ? NextResponse.json({ user }) : NextResponse.json({ user: null }, { status: 401 });
}
