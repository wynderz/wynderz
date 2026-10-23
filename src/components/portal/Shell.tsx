"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { api } from "./client";
import { initials } from "./format";
import { Icon, type IconName } from "./icons";

type NavItem = { href: string; label: string; icon: IconName };

const NAV: Array<{ group: string; items: NavItem[] }> = [
  {
    group: "Overview",
    items: [
      { href: "/portal/dashboard", label: "Master Dashboard", icon: "dashboard" },
      { href: "/portal/financial-years", label: "Financial Years", icon: "calendar" },
      { href: "/portal/projects", label: "Projects", icon: "folder" },
    ],
  },
  {
    group: "Finance",
    items: [
      { href: "/portal/expenses", label: "Expenses", icon: "receipt" },
      { href: "/portal/materials", label: "Materials & Spares", icon: "box" },
      { href: "/portal/receivables", label: "Invoices & Receipts", icon: "money" },
      { href: "/portal/suppliers", label: "Suppliers & Vendors", icon: "truck" },
    ],
  },
  {
    group: "People",
    items: [
      { href: "/portal/employees", label: "Employees", icon: "users" },
      { href: "/portal/attendance", label: "Attendance", icon: "fingerprint" },
      { href: "/portal/timesheets", label: "Timesheets", icon: "clock" },
      { href: "/portal/payroll", label: "Payroll", icon: "wallet" },
    ],
  },
  {
    group: "Records",
    items: [
      { href: "/portal/documents", label: "Documents", icon: "file" },
      { href: "/portal/reports", label: "Reports", icon: "chart" },
    ],
  },
  {
    group: "Administration",
    items: [
      { href: "/portal/admins", label: "Admin Accounts", icon: "shield" },
      { href: "/portal/audit-log", label: "Audit Log", icon: "history" },
      { href: "/portal/settings", label: "Settings", icon: "cog" },
    ],
  },
];

type Year = { id: number; label: string; status: string };

export function Shell({ user, years, selectedFy, children }: { user: { name: string; email: string }; years: Year[]; selectedFy: number | null; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toastMsg, setToast] = useState<{ message: string; kind: string } | null>(null);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent).detail as { message: string; kind: string };
      setToast(detail);
      clearTimeout(timer);
      timer = setTimeout(() => setToast(null), 4000);
    };
    window.addEventListener("pt-toast", onToast);
    return () => {
      window.removeEventListener("pt-toast", onToast);
      clearTimeout(timer);
    };
  }, []);

  function chooseYear(value: string) {
    document.cookie = `wz_fy=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    // Drop an explicit ?fy= so the new selection applies.
    const url = new URL(window.location.href);
    url.searchParams.delete("fy");
    url.searchParams.delete("page");
    router.replace(url.pathname + url.search);
    router.refresh();
  }

  async function logout() {
    await api("/api/portal/auth/logout", { method: "POST", body: {} }).catch(() => {});
    router.replace("/portal/login");
    router.refresh();
  }

  return (
    <div className={`pt-shell${open ? " nav-open" : ""}`}>
      <aside className="pt-sidebar" aria-label="Portal navigation">
        <Link href="/portal/dashboard" className="pt-brand">
          <Image src="/images/brand/logo-180.png" alt="" width={36} height={36} />
          <span>
            <strong>WYNDERZ</strong>
            <span>Finance &amp; Operations</span>
          </span>
        </Link>
        <nav className="pt-nav">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="pt-nav-group">{g.group}</div>
              {g.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link key={item.href} href={item.href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
                    <Icon name={item.icon} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="pt-sidebar-foot">
          <Link href="/" target="_blank" rel="noopener">
            View public website ↗
          </Link>
        </div>
      </aside>
      <div className="pt-backdrop" onClick={() => setOpen(false)} />
      <div className="pt-main">
        <header className="pt-topbar">
          <button type="button" className="pt-btn pt-btn-ghost pt-icon-btn pt-menu-btn" onClick={() => setOpen(true)} aria-label="Open menu">
            <Icon name="menu" />
          </button>
          <label className="pt-field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
            <span className="pt-label" style={{ whiteSpace: "nowrap" }}>
              Financial year
            </span>
            <select className="pt-select" style={{ width: "auto", minWidth: "9rem" }} value={selectedFy ?? "all"} onChange={(e) => chooseYear(e.target.value)}>
              <option value="all">All years</option>
              {[...years].reverse().map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                  {y.status !== "open" ? ` (${y.status})` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="pt-grow" />
          <button type="button" className="pt-btn pt-btn-ghost pt-icon-btn" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title="Toggle theme">
            <Icon name={theme === "dark" ? "sun" : "moon"} />
          </button>
          <Link href="/portal/settings#account" className="pt-user" title={user.email} style={{ textDecoration: "none" }}>
            <span className="pt-avatar">{initials(user.name)}</span>
            <span className="pt-user-name">{user.name}</span>
          </Link>
          <button type="button" className="pt-btn pt-btn-ghost pt-btn-sm" onClick={logout} aria-label="Sign out">
            <Icon name="logout" /> <span className="pt-hide-sm">Sign out</span>
          </button>
        </header>
        <main className="pt-content" id="main">
          {children}
        </main>
      </div>
      {toastMsg ? (
        <div className={`pt-toast ${toastMsg.kind === "error" ? "error" : ""}`} role="status">
          {toastMsg.message}
        </div>
      ) : null}
    </div>
  );
}
