import "dotenv/config";
import { spawn, type ChildProcess } from "child_process";
import { randomBytes } from "crypto";
import { mkdtemp, rm } from "fs/promises";
import net from "net";
import os from "os";
import path from "path";
import pg from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { TestProject } from "vitest/node";
import { systemCtx } from "@/lib/portal/audit";
import { createDb } from "@/lib/portal/db";
import { createUser } from "@/lib/portal/services/users";
import { seedDefaults } from "../../scripts/portal/defaults";

export type E2eContext = { baseUrl: string; email: string; password: string; databaseUrl: string };

declare module "vitest" {
  export interface ProvidedContext {
    e2e: E2eContext | null;
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * E2E_DATABASE_URL, or TEST_DATABASE_URL with "_e2e" appended to the database name (created if missing).
 * It is wiped on every run, so it must be local and must not be DATABASE_URL / TEST_DATABASE_URL.
 */
function resolveDatabaseUrl() {
  const explicit = process.env.E2E_DATABASE_URL;
  const base = explicit || process.env.TEST_DATABASE_URL;
  if (!base) return null;
  const url = new URL(base);
  if (!explicit) url.pathname = `${url.pathname.replace(/\/$/, "")}_e2e`;
  if (!LOCAL_HOSTS.has(url.hostname)) throw new Error("The e2e database must be on localhost (it is wiped on every run).");
  const s = url.toString();
  if (s === process.env.DATABASE_URL || s === process.env.TEST_DATABASE_URL) throw new Error("The e2e database must differ from DATABASE_URL and TEST_DATABASE_URL.");
  return url;
}

async function ensureDatabase(url: URL) {
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!/^[a-z0-9_]+$/i.test(name)) throw new Error(`Unsafe e2e database name: ${name}`);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query("select 1 from pg_database where datname = $1", [name]);
    if (!rowCount) await client.query(`create database "${name}"`);
  } finally {
    await client.end();
  }
}

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForServer(baseUrl: string, child: ChildProcess, log: () => string) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next dev exited early:\n${log()}`);
    try {
      const res = await fetch(`${baseUrl}/portal/login`, { redirect: "manual" });
      if (res.status === 200) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`next dev did not become ready:\n${log()}`);
}

export default async function setup(project: TestProject) {
  const dbUrl = resolveDatabaseUrl();
  if (!dbUrl) {
    console.warn("[e2e] TEST_DATABASE_URL / E2E_DATABASE_URL not set — skipping end-to-end tests.");
    project.provide("e2e", null);
    return;
  }
  const databaseUrl = dbUrl.toString();
  await ensureDatabase(dbUrl);

  const { db, pool } = createDb(databaseUrl);
  const email = "e2e-admin@wynderz.test";
  const password = `E2e-${randomBytes(12).toString("base64url")}!9`;
  try {
    await pool.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
    await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
    await seedDefaults(db);
    await createUser(db, systemCtx, { name: "E2E Admin", email, password });
  } finally {
    await pool.end();
  }

  const storageDir = await mkdtemp(path.join(os.tmpdir(), "wz-portal-e2e-"));
  const port = await freePort();
  const baseUrl = `http://localhost:${port}`;
  let output = "";
  const child = spawn(path.resolve(__dirname, "../../node_modules/.bin/next"), ["dev", "--turbopack", "-p", String(port)], {
    cwd: path.resolve(__dirname, "../.."),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PORTAL_STORAGE_DRIVER: "local",
      PORTAL_STORAGE_DIR: storageDir,
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const append = (b: Buffer) => {
    output = (output + b.toString()).slice(-8000);
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);

  const killGroup = (signal: NodeJS.Signals) => {
    try {
      if (child.pid) process.kill(-child.pid, signal);
    } catch {
      // already gone
    }
  };
  // next dev can ignore SIGTERM for minutes while compiling, and its open pipes keep vitest alive,
  // so escalate to SIGKILL after a short grace period.
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((r) => child.once("exit", r));
      killGroup("SIGTERM");
      const timer = setTimeout(() => killGroup("SIGKILL"), 5_000);
      await Promise.race([exited, new Promise((r) => setTimeout(r, 10_000))]);
      clearTimeout(timer);
    }
    child.stdout?.destroy();
    child.stderr?.destroy();
    child.unref();
    await rm(storageDir, { recursive: true, force: true });
  };

  try {
    await waitForServer(baseUrl, child, () => output);
  } catch (err) {
    await stop();
    throw err;
  }
  project.provide("e2e", { baseUrl, email, password, databaseUrl });
  return stop;
}
