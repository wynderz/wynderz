/**
 * Applies version-controlled SQL migrations from /drizzle.
 * Usage: npm run portal:migrate            (uses DATABASE_URL)
 */
import "dotenv/config";
import path from "path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "../../src/lib/portal/db";

export async function runMigrations(url: string) {
  const { db, pool } = createDb(url);
  try {
    await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Add it to .env (see .env.example).");
    process.exit(1);
  }
  runMigrations(url)
    .then(() => console.log("✓ Portal database migrations applied."))
    .catch((e) => {
      console.error("Migration failed:", e.message);
      process.exit(1);
    });
}
