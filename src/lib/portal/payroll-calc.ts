import { addMoney, compareMoney, mulMoney, normalizeMoney, prorate, subMoney, toPaise } from "./money";

export type PayrollCalcInput = {
  payType: "monthly" | "daily";
  /** Monthly salary, or daily rate for daily-paid employees. */
  baseSalary: string;
  workingDays: number | null;
  daysPaid: string | null;
  allowances: string;
  deductions: string;
  advance: string;
  /** Signed manual adjustment (e.g. attendance correction). */
  attendanceAdjustment: string;
  prorateByDaysPaid: boolean;
};

/**
 * monthly:  earned = salary × daysPaid / workingDays   (or full salary if days not given / proration off)
 * daily:    earned = dailyRate × daysPaid
 * gross   = earned + allowances + adjustment
 * net     = max(0, gross − deductions − advance)
 *
 * Example from the reference sheets: ₹13,000 salary, 24 of 31 days, ₹2,000 advance
 * → 13000×24/31 = 10,064.52 → net 8,064.52.
 */
export function calculatePayroll(i: PayrollCalcInput) {
  let earned: string;
  if (i.payType === "daily") {
    if (i.daysPaid === null) throw new Error("Days paid is required for daily-paid employees.");
    earned = mulMoney(i.baseSalary, i.daysPaid);
  } else if (i.daysPaid !== null && i.prorateByDaysPaid) {
    if (!i.workingDays) throw new Error("Working days must be set to prorate salary.");
    if (Number(i.daysPaid) > i.workingDays) throw new Error("Days paid cannot exceed working days.");
    earned = prorate(i.baseSalary, i.daysPaid, i.workingDays);
  } else {
    earned = normalizeMoney(i.baseSalary);
  }
  const gross = addMoney(earned, i.allowances, i.attendanceAdjustment);
  if (toPaise(gross) < BigInt(0)) throw new Error("Gross salary cannot be negative.");
  const rawNet = subMoney(subMoney(gross, i.deductions), i.advance);
  const net = compareMoney(rawNet, "0") < 0 ? "0.00" : rawNet;
  return { earnedSalary: earned, grossSalary: gross, netPayable: net };
}
