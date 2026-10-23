/**
 * Wynderz portal — PostgreSQL schema (single database, modular monolith).
 *
 * Design rules:
 * - Financial years and projects are ROWS, never new tables.
 * - Money is numeric(14,2); Drizzle returns it as a string so no float math happens in JS.
 * - Every financial transaction carries financial_year_id, resolved server-side from its date.
 * - Spending totals = expenses + payroll. A purchased material is represented in totals by its
 *   linked expense row (materials.expense_id), never summed on its own, so nothing is double-counted.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const money = (name: string) => numeric(name, { precision: 14, scale: 2 });
const qty = (name: string) => numeric(name, { precision: 14, scale: 3 });
const rate = (name: string) => numeric(name, { precision: 5, scale: 2 });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/* ---------------------------------------------------------------- enums */

export const fyStatus = pgEnum("fy_status", ["open", "closed", "archived"]);
export const projectStatus = pgEnum("project_status", [
  "planned",
  "active",
  "on_hold",
  "completed",
  "cancelled",
]);
export const paymentStatus = pgEnum("payment_status", ["unpaid", "partial", "paid"]);
export const billStatus = pgEnum("bill_status", ["pending", "received", "not_applicable"]);
export const categoryType = pgEnum("category_type", ["expense", "material"]);
export const expenseKind = pgEnum("expense_kind", [
  "project",
  "office",
  "travel",
  "machine",
  "purchase",
  "materials",
  "other",
]);
export const expenseSource = pgEnum("expense_source", ["manual", "material"]);
export const materialStatus = pgEnum("material_status", ["planned", "ordered", "received"]);
export const payType = pgEnum("pay_type", ["monthly", "daily"]);
export const activeStatus = pgEnum("active_status", ["active", "inactive"]);
export const invoiceStatus = pgEnum("invoice_status", ["draft", "issued", "partially_paid", "paid", "cancelled"]);
export const attendanceStatus = pgEnum("attendance_status", [
  "present",
  "absent",
  "half_day",
  "leave",
  "missing_punch",
  "holiday",
  "weekly_off",
]);
export const recordSource = pgEnum("record_source", ["manual", "import"]);
export const timesheetStatus = pgEnum("timesheet_status", ["draft", "submitted", "approved", "rejected"]);
export const importType = pgEnum("import_type", ["attendance", "timesheet"]);
export const importStatus = pgEnum("import_status", ["previewed", "completed", "failed"]);
export const documentType = pgEnum("document_type", [
  "invoice",
  "bill",
  "quotation",
  "purchase_order",
  "contract",
  "receipt",
  "project_document",
  "drawing",
  "attendance_upload",
  "other",
]);

/* ---------------------------------------------------------------- auth */

export const users = pgTable(
  "users",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** sha256(token) — the raw token only ever lives in the user's cookie. */
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    ip: text("ip").notNull(),
    email: text("email").notNull(),
    success: boolean("success").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("login_attempts_ip_time_idx").on(t.ip, t.createdAt), index("login_attempts_email_time_idx").on(t.email, t.createdAt)],
);

/* ---------------------------------------------------------------- financial structure */

export const financialYears = pgTable(
  "financial_years",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    label: text("label").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: fyStatus("status").notNull().default("open"),
    budget: money("budget"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("financial_years_label_uq").on(sql`lower(${t.label})`),
    uniqueIndex("financial_years_start_uq").on(t.startDate),
    index("financial_years_range_idx").on(t.startDate, t.endDate),
    check("financial_years_range_chk", sql`${t.endDate} > ${t.startDate}`),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    type: categoryType("type").notNull(),
    name: text("name").notNull(),
    /** Reporting bucket for expense categories (office vs project vs travel ...). */
    kind: expenseKind("kind").notNull().default("other"),
    isActive: boolean("is_active").notNull().default(true),
    /** System categories are used by automatic links (materials -> expense, payroll -> expense). */
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("categories_type_name_uq").on(t.type, sql`lower(${t.name})`)],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    category: text("category"),
    contactPerson: text("contact_person"),
    phone: text("phone"),
    email: text("email"),
    gstin: text("gstin"),
    address: text("address"),
    city: text("city"),
    notes: text("notes"),
    status: activeStatus("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("suppliers_code_uq").on(t.code),
    uniqueIndex("suppliers_name_lower_uq").on(sql`lower(${t.name})`),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** Year the project was opened. Transactions carry their own year, so a project can span years. */
    financialYearId: integer("financial_year_id")
      .notNull()
      .references(() => financialYears.id, { onDelete: "restrict" }),
    customer: text("customer"),
    description: text("description"),
    poReference: text("po_reference"),
    startDate: date("start_date"),
    expectedEndDate: date("expected_end_date"),
    actualEndDate: date("actual_end_date"),
    status: projectStatus("status").notNull().default("active"),
    budget: money("budget"),
    contractValue: money("contract_value"),
    managerName: text("manager_name"),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("projects_code_uq").on(sql`lower(${t.code})`),
    index("projects_fy_status_idx").on(t.financialYearId, t.status),
  ],
);

/* ---------------------------------------------------------------- receivables */

export const invoices = pgTable(
  "invoices",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    financialYearId: integer("financial_year_id")
      .notNull()
      .references(() => financialYears.id, { onDelete: "restrict" }),
    projectId: integer("project_id").references(() => projects.id, { onDelete: "restrict" }),
    invoiceNumber: text("invoice_number").notNull(),
    invoiceDate: date("invoice_date").notNull(),
    dueDate: date("due_date"),
    customer: text("customer"),
    baseAmount: money("base_amount").notNull(),
    gstRate: rate("gst_rate").notNull().default("0"),
    gstAmount: money("gst_amount").notNull(),
    totalAmount: money("total_amount").notNull(),
    status: invoiceStatus("status").notNull().default("issued"),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("invoices_number_uq").on(sql`lower(${t.invoiceNumber})`),
    index("invoices_fy_date_idx").on(t.financialYearId, t.invoiceDate),
    index("invoices_project_idx").on(t.projectId),
  ],
);

export const receipts = pgTable(
  "receipts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    financialYearId: integer("financial_year_id")
      .notNull()
      .references(() => financialYears.id, { onDelete: "restrict" }),
    projectId: integer("project_id").references(() => projects.id, { onDelete: "restrict" }),
    invoiceId: integer("invoice_id").references(() => invoices.id, { onDelete: "restrict" }),
    receiptDate: date("receipt_date").notNull(),
    amount: money("amount").notNull(),
    paymentMethod: text("payment_method"),
    reference: text("reference"),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("receipts_fy_date_idx").on(t.financialYearId, t.receiptDate),
    index("receipts_project_idx").on(t.projectId),
    index("receipts_invoice_idx").on(t.invoiceId),
    check("receipts_amount_chk", sql`${t.amount} > 0`),
  ],
);

/* ---------------------------------------------------------------- employees */

export const employees = pgTable(
  "employees",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    employeeCode: text("employee_code").notNull(),
    /** User ID as enrolled on the biometric device; used to match attendance imports. */
    deviceUserId: text("device_user_id"),
    name: text("name").notNull(),
    department: text("department"),
    designation: text("designation"),
    joiningDate: date("joining_date"),
    exitDate: date("exit_date"),
    status: activeStatus("status").notNull().default("active"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    payType: payType("pay_type").notNull().default("monthly"),
    monthlySalary: money("monthly_salary"),
    dailyRate: money("daily_rate"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("employees_code_uq").on(sql`lower(${t.employeeCode})`),
    uniqueIndex("employees_device_uq").on(t.deviceUserId),
    index("employees_status_idx").on(t.status),
  ],
);

/* ---------------------------------------------------------------- spending */

export const expenses = pgTable(
  "expenses",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    financialYearId: integer("financial_year_id")
      .notNull()
      .references(() => financialYears.id, { onDelete: "restrict" }),
    expenseDate: date("expense_date").notNull(),
    projectId: integer("project_id").references(() => projects.id, { onDelete: "restrict" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    supplierId: integer("supplier_id").references(() => suppliers.id, { onDelete: "restrict" }),
    payeeName: text("payee_name"),
    description: text("description").notNull(),
    quantity: qty("quantity"),
    unitPrice: money("unit_price"),
    baseAmount: money("base_amount").notNull(),
    gstRate: rate("gst_rate").notNull().default("0"),
    gstAmount: money("gst_amount").notNull().default("0"),
    totalAmount: money("total_amount").notNull(),
    amountPaid: money("amount_paid").notNull().default("0"),
    paymentStatus: paymentStatus("payment_status").notNull().default("unpaid"),
    paymentMethod: text("payment_method"),
    paidBy: text("paid_by"),
    paymentDate: date("payment_date"),
    paymentReference: text("payment_reference"),
    billNumber: text("bill_number"),
    billStatus: billStatus("bill_status").notNull().default("pending"),
    notes: text("notes"),
    source: expenseSource("source").notNull().default("manual"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("expenses_fy_date_idx").on(t.financialYearId, t.expenseDate),
    index("expenses_project_date_idx").on(t.projectId, t.expenseDate),
    index("expenses_category_idx").on(t.categoryId),
    index("expenses_supplier_idx").on(t.supplierId),
    index("expenses_status_idx").on(t.paymentStatus),
    index("expenses_created_by_idx").on(t.createdBy),
    check("expenses_amounts_chk", sql`${t.baseAmount} >= 0 AND ${t.gstAmount} >= 0 AND ${t.amountPaid} >= 0`),
  ],
);

export const materials = pgTable(
  "materials",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    financialYearId: integer("financial_year_id")
      .notNull()
      .references(() => financialYears.id, { onDelete: "restrict" }),
    projectId: integer("project_id").references(() => projects.id, { onDelete: "restrict" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    supplierId: integer("supplier_id").references(() => suppliers.id, { onDelete: "restrict" }),
    itemName: text("item_name").notNull(),
    specification: text("specification"),
    makeModel: text("make_model"),
    quantity: qty("quantity").notNull().default("1"),
    unit: text("unit"),
    unitCost: money("unit_cost").notNull(),
    gstRate: rate("gst_rate").notNull().default("0"),
    baseAmount: money("base_amount").notNull(),
    gstAmount: money("gst_amount").notNull(),
    totalAmount: money("total_amount").notNull(),
    /** planned = estimate only (no spend). ordered/received = purchased; linked expense carries the money. */
    status: materialStatus("status").notNull().default("received"),
    purchaseDate: date("purchase_date"),
    purchaseReference: text("purchase_reference"),
    amountPaid: money("amount_paid").notNull().default("0"),
    paymentStatus: paymentStatus("payment_status").notNull().default("unpaid"),
    /** The single expense row that represents this purchase in all financial totals. */
    expenseId: integer("expense_id").references(() => expenses.id, { onDelete: "set null" }),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("materials_expense_uq").on(t.expenseId),
    index("materials_fy_project_idx").on(t.financialYearId, t.projectId),
    index("materials_project_idx").on(t.projectId),
    index("materials_category_idx").on(t.categoryId),
    index("materials_supplier_idx").on(t.supplierId),
    index("materials_status_idx").on(t.status),
  ],
);

export const payrollRecords = pgTable(
  "payroll_records",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    financialYearId: integer("financial_year_id")
      .notNull()
      .references(() => financialYears.id, { onDelete: "restrict" }),
    /** First day of the pay month. */
    periodMonth: date("period_month").notNull(),
    payType: payType("pay_type").notNull().default("monthly"),
    /** Monthly salary (monthly pay type) or daily rate (daily pay type), snapshotted at the time. */
    baseSalary: money("base_salary").notNull(),
    earnedSalary: money("earned_salary").notNull(),
    workingDays: integer("working_days"),
    daysPaid: numeric("days_paid", { precision: 5, scale: 1 }),
    absentDays: numeric("absent_days", { precision: 5, scale: 1 }),
    allowances: money("allowances").notNull().default("0"),
    deductions: money("deductions").notNull().default("0"),
    advance: money("advance").notNull().default("0"),
    attendanceAdjustment: money("attendance_adjustment").notNull().default("0"),
    grossSalary: money("gross_salary").notNull(),
    netPayable: money("net_payable").notNull(),
    amountPaid: money("amount_paid").notNull().default("0"),
    paymentDate: date("payment_date"),
    paymentMethod: text("payment_method"),
    paymentStatus: paymentStatus("payment_status").notNull().default("unpaid"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("payroll_employee_period_uq").on(t.employeeId, t.periodMonth),
    index("payroll_fy_period_idx").on(t.financialYearId, t.periodMonth),
    index("payroll_period_idx").on(t.periodMonth),
    index("payroll_payment_status_idx").on(t.paymentStatus),
  ],
);

/* ---------------------------------------------------------------- attendance & timesheets */

export const importMappings = pgTable(
  "import_mappings",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    type: importType("type").notNull(),
    name: text("name").notNull(),
    config: jsonb("config").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("import_mappings_type_name_uq").on(t.type, sql`lower(${t.name})`)],
);

export const importJobs = pgTable(
  "import_jobs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    type: importType("type").notNull(),
    status: importStatus("status").notNull().default("previewed"),
    fileName: text("file_name").notNull(),
    fileHash: text("file_hash").notNull(),
    documentId: integer("document_id"),
    mappingConfig: jsonb("mapping_config"),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    totalRows: integer("total_rows").notNull().default(0),
    importedRows: integer("imported_rows").notNull().default(0),
    updatedRows: integer("updated_rows").notNull().default(0),
    skippedRows: integer("skipped_rows").notNull().default(0),
    errorRows: integer("error_rows").notNull().default(0),
    issues: jsonb("issues"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("import_jobs_type_time_idx").on(t.type, t.createdAt), index("import_jobs_created_by_idx").on(t.createdBy)],
);

/** Raw biometric punches. Re-importing the same export is a no-op thanks to the unique key. */
export const attendancePunches = pgTable(
  "attendance_punches",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    punchedAt: timestamp("punched_at", { mode: "string" }).notNull(),
    workDate: date("work_date").notNull(),
    deviceId: text("device_id"),
    importJobId: integer("import_job_id").references(() => importJobs.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("attendance_punches_uq").on(t.employeeId, t.punchedAt),
    index("attendance_punches_emp_date_idx").on(t.employeeId, t.workDate),
    index("attendance_punches_import_job_idx").on(t.importJobId),
  ],
);

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    workDate: date("work_date").notNull(),
    firstIn: time("first_in"),
    lastOut: time("last_out"),
    workedMinutes: integer("worked_minutes"),
    punchCount: integer("punch_count").notNull().default(0),
    status: attendanceStatus("status").notNull(),
    isLate: boolean("is_late").notNull().default(false),
    source: recordSource("source").notNull().default("manual"),
    importJobId: integer("import_job_id").references(() => importJobs.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("attendance_emp_date_uq").on(t.employeeId, t.workDate),
    index("attendance_date_idx").on(t.workDate),
    index("attendance_records_import_job_idx").on(t.importJobId),
  ],
);

export const timesheets = pgTable(
  "timesheets",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    projectId: integer("project_id").references(() => projects.id, { onDelete: "restrict" }),
    workDate: date("work_date").notNull(),
    task: text("task").notNull(),
    startTime: time("start_time"),
    endTime: time("end_time"),
    breakMinutes: integer("break_minutes").notNull().default(0),
    totalMinutes: integer("total_minutes").notNull(),
    status: timesheetStatus("status").notNull().default("submitted"),
    source: recordSource("source").notNull().default("manual"),
    importJobId: integer("import_job_id").references(() => importJobs.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("timesheets_emp_date_idx").on(t.employeeId, t.workDate),
    index("timesheets_project_date_idx").on(t.projectId, t.workDate),
    index("timesheets_date_idx").on(t.workDate),
    index("timesheets_status_idx").on(t.status),
    index("timesheets_import_job_idx").on(t.importJobId),
    check("timesheets_minutes_chk", sql`${t.totalMinutes} >= 0 AND ${t.totalMinutes} <= 1440 AND ${t.breakMinutes} >= 0`),
  ],
);

/* ---------------------------------------------------------------- supporting */

export const documents = pgTable(
  "documents",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    title: text("title").notNull(),
    docType: documentType("doc_type").notNull().default("other"),
    originalName: text("original_name").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    financialYearId: integer("financial_year_id").references(() => financialYears.id, { onDelete: "set null" }),
    projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
    expenseId: integer("expense_id").references(() => expenses.id, { onDelete: "set null" }),
    materialId: integer("material_id").references(() => materials.id, { onDelete: "set null" }),
    supplierId: integer("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    invoiceId: integer("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    notes: text("notes"),
    uploadedBy: integer("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("documents_storage_key_uq").on(t.storageKey),
    index("documents_project_idx").on(t.projectId),
    index("documents_expense_idx").on(t.expenseId),
    index("documents_material_idx").on(t.materialId),
    index("documents_supplier_idx").on(t.supplierId),
    index("documents_fy_idx").on(t.financialYearId),
    index("documents_invoice_idx").on(t.invoiceId),
    index("documents_uploaded_by_idx").on(t.uploadedBy),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    userEmail: text("user_email"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    summary: text("summary"),
    changes: jsonb("changes"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_time_idx").on(t.createdAt),
    index("audit_logs_entity_idx").on(t.entity, t.entityId),
    index("audit_logs_user_idx").on(t.userId),
  ],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
});
