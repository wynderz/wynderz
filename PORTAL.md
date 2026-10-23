# Wynderz Finance & Operations Portal

A private admin portal at **`/portal`** for financial years, projects, expenses, materials & spares, invoices & receipts, suppliers, employees, fingerprint-attendance imports, timesheets, payroll, documents, reports, admin accounts, audit log and settings.

It lives inside the existing Next.js app but is fully isolated: its own routes (`/portal/*`, `/api/portal/*`), its own stylesheet (`src/app/portal/portal.css`, scoped to `.pt-app`), its own auth (Postgres-backed sessions, separate from the `/admin` content editor) and its own database. The public website and `/admin` are unchanged (the only shared-file edits are the middleware matcher and hiding the social rail on `/portal`).

---

## Local setup

Requirements: Node 20+, PostgreSQL 14+.

```bash
npm install
cp .env.example .env            # then set DATABASE_URL (and TEST_DATABASE_URL for tests)
createdb wynderz_portal
npm run portal:setup            # applies migrations + seeds editable default categories/settings
npm run portal:create-admin -- --email you@company.com --name "Your Name"   # prompts for a password
npm run dev                     # http://localhost:3000/portal/login
```

* `portal:setup` is idempotent. It never imports Excel data and never creates an admin.
* Passwords are never accepted as command-line arguments. For automation: `echo "$PASS" | npm run portal:create-admin -- --email … --name … --password-stdin`.
* Forgotten password (no other admin available): `npm run portal:create-admin -- --email you@company.com --reset`.

### Scripts

| Script | Purpose |
|---|---|
| `npm run portal:setup` | Migrate + seed default categories and settings |
| `npm run portal:migrate` | Apply migrations only |
| `npm run portal:create-admin` | Create an admin / `--reset` a password |
| `npm run portal:db:generate` | Generate a new SQL migration after editing `src/lib/portal/db/schema.ts` |
| `npm test` | Unit tests + database integration tests (needs `TEST_DATABASE_URL`, a **separate** database — it is wiped) |
| `npm run test:e2e` | End-to-end: starts its own `next dev` (build dir `.next-e2e`) against a local `<TEST_DATABASE_URL>_e2e` database (created if missing, wiped each run; override with `E2E_DATABASE_URL`) and tests sign-in, sign-out, CSRF, document upload/download and attendance import over HTTP |
| `npm run typecheck` | TypeScript |

### Environment variables (server-side only)

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string. Production: hosted Postgres with `?sslmode=require`. |
| `TEST_DATABASE_URL` | Throw-away database for `npm test`. Must differ from `DATABASE_URL`. |
| `PORTAL_STORAGE_DRIVER` | `local` (default) or `s3`. Use `s3` on Vercel — see Deployment step 2. |
| `PORTAL_STORAGE_DIR` | `local` driver: private document directory (default `./.portal-storage`, git-ignored, never served). |
| `PORTAL_S3_*` | `s3` driver settings — see Deployment step 2. |
| `PORTAL_MAX_UPLOAD_MB` | Upload limit fallback (default 15; also editable in Settings). |
| `PORTAL_DB_POOL_MAX` | Pool size per server instance (default 10). |

---

## Architecture (modular monolith)

```
src/lib/portal/
  db/schema.ts        single Drizzle schema → drizzle/*.sql migrations
  db/index.ts         pooled pg connection (singleton)
  auth/               Argon2id passwords, DB sessions, DB-backed login rate limit
  api.ts              route() wrapper: session check, same-origin (CSRF) check, error mapping
  services/*.ts       all business rules + writes (transactions + audit log)
  queries/finance.ts  ONE set of financial definitions used by dashboards, reports and exports
  reports.ts          report registry → on-screen table, Excel, CSV, print
  money.ts            exact paise (BigInt) arithmetic — no floats
  attendance-engine.ts  pure punch → daily-record logic (unit tested)
  spreadsheet.ts      xlsx/csv reading & writing
  storage.ts          private file storage (local disk, or S3/R2 bucket via PORTAL_STORAGE_DRIVER)
src/app/api/portal/   thin REST handlers calling services
src/app/portal/       server-rendered pages; client components only for forms/charts
src/components/portal shared UI kit (shell, tables, forms, charts, import wizard)
```

Pages read through services directly on the server (no HTTP hop); mutations go through `/api/portal/*` with Zod validation.

### Security

* One login type: **Admin**. Every active admin has identical full access. No employee logins, no public registration.
* Argon2id password hashing; sessions are random 256-bit tokens stored as SHA-256 hashes in `sessions`; cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production; 12 h sliding / 7 day absolute expiry.
* Every page and API validates the session against Postgres (middleware only does a fast cookie-presence redirect).
* State-changing requests must be same-origin (`Origin` check) in addition to SameSite cookies.
* Login rate limit per IP and per email, stored in Postgres (works across serverless instances); generic error messages; timing-equalised for unknown emails.
* The last active admin cannot be deactivated or deleted; deactivation and password resets revoke that admin's sessions.
* Documents: type detected from file bytes (SVG/HTML rejected), size-limited, stored outside `/public` with random names, downloaded only through an authenticated route with `nosniff` and a sandbox CSP.
* CSV exports neutralise spreadsheet formula injection.
* Every create/update/archive/import/export/login is written to `audit_logs` with field-level diffs.

---

## Data model

Financial years and projects are **rows**, never new tables.

| Table | Purpose |
|---|---|
| `users`, `sessions`, `login_attempts` | Admin accounts and authentication |
| `financial_years` | Label, start/end (default 1 Apr – 31 Mar), status `open/closed/archived`, optional budget |
| `projects` | One identity per project; `financial_year_id` = year opened. Transactions carry their own year, so a project can span years without duplication |
| `categories` | Editable expense & material categories (`kind` = reporting bucket). One system category, *Materials & Spares* |
| `suppliers` | Reusable vendor directory |
| `expenses` | All spending (project or office), base/GST/total, amount paid, payment & bill status |
| `materials` | Item-level materials/spares; `status` planned/ordered/received; `expense_id` → its single linked expense |
| `invoices`, `receipts` | Amounts billed vs cash actually received |
| `employees` | Records only (no logins); pay type monthly/daily, biometric device user ID |
| `payroll_records` | One row per employee per month (unique), normalized — the annual grid is a pivot |
| `attendance_punches` | Raw device punches, unique on (employee, timestamp) → idempotent re-import |
| `attendance_records` | One row per employee per day (unique); `source` manual/import |
| `timesheets` | Admin-managed work logs, optional project |
| `import_jobs`, `import_mappings` | Upload history/results and saved column mappings |
| `documents` | File metadata + optional links to year/project/expense/material/supplier/invoice |
| `audit_logs`, `settings` | Audit trail; typed policy settings (JSON) |

Money is `numeric(14,2)`; it is summed in SQL and handled as decimal strings / BigInt paise in TypeScript. Foreign keys and the common `(financial_year_id, date)`, `(project_id, date)`, `(employee_id, date)` and `(employee_id, period_month)` filters are indexed.

### Financial definitions (shared by every dashboard, report and export)

* **Recorded expenditure** = Σ expenses + Σ payroll net payable (archived rows excluded)
* **Paid expenditure** = Σ expense amounts paid + Σ payroll paid; **Unpaid liabilities** = recorded − paid
* **Project costs** = expenses with a project; **Office & admin** = expenses without one
* **Materials & spares** = expenses created from material purchases — a *subset* of the above, never added twice
* **Invoiced** (billed) and **Received** (cash) are separate; **Receivables** = invoiced − received
* A cancelled or archived invoice never has active receipts: cancelling/archiving is refused while receipts exist, and receipts can't be added to or restored onto it. For a refund, archive the receipt first. Collected cash therefore always matches an invoice that still counts as invoiced.
* **Contract value** is an agreement figure and is never shown as revenue collected
* Planned materials are estimates only and never count as spend

### Business rules worth knowing

* Every dated transaction is assigned to the financial year containing its date. If none exists, the user is asked to create it.
* **Closed** years accept changes only with a correction reason (audited). **Archived** years are read-only until reopened. Year dates cannot move past existing records; years with data cannot be deleted.
* A purchased material creates/updates exactly one linked expense in the same transaction; that expense can only be edited via the material.
* Payroll (configurable in Settings): monthly = salary × days paid ÷ working days (calendar days by default, or a fixed number); daily = rate × days; then + allowances ± adjustment − deductions − advances, floored at 0. Generating a month never overwrites existing records, and generating *from attendance* is blocked until the month has ended.
* Attendance (configurable): shift start + grace → late; full/half-day hour thresholds; punch policy *first/last* or *pairs*; double-scan window; day cut-off for night shifts; weekly off days. Manual records are never overwritten by imports. Employees are never created from device data.
* No overtime rules are applied anywhere (none were documented).

---

## Fingerprint attendance import

Attendance → **Import device file**: upload `.xlsx`/`.csv` → choose sheet & header row → choose layout (one row per punch, or one row per employee-day with in/out/status) → map columns → validate (shows errors, unmatched IDs, duplicates, already-imported punches, manual records kept, closed years) → confirm. Save the mapping by name to reuse it next month. The original file is stored privately with the import job.

Set each employee's **Biometric device user ID** to the ID used by the device. Legacy binary `.xls` exports are not read — re-save them as `.xlsx` or `.csv` (see *Known limitations*).

---

## How the nine reference workbooks were used

They were analysed for structure only; nothing is imported or hard-coded.

| Workbook | What it informed |
|---|---|
| Wynderz_FY20xx-xx_Finance | Year dashboard, project register, per-project expense ledger columns (date, category, description, supplier, bill no., base, GST %, GST, total, paid by, mode, payment status, bill status), payroll register, office & admin, vendor register, master export metrics |
| Wynderz_Master_Finance | Multi-year comparison, historical invoice register (→ `invoices`), all-years summary |
| TFT Chennai Machine Expenses, Project Accounts | Material/component budgets (→ materials with *planned* status = estimate vs purchased actuals) and material category defaults |
| Office spends, Accounts 2022-2023 | Office expense fields (shop, qty, amount, money given by, status, bill status) and vendor list patterns |
| Salary Payments | Payroll inputs: salary, advance, days to pay, absent days, joining date; revealed two pay types (prorated monthly and flat ₹420/day) |

**Ambiguities found and how they were handled**

1. *Revenue* in the master workbook is project invoice value, not cash. The portal tracks invoices and receipts separately and never labels contract value as revenue.
2. The 2026 salary sheet mixes prorated monthly pay (₹13,000 × 24/31 − ₹2,000 = ₹8,064.52) with flat daily wages (₹420/day regardless of listed salary). Employees therefore have a pay type; proration and working days are settings.
3. Some legacy sheets show "price w/o GST" and "actual w/ GST" that disagree (e.g. TFT control system ₹10,00,000 vs ₹9,56,700). Planned vs purchased materials keep estimate and actual separate.
4. Legacy dates are inconsistent (`2904`, `14h`, text dates) and amounts include text (`"2300+gst"`). This is why historical data is not auto-imported; enter or bulk-load it deliberately after review.
5. The salary workbook contains bank account numbers and IFSC codes. The portal does **not** store bank details (sensitive data with no stated requirement).
6. Whether paid leave counts as a paid day is not defined; payroll generation counts present = 1 and half-day = 0.5 only. Adjust days paid manually or ask for a policy setting.

---

## Backup & restore

```bash
# Backup (custom format, compressed)
pg_dump --format=custom --no-owner --file=wynderz_portal_$(date +%F).dump "$DATABASE_URL"
# Also back up document files
tar czf portal_storage_$(date +%F).tgz .portal-storage   # local driver; for s3, enable bucket versioning / replication

# Restore into an empty database
createdb wynderz_portal_restore
pg_restore --no-owner --dbname=wynderz_portal_restore wynderz_portal_YYYY-MM-DD.dump
tar xzf portal_storage_YYYY-MM-DD.tgz
```

Schedule both daily in production (most hosted Postgres providers also offer point-in-time recovery). Test a restore periodically.

---

## Deployment (requires your approval — nothing has been deployed)

The site is deployed on Vercel. To run the portal there:

1. **Database** — hosted Postgres. Current setup: Supabase project `wynderz-portal` (ref `jopaqshfkstpedtmhvzq`, Mumbai `ap-south-1`, free plan, in the mybseva@gmail.com organization). `DATABASE_URL` is set in Vercel (Production + Preview, Sensitive) to the **transaction pooler** (`aws-0-ap-south-1.pooler.supabase.com:6543`), with `PORTAL_DB_POOL_MAX=3`. Run migrations and admin scripts from a trusted machine against the **session pooler** (port 5432); the direct `db.<ref>.supabase.co` host is IPv6-only.
   * Supabase's certificate chain uses its own CA, so node-postgres needs `?uselibpqcompat=true&sslmode=require` (encrypted, server certificate not verified). To verify fully, add Supabase's CA certificate to the pool's `ssl` options and use `sslmode=verify-full`.
   * Supabase publishes the `public` schema through its REST API. Migration `0002_lock_down_public_api` enables RLS on every table and revokes `anon`/`authenticated` privileges, so only the portal (connecting as the table owner) can read or write. **New tables need RLS enabled too** — add it to their migration.
   * Free-plan projects pause after ~7 days of inactivity; upgrade to Pro before relying on it day to day.
   * Create the first admin: `DATABASE_URL="<session pooler URL>" npm run portal:create-admin -- --email you@company.com --name "Your Name"`.
2. **Document storage** — Vercel's filesystem is ephemeral, so the default `local` driver will lose files. Use a **private** S3-compatible bucket (AWS S3 or Cloudflare R2) and set, in Vercel (server-side, *not* `NEXT_PUBLIC_`):

   | Variable | AWS S3 | Cloudflare R2 |
   |---|---|---|
   | `PORTAL_STORAGE_DRIVER` | `s3` | `s3` |
   | `PORTAL_S3_BUCKET` | bucket name | bucket name |
   | `PORTAL_S3_REGION` | bucket region, e.g. `ap-south-1` | leave empty (`auto`) |
   | `PORTAL_S3_ENDPOINT` | leave empty | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
   | `PORTAL_S3_ACCESS_KEY_ID` / `PORTAL_S3_SECRET_ACCESS_KEY` | IAM user key | R2 API token (Object Read & Write, this bucket only) |
   | `PORTAL_S3_PREFIX` | optional, e.g. `portal` | optional |
   | `PORTAL_S3_FORCE_PATH_STYLE` | `false` | `false` (`true` only for MinIO) |

   Keep "Block all public access" on (no public R2 domain); files are only streamed through the authenticated portal routes. Grant only `s3:GetObject`, `s3:PutObject` and `s3:DeleteObject` on `arn:aws:s3:::<bucket>/*`. Uploads use conditional writes (`If-None-Match: *`), so an existing key is never overwritten. Enable bucket versioning (or a lifecycle/backup policy) for recovery. If you already have files in `.portal-storage`, copy them into the bucket under the same keys (plus the prefix) before switching, e.g. `aws s3 sync .portal-storage s3://<bucket>/<prefix>` (add `--endpoint-url` for R2). Creating the bucket and setting these variables requires your approval — nothing has been created.
   * **Current setup:** Supabase Storage in the same `wynderz-portal` project — private bucket `portal-documents` (25 MB per file), set in Vercel (Production + Preview) as `PORTAL_STORAGE_DRIVER=s3`, `PORTAL_S3_BUCKET=portal-documents`, `PORTAL_S3_REGION=ap-south-1`, `PORTAL_S3_ENDPOINT=https://jopaqshfkstpedtmhvzq.storage.supabase.co/storage/v1/s3`, `PORTAL_S3_FORCE_PATH_STYLE=true`, plus the S3 access key pair (Project Settings → Storage → S3 Access Keys). Supabase ignores `If-None-Match`, so the driver also checks for an existing object before writing. Free plan: 1 GB total.
3. **Connections** — on serverless, use the provider's pooled connection string (PgBouncer) and keep `PORTAL_DB_POOL_MAX` small (e.g. 3–5).
4. Redeploy. The portal is then at `https://www.wynderz.in/portal/login` (domain from `metadataBase` in `src/app/layout.tsx`).
5. Migrations on later releases: run `npm run portal:migrate` before (or as part of) the deploy.

---

## Known limitations / next steps

* Legacy `.xls` (binary) device exports must be re-saved as `.xlsx`/`.csv`; reading them directly needs SheetJS 0.20.x, which is distributed from SheetJS's own CDN rather than npm (its npm build is outdated) — install only if you approve that source.
* Runtime: the AWS SDK warns on Node < 22. The Vercel project already runs Node 24.x; local development on Node 20 only shows a warning.
* Remaining `npm audit` items need major upgrades and were left for review: `next` 16 (postcss) and `exceljs`→`uuid` (the suggested fix is a downgrade). `next` was patched to 15.5.28, `drizzle-orm` to 0.45 and `nodemailer` to 10.2 (requires Node ≥ 20; no code changes).
* Migration `0001` only adds indexes (non-destructive); apply with `npm run portal:migrate`.
* Document storage supports local disk and S3-compatible buckets (AWS S3, R2); Vercel Blob is not implemented.
* Historical data from the reference workbooks is intentionally not imported.
* Project budgets are a single figure per project (no per-category budget lines yet).
* Password reset is admin-to-admin or via CLI; there is no email-based reset flow (no transactional email service is configured for the portal).
