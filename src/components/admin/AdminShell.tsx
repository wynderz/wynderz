"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { company, headerContent } from "@/data/site";
import { CONTENT_SECTIONS, SECTION_LABELS } from "@/lib/admin/config";

type DirtyContextValue = {
  dirty: boolean;
  setDirty: (value: boolean) => void;
};

const DirtyContext = createContext<DirtyContextValue>({ dirty: false, setDirty: () => {} });

export function useAdminDirty() {
  return useContext(DirtyContext);
}

const NAV = [
  { href: "/admin", label: "Dashboard" },
  ...CONTENT_SECTIONS.map((section) => ({
    href: `/admin/${section}`,
    label: SECTION_LABELS[section],
  })),
  { href: "/admin/publish", label: "Publish" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const value = useMemo(() => ({ dirty, setDirty }), [dirty]);

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  async function logout() {
    if (dirty && !window.confirm("You have unsaved changes. Sign out anyway?")) return;
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  function onNav(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (href === pathname) return;
    if (dirty && !window.confirm("You have unsaved changes. Leave this page?")) {
      event.preventDefault();
    } else {
      setDirty(false);
    }
  }

  return (
    <DirtyContext.Provider value={value}>
      <div className="admin-app">
        <div className="admin-shell">
          <aside className="admin-sidebar">
            <div className="admin-brand">
              <Image src={company.logo} alt="" width={80} height={80} />
              <div className="admin-brand-text">
                <strong>{company.shortName}</strong>
                <span>Admin · {headerContent.legalSuffix}</span>
              </div>
            </div>
            <nav className="admin-nav" aria-label="Admin">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={pathname === item.href ? "active" : undefined}
                  onClick={(event) => onNav(event, item.href)}
                >
                  {item.label}
                </Link>
              ))}
              <div className="admin-nav-spacer" />
              <button type="button" onClick={() => void logout()}>
                Logout
              </button>
            </nav>
          </aside>
          <main className="admin-main">{children}</main>
        </div>
      </div>
    </DirtyContext.Provider>
  );
}
