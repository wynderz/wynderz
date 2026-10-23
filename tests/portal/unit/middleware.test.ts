import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { middleware, portalSecretPath } from "@/middleware";

const SECRET = "/ops-test-7k2x9q";

function req(path: string, cookie = false) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", "wz_portal_session=abc");
  return new NextRequest(new URL(path, "https://www.wynderz.in"), { headers });
}

const rewriteTarget = (res: Response) => res.headers.get("x-middleware-rewrite");

describe("portalSecretPath", () => {
  it("accepts only a single unguessable-looking segment", () => {
    expect(portalSecretPath(SECRET)).toBe(SECRET);
    expect(portalSecretPath(`${SECRET}/`)).toBe(SECRET);
    for (const bad of [undefined, "", "/short", "no-slash-12345", "/a/b-12345678", "/has space-123"]) expect(portalSecretPath(bad)).toBeNull();
  });
});

describe("portal middleware", () => {
  afterEach(() => {
    delete process.env.PORTAL_SECRET_PATH;
  });

  it("without a secret path: /portal redirects to the login page (local development)", async () => {
    const res = await middleware(req("/portal/expenses"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://www.wynderz.in/portal/login?next=%2Fportal%2Fexpenses");
    expect((await middleware(req("/portal/login"))).headers.get("x-middleware-next")).toBe("1");
  });

  it("with a secret path: the secret link is the only way to the login page", async () => {
    process.env.PORTAL_SECRET_PATH = SECRET;
    const entry = await middleware(req(`${SECRET}?next=/portal/payroll`));
    expect(rewriteTarget(entry)).toBe("https://www.wynderz.in/portal/login?next=/portal/payroll");
    expect(entry.headers.get("x-robots-tag")).toMatch(/noindex/);

    for (const path of ["/portal", "/portal/login", "/portal/dashboard", "/portal/payroll"]) {
      const res = await middleware(req(path));
      expect(res.status, path).toBe(404);
      expect(res.headers.get("location"), path).toBeNull();
    }
  });

  it("with a secret path: signed-in users keep using /portal pages; APIs still answer 401", async () => {
    process.env.PORTAL_SECRET_PATH = SECRET;
    expect((await middleware(req("/portal/dashboard", true))).headers.get("x-middleware-next")).toBe("1");
    expect((await middleware(req("/api/portal/documents"))).status).toBe(401);
    expect((await middleware(req("/api/portal/auth/login"))).headers.get("x-middleware-next")).toBe("1");
  });

  it("leaves public pages alone", async () => {
    process.env.PORTAL_SECRET_PATH = SECRET;
    for (const path of ["/", "/about", "/contact"]) expect((await middleware(req(path))).headers.get("x-middleware-next"), path).toBe("1");
  });
});
