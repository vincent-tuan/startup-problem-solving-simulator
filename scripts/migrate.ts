import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required to run migrations.");
const sql = postgres(url, { prepare: false, max: 1 });
try {
  await sql.unsafe("CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const files = (await readdir(resolve("drizzle"))).filter((file) => /^\d+.*\.sql$/.test(file)).sort();
  for (const file of files) {
    const migrationId = file.replace(/\.sql$/, "");
    const [existing] = await sql<{ id: string }[]>`SELECT id FROM schema_migrations WHERE id = ${migrationId}`;
    if (existing) { console.log(`${migrationId} is already applied.`); continue; }
    const migration = await readFile(resolve("drizzle", file), "utf8");
    await sql.begin(async (transaction) => { await transaction.unsafe(migration); await transaction`INSERT INTO schema_migrations (id) VALUES (${migrationId})`; });
    console.log(`Applied drizzle/${file}`);
  }
} finally {
  await sql.end();
}
