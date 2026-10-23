import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/portal/auth/session";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getPortalSession()) redirect("/portal/dashboard");
  const { next } = await searchParams;
  // Only same-site portal paths are allowed as a post-login destination.
  const safeNext = next && /^\/portal(\/[\w\-/]*)?$/.test(next) ? next : "/portal/dashboard";
  return (
    <div className="pt-login">
      <section className="pt-login-art" style={{ ["--pt-login-image" as string]: "url(/images/hero/hero-2.jpg)" }}>
        <h1>Finance &amp; Operations Portal</h1>
        <p>Projects, expenses, materials, payroll, attendance and reports for every financial year — in one secure place.</p>
      </section>
      <section className="pt-login-panel">
        <div className="pt-login-box">
          <LoginForm next={safeNext} />
        </div>
      </section>
    </div>
  );
}
