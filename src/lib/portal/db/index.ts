import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
/** A database handle or an open transaction — services accept either. */
export type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

type Cache = { pool?: Pool; db?: Db };
const globalCache = globalThis as unknown as { __wynderzPortalDb?: Cache };
const cache: Cache = (globalCache.__wynderzPortalDb ??= {});

export function createPool(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not configured for the portal.");
  return new Pool({
    connectionString: url,
    max: Number(process.env.PORTAL_DB_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

/** Lazily-created singleton pool (survives dev hot reloads). */
export function getDb(): Db {
  if (!cache.db) {
    cache.pool = createPool();
    cache.db = drizzle(cache.pool, { schema });
  }
  return cache.db;
}

export function createDb(url: string) {
  const pool = createPool(url);
  return { db: drizzle(pool, { schema }), pool };
}

export { schema };
