import { describe, expect, it } from "vitest";
import {
  addMoney,
  computeTax,
  derivePaymentStatus,
  mulMoney,
  normalizeMoney,
  percentOf,
  prorate,
  subMoney,
  toPaise,
} from "@/lib/portal/money";
import { calculatePayroll } from "@/lib/portal/payroll-calc";

describe("money", () => {
  it("parses Indian-formatted amounts exactly", () => {
    expect(toPaise("1,23,456.78")).toBe(BigInt(12345678));
    expect(normalizeMoney("₹ 2300")).toBe("2300.00");
    expect(normalizeMoney(0.1 + 0.2)).toBe("0.30");
  });

  it("adds without floating point drift", () => {
    expect(addMoney("0.10", "0.20", "0.30")).toBe("0.60");
    expect(addMoney(...Array(1000).fill("0.01"))).toBe("10.00");
    expect(subMoney("100", "100.01")).toBe("-0.01");
  });

  it("computes GST half-up to paise", () => {
    expect(percentOf("1000000", "18")).toBe("180000.00");
    expect(percentOf("99.99", "18")).toBe("18.00"); // 17.9982
    expect(percentOf("0.25", "18")).toBe("0.05"); // 0.045 -> 0.05
    expect(computeTax({ baseAmount: "5728000", gstRate: "18" })).toEqual({
      baseAmount: "5728000.00",
      gstRate: "18.00",
      gstAmount: "1031040.00",
      totalAmount: "6759040.00",
    });
  });

  it("computes base from quantity × unit price", () => {
    expect(mulMoney("199.99", "3")).toBe("599.97");
    expect(mulMoney("10", "2.555")).toBe("25.55"); // 25.55
    expect(computeTax({ quantity: "2.5", unitPrice: "100", gstRate: "5" }).totalAmount).toBe("262.50");
  });

  it("requires a base or quantity+price", () => {
    expect(() => computeTax({ gstRate: "18" })).toThrow();
  });

  it("derives payment status", () => {
    expect(derivePaymentStatus("100", "0")).toBe("unpaid");
    expect(derivePaymentStatus("100", "40")).toBe("partial");
    expect(derivePaymentStatus("100", "100")).toBe("paid");
    expect(derivePaymentStatus("0", "0")).toBe("paid");
  });

  it("prorates", () => {
    expect(prorate("13000", "24", 31)).toBe("10064.52");
    expect(() => prorate("100", "1", 0)).toThrow();
  });
});

describe("payroll calculation", () => {
  const base = { allowances: "0", deductions: "0", advance: "0", attendanceAdjustment: "0", prorateByDaysPaid: true };

  it("matches the reference sheet: ₹13,000, 24/31 days, ₹2,000 advance", () => {
    const r = calculatePayroll({ ...base, payType: "monthly", baseSalary: "13000", workingDays: 31, daysPaid: "24", advance: "2000" });
    expect(r.earnedSalary).toBe("10064.52");
    expect(r.netPayable).toBe("8064.52");
  });

  it("pays full salary minus advance when days are not given", () => {
    const r = calculatePayroll({ ...base, payType: "monthly", baseSalary: "13000", workingDays: 31, daysPaid: null, advance: "500" });
    expect(r.netPayable).toBe("12500.00");
  });

  it("pays daily workers rate × days (₹420 × 6 = ₹2,520)", () => {
    const r = calculatePayroll({ ...base, payType: "daily", baseSalary: "420", workingDays: 31, daysPaid: "6" });
    expect(r.netPayable).toBe("2520.00");
  });

  it("supports half days, allowances, deductions and floors net at zero", () => {
    expect(calculatePayroll({ ...base, payType: "daily", baseSalary: "500", workingDays: 30, daysPaid: "2.5", allowances: "100" }).grossSalary).toBe("1350.00");
    expect(calculatePayroll({ ...base, payType: "monthly", baseSalary: "1000", workingDays: 30, daysPaid: "1", advance: "5000" }).netPayable).toBe("0.00");
  });

  it("can disable proration by policy", () => {
    const r = calculatePayroll({ ...base, prorateByDaysPaid: false, payType: "monthly", baseSalary: "20000", workingDays: 31, daysPaid: "10" });
    expect(r.earnedSalary).toBe("20000.00");
  });

  it("rejects impossible inputs", () => {
    expect(() => calculatePayroll({ ...base, payType: "monthly", baseSalary: "1000", workingDays: 30, daysPaid: "31" })).toThrow();
    expect(() => calculatePayroll({ ...base, payType: "daily", baseSalary: "420", workingDays: 30, daysPaid: null })).toThrow();
  });
});
