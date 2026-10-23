import "dotenv/config";
import os from "os";
import path from "path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, type Db } from "@/lib/portal/db";
import type { Ctx } from "@/lib/portal/audit";
import { fromPgError } from "@/lib/portal/errors";
import { categories } from "@/lib/portal/db/schema";
import { and, eq } from "drizzle-orm";
import { seedDefaults } from "../../../scripts/portal/defaults";

export const TEST_URL = process.env.TEST_DATABASE_URL;
export const hasDb = !!TEST_URL;

/** Fresh schema per test file: drop everything, migrate, seed defaults. */
export async function freshDb() {
  if (!TEST_URL) throw new Error("TEST_DATABASE_URL not set");
  if (TEST_URL === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL");
  process.env.PORTAL_STORAGE_DIR = path.join(os.tmpdir(), `wz-portal-test-${process.pid}`);
  const { db, pool } = createDb(TEST_URL);
  await pool.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../../drizzle") });
  await seedDefaults(db);
  return { db, pool };
}

export const ctx: Ctx = { userId: null, userEmail: "test@wynderz.in", ip: "127.0.0.1" };

export async function categoryId(db: Db, type: "expense" | "material", name: string) {
  const [row] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.type, type), eq(categories.name, name)));
  return row.id;
}

/** Applies the same Postgres -> friendly message mapping the API layer uses. */
export function friendly<T>(p: Promise<T>) {
  return p.catch((e) => {
    throw fromPgError(e) ?? e;
  });
}
