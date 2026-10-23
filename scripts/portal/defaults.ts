/**
 * Starter categories and settings. These are ordinary editable rows — the application
 * does not depend on any of these names except the system "Materials & Spares" category.
 */
import { sql } from "drizzle-orm";
import type { Db } from "../../src/lib/portal/db";
import { categories, settings } from "../../src/lib/portal/db/schema";
import { SETTINGS_KEYS, SETTINGS_SCHEMA } from "../../src/lib/portal/services/settings";

type Kind = "project" | "office" | "travel" | "machine" | "purchase" | "materials" | "other";

const EXPENSE_CATEGORIES: Array<[string, Kind]> = [
  ["Machine / Component", "machine"],
  ["Raw Material", "purchase"],
  ["Machining & Fabrication", "project"],
  ["Paint & Finishing", "project"],
  ["Tools & Consumables", "purchase"],
  ["Electrical", "purchase"],
  ["Transport & Logistics", "other"],
  ["Travel & Stay", "travel"],
  ["Fuel", "travel"],
  ["Food & Refreshments", "office"],
  ["Rent", "office"],
  ["Utilities", "office"],
  ["Office Supplies", "office"],
  ["Safety", "office"],
  ["IT & Equipment", "office"],
  ["Professional Services", "other"],
  ["Taxes & Fees", "other"],
  ["Miscellaneous", "other"],
];

const MATERIAL_CATEGORIES = [
  "Control Systems",
  "Linear Rails & Blocks",
  "Rack & Pinion",
  "Gearboxes",
  "Drag / Cable Chains",
  "Bearings",
  "Timing Belts & Pulleys",
  "Chucks & Tailstocks",
  "Spindles",
  "Panel Enclosures",
  "Pneumatics",
  "Electrical Components",
  "Raw Materials",
  "Machining",
  "Fabrication",
  "Paint / Finishing",
  "Other Components",
];

export async function seedDefaults(db: Db) {
  await db
    .insert(categories)
    .values({ type: "expense", name: "Materials & Spares", kind: "materials", isSystem: true })
    .onConflictDoNothing();
  await db
    .insert(categories)
    .values(EXPENSE_CATEGORIES.map(([name, kind]) => ({ type: "expense" as const, name, kind })))
    .onConflictDoNothing();
  await db
    .insert(categories)
    .values(MATERIAL_CATEGORIES.map((name) => ({ type: "material" as const, name, kind: "materials" as const })))
    .onConflictDoNothing();
  for (const key of SETTINGS_KEYS) {
    await db.insert(settings).values({ key, value: SETTINGS_SCHEMA[key].parse({}) }).onConflictDoNothing();
  }
  const [{ n }] = (await db.execute<{ n: number }>(sql`select count(*)::int as n from categories`)).rows;
  return { categories: n };
}
