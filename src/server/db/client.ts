import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let singleton: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_REQUIRED");
  if (!singleton) {
    const client = postgres(url, { prepare: false, max: 5, idle_timeout: 20, connect_timeout: 10 });
    singleton = drizzle(client, { schema });
  }
  return singleton;
}

export type Database = ReturnType<typeof database>;
