/**
 * Creates (or resets the password of) a portal admin from the command line.
 * The password is read from a hidden prompt, or from stdin with --password-stdin. It is never
 * accepted as a command-line argument (that would leak into shell history).
 *
 *   npm run portal:create-admin -- --email you@company.com --name "Your Name"
 *   echo "$PASS" | npm run portal:create-admin -- --email a@b.com --name A --password-stdin
 *   npm run portal:create-admin -- --email a@b.com --reset      (reset an existing admin's password)
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import readline from "readline";
import { audit, systemCtx } from "../../src/lib/portal/audit";
import { hashPassword, validatePasswordStrength } from "../../src/lib/portal/auth/password";
import { revokeUserSessions } from "../../src/lib/portal/auth/revoke";
import { createDb } from "../../src/lib/portal/db";
import { users } from "../../src/lib/portal/db/schema";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let muted = false;
    out._writeToOutput = (s: string) => {
      if (!muted) out.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim();
  const reset = process.argv.includes("--reset");
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Provide --email you@company.com");
  if (!reset && !name) throw new Error('Provide --name "Full Name"');

  let password: string;
  if (process.argv.includes("--password-stdin")) {
    password = await readStdin();
  } else {
    password = await prompt("Password: ");
    const again = await prompt("Confirm password: ");
    if (password !== again) throw new Error("Passwords do not match.");
  }
  const weak = validatePasswordStrength(password);
  if (weak) throw new Error(weak);

  const { db, pool } = createDb(url);
  try {
    const passwordHash = await hashPassword(password);
    const [existing] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`);
    if (reset) {
      if (!existing) throw new Error(`No admin with email ${email}.`);
      await db.update(users).set({ passwordHash, isActive: true, passwordChangedAt: new Date(), updatedAt: new Date() }).where(sql`${users.id} = ${existing.id}`);
      await revokeUserSessions(db, existing.id);
      await audit(db, systemCtx, { action: "reset_password", entity: "user", entityId: existing.id, summary: `CLI password reset for ${email}` });
      console.log(`✓ Password reset for ${email}. All of their sessions were signed out.`);
      return;
    }
    if (existing) throw new Error(`An admin with email ${email} already exists. Use --reset to change the password.`);
    const [row] = await db.insert(users).values({ name: name!, email, passwordHash }).returning({ id: users.id });
    await audit(db, systemCtx, { action: "create", entity: "user", entityId: row.id, summary: `CLI created admin ${email}` });
    console.log(`✓ Admin ${email} created. Sign in at /portal/login`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
