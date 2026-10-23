import { z } from "zod";
import { isIsoDate } from "./dates";

/** Trimmed text; empty string becomes null. */
export const optText = (max = 2000) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (typeof v === "string" ? v.trim() : v))
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || v.length <= max, `Must be at most ${max} characters`);

export const reqText = (max = 300) => z.string({ required_error: "Required" }).trim().min(1, "Required").max(max);

export const isoDate = z.string().refine(isIsoDate, "Must be a valid date (YYYY-MM-DD)");
export const optDate = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isIsoDate(v), "Must be a valid date (YYYY-MM-DD)");

const DECIMAL = /^-?\d{1,12}(\.\d{1,4})?$/;

/** Decimal as string; accepts numbers and strings like "1,23,456.50". */
const decimalInput = z.union([z.string(), z.number()]).transform((v) => String(v).replace(/[,\s₹]/g, ""));

export const money = decimalInput
  .refine((v) => DECIMAL.test(v), "Must be a valid amount")
  .refine((v) => !v.startsWith("-"), "Must not be negative");

export const optMoney = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => (v === null || v === undefined || v === "" ? null : String(v).replace(/[,\s₹]/g, "")))
  .refine((v) => v === null || (DECIMAL.test(v) && !v.startsWith("-")), "Must be a valid amount");

export const percent = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => (v === null || v === undefined || v === "" ? "0" : String(v).replace("%", "").trim()))
  .refine((v) => DECIMAL.test(v) && Number(v) >= 0 && Number(v) <= 100, "Must be between 0 and 100");

export const optQty = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => (v === null || v === undefined || v === "" ? null : String(v).replace(/,/g, "")))
  .refine((v) => v === null || (DECIMAL.test(v) && Number(v) > 0), "Must be a positive number");

export const id = z.coerce.number().int().positive();
export const optId = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => (v === null || v === undefined || v === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v > 0), "Invalid selection");

export const correction = { correctionReason: optText(500) };

/** Shared list query params. */
export const listQuery = z.object({
  // Invalid values in a shared/bookmarked URL are ignored rather than failing the page.
  page: z.coerce.number().int().min(1).catch(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).catch(25).default(25),
  q: z.string().trim().max(200).optional().catch(undefined),
  sort: z.string().max(40).optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
  fy: z.coerce.number().int().positive().optional().catch(undefined),
  from: z.string().refine(isIsoDate).optional().catch(undefined),
  to: z.string().refine(isIsoDate).optional().catch(undefined),
  archived: z.enum(["only", "include"]).optional().catch(undefined),
});
export type ListQuery = z.infer<typeof listQuery>;

export const archiveBody = z.object({ archived: z.boolean(), correctionReason: optText(500) });
export const reasonBody = z.object({ correctionReason: optText(500) }).partial();
