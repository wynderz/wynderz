CREATE INDEX "attendance_punches_import_job_idx" ON "attendance_punches" USING btree ("import_job_id");--> statement-breakpoint
CREATE INDEX "attendance_records_import_job_idx" ON "attendance_records" USING btree ("import_job_id");--> statement-breakpoint
CREATE INDEX "documents_invoice_idx" ON "documents" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "documents_uploaded_by_idx" ON "documents" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "expenses_created_by_idx" ON "expenses" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "import_jobs_created_by_idx" ON "import_jobs" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "materials_status_idx" ON "materials" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payroll_payment_status_idx" ON "payroll_records" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "timesheets_status_idx" ON "timesheets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "timesheets_import_job_idx" ON "timesheets" USING btree ("import_job_id");