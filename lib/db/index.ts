import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool: Pool | undefined };

let _db: NodePgDatabase<typeof schema> | null = null;

function connectionStringForPool(url: string): string {
  /** Avoid `sslmode=` in the URL: with `pg`, that can map to verify-full and break on Vercel + Supabase pooler. TLS is set via `Pool.ssl` instead. */
  return url;
}

function sslForPostgresUrl(url: string): undefined | { rejectUnauthorized: boolean } {
  if (!url.includes("supabase.com")) return undefined;
  /** Supabase pooler + Node on Vercel often hits SELF_SIGNED_CERT_IN_CHAIN with verify-full; encrypted + relaxed verify is the usual fix. Set DATABASE_SSL_REJECT_UNAUTHORIZED=true to enforce CA verification (may fail on some hosts). */
  const strict = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true";
  return { rejectUnauthorized: strict };
}

function poolMax(): number {
  if (process.env.DATABASE_POOL_MAX) {
    return Number(process.env.DATABASE_POOL_MAX);
  }
  // Fewer connections per serverless instance to avoid exhausting Supabase limits.
  return process.env.VERCEL ? 2 : 10;
}

export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required (Supabase pooler URL, e.g. postgresql://…). Set it in Vercel project env.",
    );
  }
  if (!globalForDb.pool) {
    const connectionString = connectionStringForPool(url);
    globalForDb.pool = new Pool({
      connectionString,
      max: poolMax(),
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 15_000,
      ssl: sslForPostgresUrl(url),
    });
  }
  _db = drizzle(globalForDb.pool, { schema });
  return _db;
}

export { schema };
