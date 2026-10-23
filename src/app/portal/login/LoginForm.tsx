"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/components/portal/client";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/api/portal/auth/login", { body: { email: form.get("email"), password: form.get("password") } });
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="pt-grid" style={{ gap: "1rem" }} noValidate>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
        <Image src="/images/brand/logo-180.png" alt="WYNDERZ" width={44} height={44} />
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, letterSpacing: "0.08em" }}>WYNDERZ</div>
          <div className="pt-help">Admin sign in</div>
        </div>
      </div>
      <h2 className="pt-title" style={{ fontSize: "1.4rem" }}>
        Welcome back
      </h2>
      {error ? (
        <div className="pt-alert error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="pt-field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="pt-input" autoComplete="username" required autoFocus />
      </div>
      <div className="pt-field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" className="pt-input" autoComplete="current-password" required />
      </div>
      <button type="submit" className="pt-btn pt-btn-primary" disabled={busy} style={{ minHeight: "2.6rem" }}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="pt-help">Accounts are created by an existing administrator. Forgotten your password? Ask another admin to reset it.</p>
    </form>
  );
}
