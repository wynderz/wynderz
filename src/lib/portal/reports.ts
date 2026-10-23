/**
 * Report registry: one definition drives the on-screen table, Excel/CSV export and print view,
 * so every output uses the same query and calculation rules as the dashboards.
 */
import { z } from "zod";
import { formatDate, minutesToHours, monthLabel, todayIso } from "./dates";
import type { Db } from "./db";
import { addMoney } from "./money";
import {
  categoryBreakdown,
  financeTotals,
  monthlyTrend,
  outstandingPayments,
  projectBudgetVsActual,
  supplierSpending,
  yearComparison,
  type FinanceFilter,
} from "./queries/finance";
import { attendanceByEmployee } from "./services/attendance";
import { exportExpenses } from "./services/expenses";
import { exportMaterials } from "./services/materials";
import { exportPayroll } from "./services/payroll";
import { listInvoices } from "./services/receivables";
import { getYear } from "./services/shared";
import { exportTimesheets } from "./services/timesheets";
import type { ExportColumn } from "./spreadsheet";
import { isIsoDate } from "./dates";

export const reportFilter = z.object({
  fy: z.coerce.number().int().positive().optional(),
  from: z.string().refine(isIsoDate).optional(),
  to: z.string().refine(isIsoDate).optional(),
  projectId: z.coerce.number().int().positive().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  employeeId: z.coerce.number().int().positive().optional(),
  q: z.string().max(200).optional(),
});
export type ReportFilter = z.infer<typeof reportFilter>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
export type ReportResult = { columns: ExportColumn<Row>[]; rows: Row[]; totals?: Row; note?: string };

export type ReportDef = {
  key: string;
  title: string;
  description: string;
  group: "Finance" | "Projects" | "People" | "Suppliers";
  filters: Array<"fy" | "range" | "project" | "category" | "employee">;
  run: (db: Db, f: ReportFilter) => Promise<ReportResult>;
};

const m = (header: string, key: string): ExportColumn<Row> => ({ header, value: (r) => r[key], type: "money", width: 16 });
const t = (header: string, key: string, width = 18): ExportColumn<Row> => ({ header, value: (r) => r[key], type: "text", width });
const d = (header: string, key: string): ExportColumn<Row> => ({ header, value: (r) => r[key], type: "date", width: 13 });
const n = (header: string, key: string): ExportColumn<Row> => ({ header, value: (r) => r[key], type: "number", width: 10 });

function sumCols(rows: Row[], keys: string[]) {
  const out: Row = {};
  for (const k of keys) out[k] = addMoney(...rows.map((r) => r[k] ?? "0"));
  return out;
}

const ff = (f: ReportFilter): FinanceFilter => ({ fy: f.fy, from: f.from, to: f.to, projectId: f.projectId });

async function attendanceRange(db: Db, f: ReportFilter) {
  if (f.from && f.to) return { from: f.from, to: f.to };
  if (f.fy) {
    const y = await getYear(db, f.fy);
    return { from: y.startDate, to: y.endDate < todayIso() ? y.endDate : todayIso() };
  }
  const today = todayIso();
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

export const REPORTS: ReportDef[] = [
  {
    key: "master",
    title: "Master company report",
    description: "Every financial year side by side: projects, costs, payroll, receipts.",
    group: "Finance",
    filters: [],
    run: async (db) => {
      const rows = await yearComparison(db);
      return {
        columns: [t("Financial year", "label", 14), t("Status", "status", 10), n("Projects", "projects"), m("Project costs", "projectCosts"), m("Office & admin", "officeCosts"), m("Materials (incl. above)", "materials"), m("Payroll", "payroll"), m("Total expenditure", "totalExpenditure"), m("Paid", "paid"), m("Budget", "budget"), m("Invoiced", "invoiced"), m("Received", "received")],
        rows,
        totals: { label: "All years", projects: rows.reduce((a, r) => a + r.projects, 0), ...sumCols(rows, ["projectCosts", "officeCosts", "materials", "payroll", "totalExpenditure", "paid", "budget", "invoiced", "received"]) },
        note: "Materials are already included in project/office costs and are shown for reference only.",
      };
    },
  },
  {
    key: "financial-year",
    title: "Financial-year summary",
    description: "Headline figures for a year or date range.",
    group: "Finance",
    filters: ["fy", "range"],
    run: async (db, f) => {
      const x = await financeTotals(db, ff(f));
      const rows = [
        { metric: "Recorded expenditure (expenses + payroll)", value: x.recordedExpenditure },
        { metric: "Paid expenditure", value: x.paidExpenditure },
        { metric: "Unpaid liabilities", value: x.unpaidLiabilities },
        { metric: "Project costs", value: x.projectCosts },
        { metric: "Office & admin costs", value: x.officeCosts },
        { metric: "Materials & spares (included above)", value: x.materialsCosts },
        { metric: "GST paid on expenses", value: x.gstTotal },
        { metric: "Payroll (net payable)", value: x.payrollNet },
        { metric: "Payroll paid", value: x.payrollPaid },
        { metric: "Invoiced", value: x.invoiced },
        { metric: "Received", value: x.received },
        { metric: "Outstanding receivables", value: x.receivables },
        { metric: "Contract value (not revenue)", value: x.contractValue },
        { metric: "Year budget", value: x.yearBudget },
      ];
      return { columns: [t("Metric", "metric", 42), m("Amount (₹)", "value")], rows };
    },
  },
  {
    key: "monthly",
    title: "Monthly expenditure",
    description: "Project, office and payroll spending per month, with receipts.",
    group: "Finance",
    filters: ["fy", "range", "project"],
    run: async (db, f) => {
      const rows = (await monthlyTrend(db, ff(f))).map((r) => ({ ...r, label: monthLabel(`${r.month}-01`) }));
      return {
        columns: [t("Month", "label", 12), m("Project costs", "project"), m("Office & admin", "office"), m("Payroll", "payroll"), m("Total", "total"), m("Received", "received")],
        rows,
        totals: { label: "Total", ...sumCols(rows.map((r) => ({ project: String(r.project), office: String(r.office), payroll: String(r.payroll), total: String(r.total), received: String(r.received) })), ["project", "office", "payroll", "total", "received"]) },
      };
    },
  },
  {
    key: "expenses",
    title: "Expense register",
    description: "Every expense with tax, payment and bill details.",
    group: "Finance",
    filters: ["fy", "range", "project", "category"],
    run: async (db, f) => {
      const rows = await exportExpenses(db, { ...f });
      return {
        columns: [d("Date", "expenseDate"), t("Year", "yearLabel", 11), t("Project", "projectCode", 10), t("Category", "categoryName"), t("Description", "description", 40), t("Supplier / payee", "supplierName", 24), n("Qty", "quantity"), m("Base", "baseAmount"), n("GST %", "gstRate"), m("GST", "gstAmount"), m("Total", "totalAmount"), m("Paid", "amountPaid"), t("Status", "paymentStatus", 10), t("Method", "paymentMethod", 12), t("Paid by", "paidBy", 12), t("Bill no.", "billNumber", 12), t("Bill status", "billStatus", 12), t("Source", "source", 10)],
        rows: rows.map((r) => ({ ...r, supplierName: r.supplierName ?? r.payeeName })),
        totals: { description: "Total", ...sumCols(rows, ["baseAmount", "gstAmount", "totalAmount", "amountPaid"]) },
      };
    },
  },
  {
    key: "office",
    title: "Office & admin expenses",
    description: "Expenses not linked to any project.",
    group: "Finance",
    filters: ["fy", "range", "category"],
    run: async (db, f) => {
      const rows = await exportExpenses(db, { ...f, projectId: undefined, scope: "general" });
      return {
        columns: [d("Date", "expenseDate"), t("Category", "categoryName"), t("Description", "description", 40), t("Supplier / payee", "party", 24), m("Total", "totalAmount"), m("Paid", "amountPaid"), t("Status", "paymentStatus", 10), t("Paid by", "paidBy", 12), t("Bill status", "billStatus", 12)],
        rows: rows.map((r) => ({ ...r, party: r.supplierName ?? r.payeeName })),
        totals: { description: "Total", ...sumCols(rows, ["totalAmount", "amountPaid"]) },
      };
    },
  },
  {
    key: "categories",
    title: "Expense category breakdown",
    description: "Spending grouped by category.",
    group: "Finance",
    filters: ["fy", "range", "project"],
    run: async (db, f) => {
      const rows = await categoryBreakdown(db, ff(f));
      return { columns: [t("Category", "category", 28), t("Bucket", "kind", 12), n("Entries", "entries"), m("Total", "total")], rows, totals: { category: "Total", entries: rows.reduce((a, r) => a + r.entries, 0), ...sumCols(rows, ["total"]) } };
    },
  },
  {
    key: "budget-vs-actual",
    title: "Budget vs actual",
    description: "Project budgets against recorded costs, with variance.",
    group: "Projects",
    filters: ["fy", "range", "project"],
    run: async (db, f) => {
      const rows = await projectBudgetVsActual(db, ff(f));
      return {
        columns: [t("Code", "code", 10), t("Project", "name", 30), t("Opened in", "year", 11), t("Status", "status", 10), m("Budget", "budget"), m("Actual cost", "actual"), m("Variance (budget − actual)", "variance"), m("Contract value", "contractValue"), m("Estimated balance", "estimatedBalance")],
        rows,
        totals: { name: "Total", ...sumCols(rows, ["budget", "actual", "variance", "contractValue", "estimatedBalance"]) },
      };
    },
  },
  {
    key: "project-costs",
    title: "Project cost breakdown",
    description: "Cost by category for one project (or all projects).",
    group: "Projects",
    filters: ["fy", "range", "project"],
    run: async (db, f) => {
      const rows = await categoryBreakdown(db, { ...ff(f), projectId: f.projectId });
      const note = f.projectId ? undefined : "Showing all expenses. Choose a project to see a single project's breakdown.";
      return { columns: [t("Category", "category", 28), n("Entries", "entries"), m("Total", "total")], rows, totals: { category: "Total", entries: rows.reduce((a, r) => a + r.entries, 0), ...sumCols(rows, ["total"]) }, note };
    },
  },
  {
    key: "materials",
    title: "Materials & spares",
    description: "Item-level purchases and planned items.",
    group: "Projects",
    filters: ["fy", "range", "project", "category"],
    run: async (db, f) => {
      const rows = await exportMaterials(db, f);
      return {
        columns: [d("Purchase date", "purchaseDate"), t("Project", "projectCode", 10), t("Category", "categoryName"), t("Item", "itemName", 30), t("Specification", "specification", 24), t("Make / model", "makeModel", 18), t("Supplier", "supplierName", 22), n("Qty", "quantity"), t("Unit", "unit", 8), m("Unit cost", "unitCost"), m("GST", "gstAmount"), m("Total", "totalAmount"), t("Status", "status", 10), t("Payment", "paymentStatus", 10), t("Reference", "purchaseReference", 14)],
        rows,
        totals: { itemName: "Total (purchased only counts as spend)", ...sumCols(rows.filter((r) => r.status !== "planned"), ["gstAmount", "totalAmount"]) },
      };
    },
  },
  {
    key: "receivables",
    title: "Receipts & receivables",
    description: "Invoices raised, money received and what is still due.",
    group: "Projects",
    filters: ["fy", "range", "project"],
    run: async (db, f) => {
      const res = await listInvoices(db, { ...f, page: 1, pageSize: 200 });
      const rows = res.rows;
      return {
        columns: [t("Invoice", "invoiceNumber", 12), d("Date", "invoiceDate"), t("Project", "projectCode", 10), t("Customer", "customer", 24), m("Base", "baseAmount"), m("GST", "gstAmount"), m("Total", "totalAmount"), m("Received", "received"), m("Outstanding", "outstanding"), t("Status", "status", 14)],
        rows,
        totals: { invoiceNumber: "Total", ...sumCols(rows.filter((r) => r.status !== "cancelled"), ["baseAmount", "gstAmount", "totalAmount", "received", "outstanding"]) },
        note: res.total > rows.length ? `Showing the latest ${rows.length} of ${res.total} invoices.` : undefined,
      };
    },
  },
  {
    key: "outstanding",
    title: "Outstanding payments",
    description: "Unpaid and part-paid expenses and salaries.",
    group: "Finance",
    filters: ["fy", "range", "project"],
    run: async (db, f) => {
      const rows = await outstandingPayments(db, ff(f));
      return {
        columns: [t("Type", "type", 10), d("Date", "date"), t("Description", "description", 36), t("Party", "party", 22), t("Project", "project", 10), m("Total", "total"), m("Paid", "paid"), m("Outstanding", "outstanding"), t("Status", "status", 10)],
        rows,
        totals: { description: "Total", ...sumCols(rows, ["total", "paid", "outstanding"]) },
      };
    },
  },
  {
    key: "suppliers",
    title: "Supplier / vendor spending",
    description: "What was spent with each supplier, paid and due.",
    group: "Suppliers",
    filters: ["fy", "range", "project"],
    run: async (db, f) => {
      const rows = await supplierSpending(db, ff(f));
      return {
        columns: [t("ID", "code", 8), t("Supplier", "name", 30), t("Category", "category"), n("Entries", "entries"), m("Total", "total"), m("Paid", "paid"), m("Outstanding", "outstanding")],
        rows,
        totals: { name: "Total", entries: rows.reduce((a, r) => a + r.entries, 0), ...sumCols(rows, ["total", "paid", "outstanding"]) },
      };
    },
  },
  {
    key: "payroll",
    title: "Employee payroll",
    description: "Monthly payroll with deductions, advances and payments.",
    group: "People",
    filters: ["fy", "range", "employee"],
    run: async (db, f) => {
      const rows = await exportPayroll(db, { fy: f.fy, from: f.from, to: f.to, employeeId: f.employeeId });
      return {
        columns: [{ header: "Month", value: (r) => (r.periodMonth ? monthLabel(r.periodMonth) : ""), type: "text", width: 11 }, t("Employee", "employeeName", 22), t("Pay type", "payType", 9), m("Salary / rate", "baseSalary"), n("Days paid", "daysPaid"), m("Earned", "earnedSalary"), m("Allowances", "allowances"), m("Deductions", "deductions"), m("Advance", "advance"), m("Gross", "grossSalary"), m("Net payable", "netPayable"), m("Paid", "amountPaid"), m("Outstanding", "outstanding"), t("Status", "paymentStatus", 10), d("Paid on", "paymentDate")],
        rows,
        totals: { employeeName: "Total", ...sumCols(rows, ["earnedSalary", "allowances", "deductions", "advance", "grossSalary", "netPayable", "amountPaid", "outstanding"]) },
      };
    },
  },
  {
    key: "attendance",
    title: "Attendance summary",
    description: "Per-employee attendance for a range (defaults to this month).",
    group: "People",
    filters: ["fy", "range", "employee"],
    run: async (db, f) => {
      const range = await attendanceRange(db, f);
      const rows = (await attendanceByEmployee(db, { ...range, employeeId: f.employeeId })).map((r) => ({ ...r, hours: minutesToHours(r.workedMinutes) }));
      return {
        columns: [t("Code", "code", 10), t("Employee", "name", 24), t("Department", "department"), n("Present", "present"), n("Half day", "halfDay"), n("Absent", "absent"), n("Leave", "leave"), n("Missing punch", "missingPunch"), n("Late", "late"), n("Hours", "hours")],
        rows,
        note: `Period: ${formatDate(range.from)} – ${formatDate(range.to)}`,
      };
    },
  },
  {
    key: "timesheets",
    title: "Timesheets",
    description: "Logged work by employee and project.",
    group: "People",
    filters: ["fy", "range", "project", "employee"],
    run: async (db, f) => {
      const rows = (await exportTimesheets(db, { fy: f.fy, from: f.from, to: f.to, projectId: f.projectId, employeeId: f.employeeId })).map((r) => ({ ...r, hours: minutesToHours(r.totalMinutes) }));
      return {
        columns: [d("Date", "workDate"), t("Employee", "employeeName", 22), t("Project", "projectCode", 10), t("Task", "task", 36), t("Start", "startTime", 8), t("End", "endTime", 8), n("Break (min)", "breakMinutes"), n("Hours", "hours"), t("Status", "status", 10)],
        rows,
        totals: { task: "Total hours", hours: minutesToHours(rows.reduce((a, r) => a + r.totalMinutes, 0)) },
      };
    },
  },
];

export function getReport(key: string) {
  return REPORTS.find((r) => r.key === key);
}
