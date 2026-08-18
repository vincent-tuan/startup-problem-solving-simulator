import "server-only";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { hashSessionToken } from "./crypto";
import { SESSION_COOKIE } from "./cookie";
import { getStore } from "@/server/store";

export async function userFromToken(token?: string) {
  if (!token) return null;
  return (await getStore()).resolveSession(hashSessionToken(token), new Date());
}

export async function currentUser() {
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value);
}

export async function requestUser(request: NextRequest) {
  return userFromToken(request.cookies.get(SESSION_COOKIE)?.value);
}

export async function requireRequestUser(request: NextRequest) {
  const user = await requestUser(request);
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}
