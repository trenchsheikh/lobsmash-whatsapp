import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool: Pool | undefined };

let _db: NodePgDatabase<typeof schema> | null = null;

export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required (Supabase pooler URL, e.g. postgresql://…)",
    );
  }
  if (!globalForDb.pool) {
    globalForDb.pool = new Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      ssl: url.includes("supabase.com")
        ? { rejectUnauthorized: true }
        : undefined,
    });
  }
  _db = drizzle(globalForDb.pool, { schema });
  return _db;
}

export { schema };
