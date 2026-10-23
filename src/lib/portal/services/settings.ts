import { eq } from "drizzle-orm";
import { z } from "zod";
import { audit, diff, type Ctx } from "../audit";
import type { Tx } from "../db";
import { settings } from "../db/schema";
import { AppError } from "../errors";

const timeStr = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM");

/**
 * Every configurable business rule lives here with an explicit default.
 * Nothing about payroll or attendance policy is hardcoded elsewhere.
 */
export const SETTINGS_SCHEMA = {
  company: z.object({
    name: z.string().trim().max(200).default("WYNDERZ Pvt. Ltd."),
    gstin: z.string().trim().max(30).default(""),
    address: z.string().trim().max(500).default(""),
    currency: z.literal("INR").default("INR"),
  }),
  financialYear: z.object({
    /** Month (1-12) a financial year starts in. India: April. */
    startMonth: z.coerce.number().int().min(1).max(12).default(4),
  }),
  payroll: z.object({
    /** calendar = days in the month; fixed = fixedWorkingDays every month. */
    workingDaysMode: z.enum(["calendar", "fixed"]).default("calendar"),
    fixedWorkingDays: z.coerce.number().int().min(1).max(31).default(26),
    /** If false, monthly employees are paid full salary regardless of days paid. */
    prorateByDaysPaid: z.boolean().default(true),
  }),
  attendance: z.object({
    shiftStart: timeStr.default("09:30"),
    graceMinutes: z.coerce.number().int().min(0).max(240).default(10),
    halfDayMinHours: z.coerce.number().min(0).max(24).default(4),
    fullDayMinHours: z.coerce.number().min(0).max(24).default(8),
    /** first_last: first punch = in, last punch = out. pairs: sum each in/out pair. */
    punchPolicy: z.enum(["first_last", "pairs"]).default("first_last"),
    /** Punches closer together than this are treated as one (double-scan). */
    duplicatePunchMinutes: z.coerce.number().int().min(0).max(60).default(2),
    /** A day whose punches fall before this time belong to the previous day (night shifts). 00:00 disables. */
    dayCutoff: timeStr.default("00:00"),
    weeklyOffDays: z.array(z.coerce.number().int().min(0).max(6)).default([0]),
  }),
  uploads: z.object({
    maxMb: z.coerce.number().int().min(1).max(50).default(15),
  }),
} as const;

export type SettingsKey = keyof typeof SETTINGS_SCHEMA;
export type SettingsValue<K extends SettingsKey> = z.infer<(typeof SETTINGS_SCHEMA)[K]>;
export type AllSettings = { [K in SettingsKey]: SettingsValue<K> };

export const SETTINGS_KEYS = Object.keys(SETTINGS_SCHEMA) as SettingsKey[];

export async function getSetting<K extends SettingsKey>(db: Tx, key: K): Promise<SettingsValue<K>> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  const parsed = SETTINGS_SCHEMA[key].safeParse(row?.value ?? {});
  return (parsed.success ? parsed.data : SETTINGS_SCHEMA[key].parse({})) as SettingsValue<K>;
}

export async function getAllSettings(db: Tx): Promise<AllSettings> {
  const rows = await db.select().from(settings);
  const out = {} as Record<string, unknown>;
  for (const key of SETTINGS_KEYS) {
    const row = rows.find((r) => r.key === key);
    const parsed = SETTINGS_SCHEMA[key].safeParse(row?.value ?? {});
    out[key] = parsed.success ? parsed.data : SETTINGS_SCHEMA[key].parse({});
  }
  return out as AllSettings;
}

export async function updateSetting(db: Tx, ctx: Ctx, key: string, value: unknown) {
  if (!SETTINGS_KEYS.includes(key as SettingsKey)) throw new AppError("Unknown setting.");
  const k = key as SettingsKey;
  const parsed = SETTINGS_SCHEMA[k].parse(value);
  if (k === "attendance") {
    const a = parsed as SettingsValue<"attendance">;
    if (a.halfDayMinHours > a.fullDayMinHours) throw new AppError("Half-day hours cannot exceed full-day hours.");
  }
  const before = await getSetting(db, k);
  await db
    .insert(settings)
    .values({ key: k, value: parsed, updatedBy: ctx.userId })
    .onConflictDoUpdate({ target: settings.key, set: { value: parsed, updatedBy: ctx.userId, updatedAt: new Date() } });
  await audit(db, ctx, {
    action: "update",
    entity: "settings",
    entityId: k,
    summary: `Updated ${k} settings`,
    changes: diff(before as Record<string, unknown>, parsed as Record<string, unknown>),
  });
  return parsed;
}
