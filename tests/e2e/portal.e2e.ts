import { describe, expect, inject, it } from "vitest";

const e2e = inject("e2e");

/** Logged-in flows against a real `next dev` server: auth, documents, attendance import. */
describe.skipIf(!e2e)("portal end-to-end", () => {
  const { baseUrl, email, password } = e2e!;
  let cookie = "";

  const call = (path: string, init: RequestInit & { json?: unknown; auth?: boolean; origin?: string | null } = {}) => {
    const { json, auth = true, origin = baseUrl, ...rest } = init;
    const headers = new Headers(rest.headers);
    if (origin) headers.set("Origin", origin);
    if (auth && cookie) headers.set("Cookie", cookie);
    if (json !== undefined) headers.set("Content-Type", "application/json");
    return fetch(baseUrl + path, { redirect: "manual", ...rest, headers, body: json !== undefined ? JSON.stringify(json) : rest.body });
  };

  it("protects portal pages and APIs when signed out", async () => {
    const page = await call("/portal/dashboard", { auth: false });
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toMatch(/\/portal\/login$/);
    expect((await call("/api/portal/documents", { auth: false })).status).toBe(401);
    // A forged cookie gets past the edge gate but not the database check.
    expect((await call("/api/portal/documents", { headers: { Cookie: "wz_portal_session=forged" }, auth: false })).status).toBe(401);
  });

  it("rejects wrong passwords and cross-site logins", async () => {
    expect((await call("/api/portal/auth/login", { method: "POST", json: { email, password: "wrong-password-1A!" }, auth: false })).status).toBe(401);
    const csrf = await call("/api/portal/auth/login", { method: "POST", json: { email, password }, auth: false, origin: "https://evil.example" });
    expect(csrf.status).toBe(403);
  });

  it("signs in with an httpOnly session cookie", async () => {
    const res = await call("/api/portal/auth/login", { method: "POST", json: { email, password }, auth: false });
    expect(res.status).toBe(200);
    const set = res.headers.getSetCookie().find((c) => c.startsWith("wz_portal_session="));
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=lax/i);
    cookie = set!.split(";")[0];
    const page = await call("/portal/dashboard");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("E2E Admin");
  });

  it("blocks state-changing requests without a same-origin header", async () => {
    const res = await call("/api/portal/employees", { method: "POST", json: { name: "CSRF", monthlySalary: "1" }, origin: null });
    expect(res.status).toBe(403);
  });

  it("uploads a document and downloads the identical bytes", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.4\n% e2e test\n%%EOF\n");
    const form = new FormData();
    form.set("file", new File([pdf], "e2e report.pdf", { type: "application/pdf" }));
    form.set("title", "E2E report");
    const up = await call("/api/portal/documents", { method: "POST", body: form });
    expect(up.status).toBe(200);
    const doc = (await up.json()) as { id: number; mimeType: string };
    expect(doc.mimeType).toBe("application/pdf");

    const list = (await (await call("/api/portal/documents?q=E2E")).json()) as { rows: { id: number }[] };
    expect(list.rows.map((r) => r.id)).toContain(doc.id);

    const dl = await call(`/api/portal/documents/${doc.id}/file`);
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-disposition")).toMatch(/^attachment; filename="e2e report\.pdf"/);
    expect(dl.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await dl.arrayBuffer()).equals(Buffer.from(pdf))).toBe(true);

    // Disguised content is rejected by magic-byte detection.
    const bad = new FormData();
    bad.set("file", new File(["<svg onload=alert(1)>"], "x.pdf"));
    expect((await call("/api/portal/documents", { method: "POST", body: bad })).status).toBe(400);
  });

  it("imports a fingerprint-device export: upload, preview, commit, re-upload is a no-op", async () => {
    for (const [name, deviceUserId] of [["Asha E2E", "901"], ["Ravi E2E", "902"]]) {
      const r = await call("/api/portal/employees", { method: "POST", json: { name, deviceUserId, monthlySalary: "15000" } });
      expect(r.status).toBe(200);
    }
    const csv = ["AC-No,Name,Time", "901,Asha,02/02/2026 09:05", "901,Asha,02/02/2026 18:10", "902,Ravi,02/02/2026 09:40", "999,Nobody,02/02/2026 09:00"].join("\n");
    const mapping = { sheet: "CSV", headerRow: 1, layout: "punches", employeeMatch: "device_user_id", dateOrder: "DMY", columns: { employee: 0, dateTime: 2 } };
    const upload = async () => {
      const form = new FormData();
      form.set("file", new File([csv], "device.csv", { type: "text/csv" }));
      const res = await call("/api/portal/attendance/import", { method: "POST", body: form });
      expect(res.status).toBe(200);
      return (await res.json()) as { jobId: number; sheets: { headers: string[] }[] };
    };

    const job = await upload();
    expect(job.sheets[0].headers).toEqual(["AC-No", "Name", "Time"]);
    const preview = await (await call(`/api/portal/attendance/import/${job.jobId}/preview`, { method: "POST", json: mapping })).json();
    expect(preview).toMatchObject({ validPunches: 3, unmatched: [{ key: "999", rows: 1 }] });

    const commit = await call(`/api/portal/attendance/import/${job.jobId}/commit`, { method: "POST", json: { mapping } });
    expect(commit.status).toBe(200);
    expect(await commit.json()).toMatchObject({ inserted: 2, unmatchedRows: 1 });
    expect((await call(`/api/portal/attendance/import/${job.jobId}/commit`, { method: "POST", json: { mapping } })).status).toBe(409);

    const again = await upload();
    const r2 = await (await call(`/api/portal/attendance/import/${again.jobId}/commit`, { method: "POST", json: { mapping } })).json();
    expect(r2).toMatchObject({ newPunches: 0, inserted: 0 });

    const history = (await (await call("/api/portal/attendance/import")).json()) as unknown[];
    expect(Array.isArray(history) ? history.length : (history as { rows: unknown[] }).rows.length).toBeGreaterThanOrEqual(2);
  });

  it("signs out and invalidates the session server-side", async () => {
    const res = await call("/api/portal/auth/logout", { method: "POST" });
    expect(res.status).toBe(200);
    // Replaying the old cookie must fail: the session row is gone.
    expect((await call("/api/portal/documents")).status).toBe(401);
  });
});
