CREATE TYPE "public"."active_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'half_day', 'leave', 'missing_punch', 'holiday', 'weekly_off');--> statement-breakpoint
CREATE TYPE "public"."bill_status" AS ENUM('pending', 'received', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."category_type" AS ENUM('expense', 'material');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('invoice', 'bill', 'quotation', 'purchase_order', 'contract', 'receipt', 'project_document', 'drawing', 'attendance_upload', 'other');--> statement-breakpoint
CREATE TYPE "public"."expense_kind" AS ENUM('project', 'office', 'travel', 'machine', 'purchase', 'materials', 'other');--> statement-breakpoint
CREATE TYPE "public"."expense_source" AS ENUM('manual', 'material');--> statement-breakpoint
CREATE TYPE "public"."fy_status" AS ENUM('open', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('previewed', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."import_type" AS ENUM('attendance', 'timesheet');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'issued', 'partially_paid', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."material_status" AS ENUM('planned', 'ordered', 'received');--> statement-breakpoint
CREATE TYPE "public"."pay_type" AS ENUM('monthly', 'daily');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('unpaid', 'partial', 'paid');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('planned', 'active', 'on_hold', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."record_source" AS ENUM('manual', 'import');--> statement-breakpoint
CREATE TYPE "public"."timesheet_status" AS ENUM('draft', 'submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "attendance_punches" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attendance_punches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"employee_id" integer NOT NULL,
	"punched_at" timestamp NOT NULL,
	"work_date" date NOT NULL,
	"device_id" text,
	"import_job_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attendance_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"employee_id" integer NOT NULL,
	"work_date" date NOT NULL,
	"first_in" time,
	"last_out" time,
	"worked_minutes" integer,
	"punch_count" integer DEFAULT 0 NOT NULL,
	"status" "attendance_status" NOT NULL,
	"is_late" boolean DEFAULT false NOT NULL,
	"source" "record_source" DEFAULT 'manual' NOT NULL,
	"import_job_id" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" integer,
	"user_email" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"summary" text,
	"changes" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"type" "category_type" NOT NULL,
	"name" text NOT NULL,
	"kind" "expense_kind" DEFAULT 'other' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "documents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"doc_type" "document_type" DEFAULT 'other' NOT NULL,
	"original_name" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"financial_year_id" integer,
	"project_id" integer,
	"expense_id" integer,
	"material_id" integer,
	"supplier_id" integer,
	"invoice_id" integer,
	"notes" text,
	"uploaded_by" integer,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "employees_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"employee_code" text NOT NULL,
	"device_user_id" text,
	"name" text NOT NULL,
	"department" text,
	"designation" text,
	"joining_date" date,
	"exit_date" date,
	"status" "active_status" DEFAULT 'active' NOT NULL,
	"phone" text,
	"email" text,
	"address" text,
	"pay_type" "pay_type" DEFAULT 'monthly' NOT NULL,
	"monthly_salary" numeric(14, 2),
	"daily_rate" numeric(14, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "expenses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"financial_year_id" integer NOT NULL,
	"expense_date" date NOT NULL,
	"project_id" integer,
	"category_id" integer NOT NULL,
	"supplier_id" integer,
	"payee_name" text,
	"description" text NOT NULL,
	"quantity" numeric(14, 3),
	"unit_price" numeric(14, 2),
	"base_amount" numeric(14, 2) NOT NULL,
	"gst_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"gst_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"amount_paid" numeric(14, 2) DEFAULT '0' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL,
	"payment_method" text,
	"paid_by" text,
	"payment_date" date,
	"payment_reference" text,
	"bill_number" text,
	"bill_status" "bill_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"source" "expense_source" DEFAULT 'manual' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_amounts_chk" CHECK ("expenses"."base_amount" >= 0 AND "expenses"."gst_amount" >= 0 AND "expenses"."amount_paid" >= 0)
);
--> statement-breakpoint
CREATE TABLE "financial_years" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "financial_years_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"label" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "fy_status" DEFAULT 'open' NOT NULL,
	"budget" numeric(14, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_years_range_chk" CHECK ("financial_years"."end_date" > "financial_years"."start_date")
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "import_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"type" "import_type" NOT NULL,
	"status" "import_status" DEFAULT 'previewed' NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"document_id" integer,
	"mapping_config" jsonb,
	"period_start" date,
	"period_end" date,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"imported_rows" integer DEFAULT 0 NOT NULL,
	"updated_rows" integer DEFAULT 0 NOT NULL,
	"skipped_rows" integer DEFAULT 0 NOT NULL,
	"error_rows" integer DEFAULT 0 NOT NULL,
	"issues" jsonb,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "import_mappings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "import_mappings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"type" "import_type" NOT NULL,
	"name" text NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "invoices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"financial_year_id" integer NOT NULL,
	"project_id" integer,
	"invoice_number" text NOT NULL,
	"invoice_date" date NOT NULL,
	"due_date" date,
	"customer" text,
	"base_amount" numeric(14, 2) NOT NULL,
	"gst_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"gst_amount" numeric(14, 2) NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"status" "invoice_status" DEFAULT 'issued' NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "login_attempts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"ip" text NOT NULL,
	"email" text NOT NULL,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "materials_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"financial_year_id" integer NOT NULL,
	"project_id" integer,
	"category_id" integer NOT NULL,
	"supplier_id" integer,
	"item_name" text NOT NULL,
	"specification" text,
	"make_model" text,
	"quantity" numeric(14, 3) DEFAULT '1' NOT NULL,
	"unit" text,
	"unit_cost" numeric(14, 2) NOT NULL,
	"gst_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"base_amount" numeric(14, 2) NOT NULL,
	"gst_amount" numeric(14, 2) NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"status" "material_status" DEFAULT 'received' NOT NULL,
	"purchase_date" date,
	"purchase_reference" text,
	"amount_paid" numeric(14, 2) DEFAULT '0' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL,
	"expense_id" integer,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_records" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payroll_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"employee_id" integer NOT NULL,
	"financial_year_id" integer NOT NULL,
	"period_month" date NOT NULL,
	"pay_type" "pay_type" DEFAULT 'monthly' NOT NULL,
	"base_salary" numeric(14, 2) NOT NULL,
	"earned_salary" numeric(14, 2) NOT NULL,
	"working_days" integer,
	"days_paid" numeric(5, 1),
	"absent_days" numeric(5, 1),
	"allowances" numeric(14, 2) DEFAULT '0' NOT NULL,
	"deductions" numeric(14, 2) DEFAULT '0' NOT NULL,
	"advance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"attendance_adjustment" numeric(14, 2) DEFAULT '0' NOT NULL,
	"gross_salary" numeric(14, 2) NOT NULL,
	"net_payable" numeric(14, 2) NOT NULL,
	"amount_paid" numeric(14, 2) DEFAULT '0' NOT NULL,
	"payment_date" date,
	"payment_method" text,
	"payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "projects_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"financial_year_id" integer NOT NULL,
	"customer" text,
	"description" text,
	"po_reference" text,
	"start_date" date,
	"expected_end_date" date,
	"actual_end_date" date,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"budget" numeric(14, 2),
	"contract_value" numeric(14, 2),
	"manager_name" text,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "receipts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"financial_year_id" integer NOT NULL,
	"project_id" integer,
	"invoice_id" integer,
	"receipt_date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"payment_method" text,
	"reference" text,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_amount_chk" CHECK ("receipts"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "suppliers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"contact_person" text,
	"phone" text,
	"email" text,
	"gstin" text,
	"address" text,
	"city" text,
	"notes" text,
	"status" "active_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timesheets" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "timesheets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"employee_id" integer NOT NULL,
	"project_id" integer,
	"work_date" date NOT NULL,
	"task" text NOT NULL,
	"start_time" time,
	"end_time" time,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"total_minutes" integer NOT NULL,
	"status" timesheet_status DEFAULT 'submitted' NOT NULL,
	"source" "record_source" DEFAULT 'manual' NOT NULL,
	"import_job_id" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timesheets_minutes_chk" CHECK ("timesheets"."total_minutes" >= 0 AND "timesheets"."total_minutes" <= 1440 AND "timesheets"."break_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_import_job_id_import_jobs_id_fk" FOREIGN KEY ("import_job_id") REFERENCES "public"."import_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_import_job_id_import_jobs_id_fk" FOREIGN KEY ("import_job_id") REFERENCES "public"."import_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_financial_year_id_financial_years_id_fk" FOREIGN KEY ("financial_year_id") REFERENCES "public"."financial_years"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_financial_year_id_financial_years_id_fk" FOREIGN KEY ("financial_year_id") REFERENCES "public"."financial_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_financial_year_id_financial_years_id_fk" FOREIGN KEY ("financial_year_id") REFERENCES "public"."financial_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_financial_year_id_financial_years_id_fk" FOREIGN KEY ("financial_year_id") REFERENCES "public"."financial_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_financial_year_id_financial_years_id_fk" FOREIGN KEY ("financial_year_id") REFERENCES "public"."financial_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_financial_year_id_financial_years_id_fk" FOREIGN KEY ("financial_year_id") REFERENCES "public"."financial_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_financial_year_id_financial_years_id_fk" FOREIGN KEY ("financial_year_id") REFERENCES "public"."financial_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_import_job_id_import_jobs_id_fk" FOREIGN KEY ("import_job_id") REFERENCES "public"."import_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_punches_uq" ON "attendance_punches" USING btree ("employee_id","punched_at");--> statement-breakpoint
CREATE INDEX "attendance_punches_emp_date_idx" ON "attendance_punches" USING btree ("employee_id","work_date");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_emp_date_uq" ON "attendance_records" USING btree ("employee_id","work_date");--> statement-breakpoint
CREATE INDEX "attendance_date_idx" ON "attendance_records" USING btree ("work_date");--> statement-breakpoint
CREATE INDEX "audit_logs_time_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_type_name_uq" ON "categories" USING btree ("type",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "documents_storage_key_uq" ON "documents" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "documents_project_idx" ON "documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "documents_expense_idx" ON "documents" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "documents_material_idx" ON "documents" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "documents_supplier_idx" ON "documents" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "documents_fy_idx" ON "documents" USING btree ("financial_year_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_code_uq" ON "employees" USING btree (lower("employee_code"));--> statement-breakpoint
CREATE UNIQUE INDEX "employees_device_uq" ON "employees" USING btree ("device_user_id");--> statement-breakpoint
CREATE INDEX "employees_status_idx" ON "employees" USING btree ("status");--> statement-breakpoint
CREATE INDEX "expenses_fy_date_idx" ON "expenses" USING btree ("financial_year_id","expense_date");--> statement-breakpoint
CREATE INDEX "expenses_project_date_idx" ON "expenses" USING btree ("project_id","expense_date");--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "expenses_supplier_idx" ON "expenses" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "expenses_status_idx" ON "expenses" USING btree ("payment_status");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_years_label_uq" ON "financial_years" USING btree (lower("label"));--> statement-breakpoint
CREATE UNIQUE INDEX "financial_years_start_uq" ON "financial_years" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "financial_years_range_idx" ON "financial_years" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "import_jobs_type_time_idx" ON "import_jobs" USING btree ("type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "import_mappings_type_name_uq" ON "import_mappings" USING btree ("type",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_uq" ON "invoices" USING btree (lower("invoice_number"));--> statement-breakpoint
CREATE INDEX "invoices_fy_date_idx" ON "invoices" USING btree ("financial_year_id","invoice_date");--> statement-breakpoint
CREATE INDEX "invoices_project_idx" ON "invoices" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_time_idx" ON "login_attempts" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_email_time_idx" ON "login_attempts" USING btree ("email","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "materials_expense_uq" ON "materials" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "materials_fy_project_idx" ON "materials" USING btree ("financial_year_id","project_id");--> statement-breakpoint
CREATE INDEX "materials_project_idx" ON "materials" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "materials_category_idx" ON "materials" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "materials_supplier_idx" ON "materials" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_employee_period_uq" ON "payroll_records" USING btree ("employee_id","period_month");--> statement-breakpoint
CREATE INDEX "payroll_fy_period_idx" ON "payroll_records" USING btree ("financial_year_id","period_month");--> statement-breakpoint
CREATE INDEX "payroll_period_idx" ON "payroll_records" USING btree ("period_month");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_code_uq" ON "projects" USING btree (lower("code"));--> statement-breakpoint
CREATE INDEX "projects_fy_status_idx" ON "projects" USING btree ("financial_year_id","status");--> statement-breakpoint
CREATE INDEX "receipts_fy_date_idx" ON "receipts" USING btree ("financial_year_id","receipt_date");--> statement-breakpoint
CREATE INDEX "receipts_project_idx" ON "receipts" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "receipts_invoice_idx" ON "receipts" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_code_uq" ON "suppliers" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_name_lower_uq" ON "suppliers" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "timesheets_emp_date_idx" ON "timesheets" USING btree ("employee_id","work_date");--> statement-breakpoint
CREATE INDEX "timesheets_project_date_idx" ON "timesheets" USING btree ("project_id","work_date");--> statement-breakpoint
CREATE INDEX "timesheets_date_idx" ON "timesheets" USING btree ("work_date");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));