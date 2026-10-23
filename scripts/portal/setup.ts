/**
 * One-step local setup: apply migrations, then seed editable default categories and settings.
 * Safe to run repeatedly. Does NOT import any Excel data and does NOT create an admin.
 * Usage: npm run portal:setup
 */
import "dotenv/config";
import { createDb } from "../../src/lib/portal/db";
import { seedDefaults } from "./defaults";
import { runMigrations } from "./migrate";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Add it to .env (see .env.example).");
  await runMigrations(url);
  console.log("✓ Migrations applied");
  const { db, pool } = createDb(url);
  try {
    const r = await seedDefaults(db);
    console.log(`✓ Default categories and settings ready (${r.categories} categories)`);
    const { rows } = await pool.query("select count(*)::int as n from users where is_active");
    if (rows[0].n === 0) {
      console.log("\nNext: create the first admin account:\n  npm run portal:create-admin -- --email you@company.com --name \"Your Name\"");
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Setup failed:", e.message);
  process.exit(1);
});
