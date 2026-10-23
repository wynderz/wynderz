/** Form definitions for every entity. Server pages build these with live option lists. */
import type { Field, FieldOption } from "@/components/portal/forms";

type Opt = { id: number; label: string };
const opts = (rows: Opt[]): FieldOption[] => rows.map((r) => ({ value: String(r.id), label: r.label }));
const enumOpts = (values: readonly string[]): FieldOption[] => values.map((v) => ({ value: v, label: v.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) }));

export const PAYMENT_METHOD_OPTIONS = enumOpts(["Cash", "Bank Transfer", "UPI", "Cheque", "Card", "Other"]);

export type Lookups = {
  years?: Array<{ id: number; label: string }>;
  projects?: Array<{ id: number; code: string; name: string }>;
  suppliers?: Array<{ id: number; name: string }>;
  expenseCategories?: Array<{ id: number; name: string; isActive: boolean }>;
  materialCategories?: Array<{ id: number; name: string; isActive: boolean }>;
  employees?: Array<{ id: number; name: string; employeeCode: string }>;
  invoices?: Array<{ id: number; invoiceNumber: string; projectId?: number | null }>;
};

const projectOpts = (l: Lookups) => opts((l.projects ?? []).map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` })));
const supplierOpts = (l: Lookups) => opts((l.suppliers ?? []).map((s) => ({ id: s.id, label: s.name })));
const yearOpts = (l: Lookups) => opts((l.years ?? []).map((y) => ({ id: y.id, label: y.label })));
const employeeOpts = (l: Lookups) => opts((l.employees ?? []).map((e) => ({ id: e.id, label: `${e.name} (${e.employeeCode})` })));

export const yearFields: Field[] = [
  { name: "label", label: "Label", type: "text", required: true, placeholder: "FY 2026-27" },
  { name: "budget", label: "Annual budget (₹)", type: "money", help: "Optional — used for budget vs actual." },
  { name: "startDate", label: "Start date", type: "date", required: true },
  { name: "endDate", label: "End date", type: "date", required: true },
  { name: "notes", label: "Notes", type: "textarea" },
];

export function projectFields(l: Lookups): Field[] {
  return [
    { name: "name", label: "Project name", type: "text", required: true, span: 2 },
    { name: "code", label: "Project code", type: "text", placeholder: "Auto (PRJ-001)", help: "Leave blank to auto-number." },
    { name: "financialYearId", label: "Financial year opened", type: "select", required: true, options: yearOpts(l) },
    { name: "customer", label: "Customer", type: "text" },
    { name: "poReference", label: "PO / contract reference", type: "text" },
    { name: "status", label: "Status", type: "select", required: true, options: enumOpts(["planned", "active", "on_hold", "completed", "cancelled"]) },
    { name: "managerName", label: "Project manager", type: "text" },
    { name: "budget", label: "Budget (₹)", type: "money" },
    { name: "contractValue", label: "Contract value (₹)", type: "money", help: "Agreement value — not counted as revenue received." },
    { name: "startDate", label: "Start date", type: "date" },
    { name: "expectedEndDate", label: "Expected completion", type: "date" },
    { name: "actualEndDate", label: "Actual completion", type: "date" },
    { name: "description", label: "Description", type: "textarea" },
    { name: "notes", label: "Notes", type: "textarea" },
  ];
}

export function expenseFields(l: Lookups): Field[] {
  return [
    { name: "expenseDate", label: "Date", type: "date", required: true, help: "The financial year is set from this date." },
    { name: "categoryId", label: "Category", type: "select", required: true, options: opts((l.expenseCategories ?? []).filter((c) => c.isActive).map((c) => ({ id: c.id, label: c.name }))) },
    { name: "description", label: "Description", type: "text", required: true, span: 2 },
    { name: "projectId", label: "Project", type: "select", options: projectOpts(l), emptyLabel: "— General / office —" },
    { name: "supplierId", label: "Supplier / vendor", type: "select", options: supplierOpts(l) },
    { name: "payeeName", label: "Payee (if not a listed supplier)", type: "text" },
    { name: "billNumber", label: "Invoice / bill no.", type: "text" },
    { name: "quantity", label: "Quantity", type: "number", step: "any", min: "0" },
    { name: "unitPrice", label: "Unit price (₹)", type: "money" },
    { name: "baseAmount", label: "Base amount (₹)", type: "money", help: "Or leave blank to use quantity × unit price." },
    { name: "gstRate", label: "GST %", type: "percent" },
    { name: "paymentStatus", label: "Payment status", type: "select", options: enumOpts(["unpaid", "partial", "paid"]), emptyLabel: "Unpaid" },
    { name: "amountPaid", label: "Amount paid (₹)", type: "money", help: "Leave blank with “Paid” to pay in full." },
    { name: "paymentMethod", label: "Payment method", type: "select", options: PAYMENT_METHOD_OPTIONS },
    { name: "paidBy", label: "Paid by", type: "text" },
    { name: "paymentDate", label: "Payment date", type: "date" },
    { name: "paymentReference", label: "Payment reference", type: "text" },
    { name: "billStatus", label: "Bill status", type: "select", required: true, options: enumOpts(["pending", "received", "not_applicable"]) },
    { name: "notes", label: "Notes", type: "textarea" },
  ];
}

export function materialFields(l: Lookups): Field[] {
  return [
    { name: "itemName", label: "Item name", type: "text", required: true, span: 2 },
    { name: "categoryId", label: "Category", type: "select", required: true, options: opts((l.materialCategories ?? []).filter((c) => c.isActive).map((c) => ({ id: c.id, label: c.name }))) },
    { name: "projectId", label: "Project", type: "select", options: projectOpts(l), emptyLabel: "— Not project-specific —" },
    { name: "specification", label: "Specification", type: "text" },
    { name: "makeModel", label: "Make / model", type: "text" },
    { name: "supplierId", label: "Supplier", type: "select", options: supplierOpts(l) },
    { name: "status", label: "Status", type: "select", required: true, options: enumOpts(["planned", "ordered", "received"]), help: "Planned = estimate only. Ordered/received creates the linked expense." },
    { name: "quantity", label: "Quantity", type: "number", required: true, step: "any", min: "0" },
    { name: "unit", label: "Unit", type: "text", placeholder: "pcs, m, kg…" },
    { name: "unitCost", label: "Unit cost (₹)", type: "money", required: true },
    { name: "gstRate", label: "GST %", type: "percent" },
    { name: "purchaseDate", label: "Purchase date", type: "date", showIf: { field: "status", in: ["ordered", "received"] } },
    { name: "financialYearId", label: "Financial year", type: "select", options: yearOpts(l), showIf: { field: "status", in: ["planned"] } },
    { name: "purchaseReference", label: "Purchase / bill reference", type: "text", showIf: { field: "status", in: ["ordered", "received"] } },
    { name: "paymentStatus", label: "Payment status", type: "select", options: enumOpts(["unpaid", "partial", "paid"]), emptyLabel: "Unpaid", showIf: { field: "status", in: ["ordered", "received"] } },
    { name: "amountPaid", label: "Amount paid (₹)", type: "money", showIf: { field: "status", in: ["ordered", "received"] } },
    { name: "paymentMethod", label: "Payment method", type: "select", options: PAYMENT_METHOD_OPTIONS, showIf: { field: "status", in: ["ordered", "received"] } },
    { name: "paidBy", label: "Paid by", type: "text", showIf: { field: "status", in: ["ordered", "received"] } },
    { name: "notes", label: "Notes", type: "textarea" },
  ];
}

export const supplierFields: Field[] = [
  { name: "name", label: "Supplier name", type: "text", required: true, span: 2 },
  { name: "code", label: "Supplier ID", type: "text", placeholder: "Auto (V-001)" },
  { name: "category", label: "Category", type: "text", placeholder: "Bearings, Steel, Logistics…" },
  { name: "contactPerson", label: "Contact person", type: "text" },
  { name: "phone", label: "Phone", type: "text" },
  { name: "email", label: "Email", type: "email" },
  { name: "gstin", label: "GSTIN", type: "text" },
  { name: "city", label: "City / location", type: "text" },
  { name: "status", label: "Status", type: "select", required: true, options: enumOpts(["active", "inactive"]) },
  { name: "address", label: "Address", type: "textarea" },
  { name: "notes", label: "Notes", type: "textarea" },
];

export const employeeFields: Field[] = [
  { name: "name", label: "Full name", type: "text", required: true, span: 2 },
  { name: "employeeCode", label: "Employee ID", type: "text", placeholder: "Auto (EMP-001)" },
  { name: "deviceUserId", label: "Biometric device user ID", type: "text", help: "Must match the ID in fingerprint device exports." },
  { name: "department", label: "Department", type: "text" },
  { name: "designation", label: "Designation", type: "text" },
  { name: "joiningDate", label: "Joining date", type: "date" },
  { name: "exitDate", label: "Exit date", type: "date" },
  { name: "status", label: "Status", type: "select", required: true, options: enumOpts(["active", "inactive"]) },
  { name: "payType", label: "Pay type", type: "select", required: true, options: [{ value: "monthly", label: "Monthly salary" }, { value: "daily", label: "Daily wage" }] },
  { name: "monthlySalary", label: "Monthly salary (₹)", type: "money", showIf: { field: "payType", in: ["monthly"] } },
  { name: "dailyRate", label: "Daily rate (₹)", type: "money", showIf: { field: "payType", in: ["daily"] } },
  { name: "phone", label: "Phone", type: "text" },
  { name: "email", label: "Email", type: "email" },
  { name: "address", label: "Address", type: "textarea" },
  { name: "notes", label: "Notes", type: "textarea" },
];

export function payrollFields(l: Lookups): Field[] {
  return [
    { name: "employeeId", label: "Employee", type: "select", required: true, options: employeeOpts(l) },
    { name: "periodMonth", label: "Pay month", type: "month", required: true },
    { name: "baseSalary", label: "Salary / daily rate (₹)", type: "money", help: "Blank = employee's configured rate." },
    { name: "workingDays", label: "Working days", type: "number", min: "1", max: "31", help: "Blank = settings policy (calendar days by default)." },
    { name: "daysPaid", label: "Days paid", type: "number", step: "0.5", min: "0", max: "31", help: "Blank = full month (monthly pay)." },
    { name: "absentDays", label: "Absent days", type: "number", step: "0.5", min: "0", max: "31" },
    { name: "allowances", label: "Allowances / additions (₹)", type: "money" },
    { name: "attendanceAdjustment", label: "Attendance adjustment (₹)", type: "text", help: "Signed amount, e.g. -500 or 750." },
    { name: "deductions", label: "Deductions (₹)", type: "money" },
    { name: "advance", label: "Advance recovered (₹)", type: "money" },
    { name: "amountPaid", label: "Amount paid (₹)", type: "money" },
    { name: "paymentDate", label: "Payment date", type: "date" },
    { name: "paymentMethod", label: "Payment method", type: "select", options: PAYMENT_METHOD_OPTIONS },
    { name: "notes", label: "Notes", type: "textarea" },
  ];
}

export const paymentFields: Field[] = [
  { name: "amountPaid", label: "Total amount paid so far (₹)", type: "money", required: true },
  { name: "paymentDate", label: "Payment date", type: "date" },
  { name: "paymentMethod", label: "Payment method", type: "select", options: PAYMENT_METHOD_OPTIONS },
];

export function timesheetFields(l: Lookups): Field[] {
  return [
    { name: "employeeId", label: "Employee", type: "select", required: true, options: employeeOpts(l) },
    { name: "workDate", label: "Work date", type: "date", required: true },
    { name: "projectId", label: "Project", type: "select", options: projectOpts(l) },
    { name: "status", label: "Status", type: "select", required: true, options: enumOpts(["draft", "submitted", "approved", "rejected"]) },
    { name: "task", label: "Task description", type: "text", required: true, span: 2 },
    { name: "startTime", label: "Start time", type: "time" },
    { name: "endTime", label: "End time", type: "time" },
    { name: "breakMinutes", label: "Break (minutes)", type: "number", min: "0" },
    { name: "hours", label: "Total hours (if no times)", type: "number", step: "0.25", min: "0", max: "24" },
    { name: "notes", label: "Notes", type: "textarea" },
  ];
}

export function attendanceFields(l: Lookups): Field[] {
  return [
    { name: "employeeId", label: "Employee", type: "select", required: true, options: employeeOpts(l) },
    { name: "workDate", label: "Date", type: "date", required: true },
    { name: "status", label: "Status", type: "select", required: true, options: enumOpts(["present", "absent", "half_day", "leave", "missing_punch", "holiday", "weekly_off"]) },
    { name: "firstIn", label: "In time", type: "time" },
    { name: "lastOut", label: "Out time", type: "time" },
    { name: "notes", label: "Notes", type: "textarea" },
  ];
}

export function invoiceFields(l: Lookups): Field[] {
  return [
    { name: "invoiceNumber", label: "Invoice number", type: "text", required: true },
    { name: "invoiceDate", label: "Invoice date", type: "date", required: true },
    { name: "projectId", label: "Project", type: "select", options: projectOpts(l) },
    { name: "customer", label: "Customer", type: "text", help: "Blank = project customer." },
    { name: "baseAmount", label: "Basic value (₹)", type: "money", required: true },
    { name: "gstRate", label: "GST %", type: "percent" },
    { name: "dueDate", label: "Due date", type: "date" },
    { name: "status", label: "Status", type: "select", required: true, options: enumOpts(["draft", "issued", "cancelled"]), help: "Paid / partially paid is set automatically from receipts." },
    { name: "notes", label: "Notes", type: "textarea" },
  ];
}

export function receiptFields(l: Lookups): Field[] {
  return [
    { name: "receiptDate", label: "Date received", type: "date", required: true },
    { name: "amount", label: "Amount received (₹)", type: "money", required: true },
    { name: "invoiceId", label: "Against invoice", type: "select", options: opts((l.invoices ?? []).map((i) => ({ id: i.id, label: i.invoiceNumber }))) },
    { name: "projectId", label: "Project", type: "select", options: projectOpts(l), help: "Taken from the invoice if blank." },
    { name: "paymentMethod", label: "Method", type: "select", options: PAYMENT_METHOD_OPTIONS },
    { name: "reference", label: "Reference / UTR", type: "text" },
    { name: "notes", label: "Notes", type: "textarea" },
  ];
}

export const DOC_TYPE_OPTIONS = enumOpts(["invoice", "bill", "quotation", "purchase_order", "contract", "receipt", "project_document", "drawing", "attendance_upload", "other"]);

export function documentMetaFields(l: Lookups): Field[] {
  return [
    { name: "title", label: "Title", type: "text", required: true, span: 2 },
    { name: "docType", label: "Document type", type: "select", required: true, options: DOC_TYPE_OPTIONS },
    { name: "financialYearId", label: "Financial year", type: "select", options: yearOpts(l) },
    { name: "projectId", label: "Project", type: "select", options: projectOpts(l) },
    { name: "supplierId", label: "Supplier", type: "select", options: supplierOpts(l) },
    { name: "expenseId", label: "Expense ID", type: "number", help: "Optional: link to an expense #" },
    { name: "materialId", label: "Material ID", type: "number", help: "Optional: link to a material #" },
    { name: "notes", label: "Notes", type: "textarea" },
  ];
}

export const categoryFields: Field[] = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "type", label: "Used for", type: "select", required: true, options: [{ value: "expense", label: "Expenses" }, { value: "material", label: "Materials & spares" }] },
  { name: "kind", label: "Reporting bucket", type: "select", required: true, options: enumOpts(["project", "office", "travel", "machine", "purchase", "other"]), showIf: { field: "type", in: ["expense"] } },
  { name: "isActive", label: "Active", type: "checkbox" },
];
