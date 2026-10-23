import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin/session-token";

const PORTAL_COOKIE = "wz_portal_session";

/**
 * Portal fast path: no session cookie -> login / 401 without rendering anything.
 * This is only a convenience; every portal page and API validates the session against Postgres.
 */
function portalGate(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = !!request.cookies.get(PORTAL_COOKIE)?.value;
  if (pathname.startsWith("/api/portal/")) {
    if (pathname === "/api/portal/auth/login" || hasCookie) return NextResponse.next();
    return NextResponse.json({ error: "Your session has expired. Please sign in again.", code: "unauthorized" }, { status: 401 });
  }
  if (pathname === "/portal/login" || hasCookie) return NextResponse.next();
  const login = new URL("/portal/login", request.url);
  if (pathname !== "/portal" && pathname !== "/portal/dashboard") login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/portal" || pathname.startsWith("/portal/") || pathname.startsWith("/api/portal/")) {
    return portalGate(request);
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
  matcher: ["/admin/:path*", "/admin", "/api/admin/:path*", "/portal", "/portal/:path*", "/api/portal/:path*"],
};
