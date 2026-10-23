import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin/session-token";

const PORTAL_COOKIE = "wz_portal_session";

/**
 * Optional secret entry path (e.g. "/ops-7k2x9q"), set as an env var because the repository is public.
 * When set, it is the only way to reach the login page: /portal pages answer 404 to anyone without a
 * session cookie, so the portal's existence isn't visible. Unset (local dev) keeps /portal/login.
 */
export function portalSecretPath(raw = process.env.PORTAL_SECRET_PATH) {
  const p = raw?.trim().replace(/\/+$/, "");
  return p && /^\/[A-Za-z0-9_-]{8,}$/.test(p) ? p : null;
}

function notFound(request: NextRequest) {
  // Rewrite to a route that doesn't exist so the site's normal 404 page renders.
  const res = NextResponse.rewrite(new URL("/__not-found", request.url), { status: 404 });
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

function noindex(res: NextResponse) {
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

/**
 * Portal fast path: no session cookie -> login (or 404 with a secret path) / 401 without rendering anything.
 * This is only a convenience; every portal page and API validates the session against Postgres.
 */
function portalGate(request: NextRequest, secret: string | null) {
  const { pathname } = request.nextUrl;
  const hasCookie = !!request.cookies.get(PORTAL_COOKIE)?.value;
  if (pathname.startsWith("/api/portal/")) {
    if (pathname === "/api/portal/auth/login" || hasCookie) return NextResponse.next();
    return NextResponse.json({ error: "Your session has expired. Please sign in again.", code: "unauthorized" }, { status: 401 });
  }
  if (secret) {
    if (!hasCookie) return notFound(request);
    return noindex(NextResponse.next());
  }
  if (pathname === "/portal/login" || hasCookie) return noindex(NextResponse.next());
  const login = new URL("/portal/login", request.url);
  if (pathname !== "/portal" && pathname !== "/portal/dashboard") login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const secret = portalSecretPath();
  if (secret && (pathname === secret || pathname === `${secret}/`)) {
    const login = new URL("/portal/login", request.url);
    login.search = request.nextUrl.search;
    return noindex(NextResponse.rewrite(login));
  }
  if (pathname === "/portal" || pathname.startsWith("/portal/") || pathname.startsWith("/api/portal/")) {
    return portalGate(request, secret);
  }
  if (!(pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/"))) {
    return NextResponse.next();
  }
  const token = request.cookies.get(SESSION_COOKIE)?.value || "";
  const session = token ? await verifySessionToken(token) : null;
  const isLoginPage = pathname === "/admin/login";
  const isLoginApi = pathname === "/api/admin/login";
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminApi = pathname.startsWith("/api/admin/");

  if (isLoginApi) return NextResponse.next();

  if (isLoginPage) {
    if (session) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  if ((isAdminPage || isAdminApi) && !session) {
    if (isAdminApi) {
      return NextResponse.json({ error: "Your session expired. Please sign in again." }, { status: 401 });
    }
    const login = new URL("/admin/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  // Every route except static assets: the portal's secret entry path is only known at runtime.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.[A-Za-z0-9]+$).*)"],
};
