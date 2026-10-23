/** Errors that are safe to show to the signed-in admin. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "bad_request",
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Record") => new AppError(`${what} not found.`, 404, "not_found");
export const conflict = (message: string) => new AppError(message, 409, "conflict");
export const unauthorized = () => new AppError("Your session has expired. Please sign in again.", 401, "unauthorized");
export const forbidden = (message = "Not allowed.") => new AppError(message, 403, "forbidden");
export const locked = (message: string) => new AppError(message, 423, "year_locked");

/** Maps Postgres constraint violations to friendly messages. */
export function fromPgError(err: unknown): AppError | null {
  const e = err as { code?: string; constraint?: string; detail?: string; cause?: unknown };
  const pg = e?.code ? e : (e?.cause as typeof e | undefined);
  if (!pg?.code) return null;
  const c = pg.constraint || "";
  if (pg.code === "23505") {
    const friendly: Record<string, string> = {
      users_email_lower_uq: "An admin with this email already exists.",
      financial_years_label_uq: "A financial year with this label already exists.",
      financial_years_start_uq: "A financial year already starts on this date.",
      projects_code_uq: "A project with this code already exists.",
      suppliers_code_uq: "A supplier with this ID already exists.",
      suppliers_name_lower_uq: "A supplier with this name already exists.",
      employees_code_uq: "An employee with this ID already exists.",
      employees_device_uq: "Another employee already uses this biometric device ID.",
      categories_type_name_uq: "A category with this name already exists.",
      invoices_number_uq: "An invoice with this number already exists.",
      payroll_employee_period_uq: "A payroll record already exists for this employee and month.",
      attendance_emp_date_uq: "Attendance for this employee and date already exists.",
      import_mappings_type_name_uq: "A mapping with this name already exists.",
    };
    return conflict(friendly[c] || "This record duplicates an existing one.");
  }
  if (pg.code === "23503") return conflict("This record is linked to other records and cannot be removed. Archive it instead.");
  if (pg.code === "23514") return new AppError("One or more values are out of the allowed range.", 400, "check_violation");
  if (pg.code === "22P02" || pg.code === "22007" || pg.code === "22008") return new AppError("One or more values have an invalid format.");
  return null;
}
