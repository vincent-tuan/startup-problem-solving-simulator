import "server-only";
import { eq, sql } from "drizzle-orm";
import { database } from "@/server/db/client";
import { securityRateLimits } from "@/server/db/schema";

type Bucket = { attempts: number; startedAt: number; blockedUntil: number };
const globalBuckets = globalThis as typeof globalThis & { __startupRateLimits?: Map<string, Bucket> };
const buckets = globalBuckets.__startupRateLimits ??= new Map<string, Bucket>();

export async function consumeRateLimit(key: string, options = { limit: 6, windowMs: 15 * 60_000, blockMs: 30 * 60_000 }) {
  const now = Date.now();
  if (process.env.DATABASE_URL) {
    const blocked = await database().transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
      const [row] = await transaction.select().from(securityRateLimits).where(eq(securityRateLimits.key, key)).limit(1);
      if (row?.blockedUntil && row.blockedUntil.getTime() > now) return true;
      const reset = !row || now - row.windowStartedAt.getTime() > options.windowMs;
      const attempts = reset ? 1 : row.attempts + 1;
      const blockedUntil = attempts > options.limit ? new Date(now + options.blockMs) : null;
      await transaction.insert(securityRateLimits).values({ key, attempts, windowStartedAt: reset ? new Date(now) : row!.windowStartedAt, blockedUntil })
        .onConflictDoUpdate({ target: securityRateLimits.key, set: { attempts, windowStartedAt: reset ? new Date(now) : row!.windowStartedAt, blockedUntil } });
      return Boolean(blockedUntil);
    });
    if (blocked) throw new Error("RATE_LIMITED");
    return;
  }
  const current = buckets.get(key);
  if (current?.blockedUntil && current.blockedUntil > now) throw new Error("RATE_LIMITED");
  const bucket = !current || now - current.startedAt > options.windowMs ? { attempts: 0, startedAt: now, blockedUntil: 0 } : current;
  bucket.attempts += 1;
  if (bucket.attempts > options.limit) {
    bucket.blockedUntil = now + options.blockMs;
    buckets.set(key, bucket);
    throw new Error("RATE_LIMITED");
  }
  buckets.set(key, bucket);
}
