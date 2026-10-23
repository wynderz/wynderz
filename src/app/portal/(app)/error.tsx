"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Friendly fallback for unexpected errors (e.g. a malformed filter in the URL). */
export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const pathname = usePathname();
  return (
    <div className="pt-card" style={{ maxWidth: "36rem" }}>
      <h1 className="pt-title" style={{ fontSize: "1.3rem" }}>
        Something went wrong
      </h1>
      <p className="pt-subtitle">This page could not be loaded. If you followed a link with filters, try clearing them.</p>
      {error.digest ? <p className="pt-help">Reference: {error.digest}</p> : null}
      <div className="pt-actions" style={{ marginTop: "1rem" }}>
        <button type="button" className="pt-btn pt-btn-primary" onClick={reset}>
          Try again
        </button>
        <Link className="pt-btn pt-btn-secondary" href={pathname || "/portal/dashboard"}>
          Clear filters
        </Link>
        <Link className="pt-btn pt-btn-ghost" href="/portal/dashboard">
          Dashboard
        </Link>
      </div>
    </div>
  );
}
