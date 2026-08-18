import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function pepper(name: "session" | "recovery") {
  const key = name === "session" ? process.env.SESSION_PEPPER : process.env.RECOVERY_PEPPER;
  if (key) return key;
  if (process.env.NODE_ENV === "production") throw new Error(`${name.toUpperCase()}_PEPPER_REQUIRED`);
  return `development-only-${name}-pepper`;
}

function hmac(value: string, purpose: "session" | "recovery") {
  return createHmac("sha256", pepper(purpose)).update(value).digest("hex");
}

export function issueSession(now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hmac(token, "session"), expiresAt: new Date(now.getTime() + SESSION_TTL_MS) };
}

export function hashSessionToken(token: string) {
  return hmac(token, "session");
}

export function issueRecoveryCode() {
  const lookupId = randomBytes(9).toString("base64url");
  const secret = randomBytes(18).toString("base64url");
  return { code: `ssr.${lookupId}.${secret}`, lookupId, secretHash: hmac(`${lookupId}.${secret}`, "recovery") };
}

export function parseRecoveryCode(code: string) {
  const [prefix, lookupId, secret] = code.trim().split(".");
  if (prefix !== "ssr" || !lookupId || !secret || lookupId.length > 32 || secret.length > 64) return null;
  return { lookupId, secretHash: hmac(`${lookupId}.${secret}`, "recovery") };
}

export function safeHashEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hashRateLimitKey(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}
