import type { Db } from "./db";
import type { Lookups } from "./fields";
import { listCategories } from "./services/categories";
import { employeeOptions } from "./services/employees";
import { yearOptions } from "./services/financial-years";
import { projectOptions } from "./services/projects";
import { invoiceOptions } from "./services/receivables";
import { supplierOptions } from "./services/suppliers";

type Key = keyof Lookups;

/** Loads only the option lists a page needs, in parallel. */
export async function loadLookups(db: Db, keys: Key[], opts: { fy?: number; activeEmployees?: boolean } = {}): Promise<Lookups> {
  const want = new Set(keys);
  const [years, projects, suppliers, expenseCategories, materialCategories, employees, invoices] = await Promise.all([
    want.has("years") ? yearOptions(db) : undefined,
    want.has("projects") ? projectOptions(db) : undefined,
    want.has("suppliers") ? supplierOptions(db) : undefined,
    want.has("expenseCategories") ? listCategories(db, "expense") : undefined,
    want.has("materialCategories") ? listCategories(db, "material") : undefined,
    want.has("employees") ? employeeOptions(db, opts.activeEmployees) : undefined,
    want.has("invoices") ? invoiceOptions(db) : undefined,
  ]);
  return { years, projects, suppliers, expenseCategories, materialCategories, employees, invoices };
}
