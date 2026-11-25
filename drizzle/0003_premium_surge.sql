ALTER TABLE "employees" ADD COLUMN "bank_account_number" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "bank_ifsc" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "payment_mode" text DEFAULT 'bank';--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_payment_mode_chk" CHECK ("employees"."payment_mode" is null or "employees"."payment_mode" in ('bank', 'cash'));