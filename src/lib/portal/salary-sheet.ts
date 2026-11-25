import ExcelJS from "exceljs";
import { formatDate } from "./dates";
import { addMoney, compareMoney } from "./money";

/**
 * The monthly "Salary Payment" sheet the office uses to make bank transfers, laid out like
 * their own workbook. It carries FULL bank account numbers — serve it only as a no-store
 * attachment to admins, and audit every export.
 */

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const SALARY_SHEET_HEADERS = [
  "S.No",
  "Name",
  "Employee ID",
  "Salary",
  "Adv",
  "Amount To Pay",
  "Days To Pay",
  "Absent",
  "Joining Date",
  "Paid",
  "Amount Paid",
  "Payment Date",
  "Mode",
  "A/C Number",
  "IFSC",
  "Notes",
] as const;

export type SalarySheetRow = {
  name: string;
  employeeCode: string;
  payType: "monthly" | "daily";
  baseSalary: string;
  earnedSalary: string;
  advance: string;
  netPayable: string;
  workingDays: number | null;
  daysPaid: string | null;
  absentDays: string | null;
  joiningDate: string | null;
  paymentStatus: "unpaid" | "partial" | "paid";
  amountPaid: string;
  paymentDate: string | null;
  paymentMethod: string | null;
  paymentMode: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  notes: string | null;
};

const INR = '"₹"#,##0.00';
const PAID_LABEL = { paid: "Yes", partial: "Partial", unpaid: "No" } as const;

export function salarySheetTitle(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { title: `${MONTH_NAMES[m - 1]} Salary Payment`, sheetName: `${MONTH_NAMES[m - 1]} ${y} Salary Payment` };
}

/** "Full" when the whole month is paid (or a monthly record has no day count), else the day count. */
export function daysToPay(r: Pick<SalarySheetRow, "payType" | "daysPaid" | "workingDays">): string | number {
  if (r.daysPaid === null) return r.payType === "monthly" ? "Full" : "";
  const d = Number(r.daysPaid);
  if (r.payType === "monthly" && r.workingDays !== null && d === r.workingDays) return "Full";
  return d;
}

function mode(r: SalarySheetRow) {
  if (r.paymentMethod) return r.paymentMethod;
  return r.paymentMode === "cash" ? "Cash" : "Bank";
}

export async function buildSalarySheet(month: string, rows: SalarySheetRow[]) {
  const { title, sheetName } = salarySheetTitle(month);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Wynderz Portal";
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  const width = SALARY_SHEET_HEADERS.length;

  ws.mergeCells(1, 1, 1, width);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 13 };
  titleCell.alignment = { horizontal: "center" };

  const header = ws.getRow(2);
  SALARY_SHEET_HEADERS.forEach((h, i) => (header.getCell(i + 1).value = h));
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF101827" } };
  const widths = [6, 26, 12, 12, 10, 14, 11, 8, 13, 8, 13, 13, 14, 20, 13, 28];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  let salary = "0.00";
  let adv = "0.00";
  let toPay = "0.00";
  let paid = "0.00";
  rows.forEach((r, i) => {
    // Daily-wage staff have no monthly salary: show what they earned this month and note the rate.
    const salaryCell = r.payType === "daily" ? r.earnedSalary : r.baseSalary;
    const notes = [r.payType === "daily" ? `Daily wage ₹${r.baseSalary}/day` : null, r.paymentMode === "cash" && !r.paymentMethod ? "cash" : null, r.notes]
      .filter(Boolean)
      .join(" · ");
    const row = ws.getRow(3 + i);
    const values: Array<string | number | null> = [
      i + 1,
      r.name,
      r.employeeCode,
      Number(salaryCell),
      compareMoney(r.advance, "0") === 0 ? null : Number(r.advance),
      Number(r.netPayable),
      daysToPay(r),
      r.absentDays === null || Number(r.absentDays) === 0 ? null : Number(r.absentDays),
      r.joiningDate ? formatDate(r.joiningDate) : null,
      PAID_LABEL[r.paymentStatus],
      compareMoney(r.amountPaid, "0") === 0 ? null : Number(r.amountPaid),
      r.paymentDate ? formatDate(r.paymentDate) : null,
      mode(r),
      r.bankAccountNumber,
      r.bankIfsc,
      notes || null,
    ];
    values.forEach((v, ci) => {
      if (v === null || v === "") return;
      row.getCell(ci + 1).value = v;
    });
    for (const c of [4, 5, 6, 11]) row.getCell(c).numFmt = INR;
    // Account numbers stay text so leading zeros survive and Excel never shows them in E-notation.
    row.getCell(14).numFmt = "@";
    salary = addMoney(salary, salaryCell);
    adv = addMoney(adv, r.advance);
    toPay = addMoney(toPay, r.netPayable);
    paid = addMoney(paid, r.amountPaid);
  });

  const total = ws.getRow(3 + rows.length);
  total.getCell(2).value = "Total";
  total.getCell(4).value = Number(salary);
  total.getCell(5).value = Number(adv);
  total.getCell(6).value = Number(toPay);
  total.getCell(11).value = Number(paid);
  for (const c of [4, 5, 6, 11]) total.getCell(c).numFmt = INR;
  total.font = { bold: true };

  ws.views = [{ state: "frozen", ySplit: 2 }];
  const buf = await wb.xlsx.writeBuffer();
  return { body: Buffer.from(buf as ArrayBuffer), title, sheetName, totals: { salary, advance: adv, amountToPay: toPay, amountPaid: paid } };
}
