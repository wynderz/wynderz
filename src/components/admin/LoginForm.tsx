"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { company, headerContent } from "@/data/site";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error || "Invalid login.");
        setLoading(false);
        return;
      }
      const next = searchParams.get("next");
      router.replace(next?.startsWith("/admin") ? next : "/admin");
      router.refresh();
    } catch {
      setError("Network failure. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="admin-login">
      <form className="admin-login-card" onSubmit={onSubmit}>
        <p className="admin-lead" style={{ margin: 0 }}>
          {company.shortName} {headerContent.legalSuffix}
        </p>
        <h1 className="admin-title" style={{ marginTop: "0.35rem" }}>
          Admin sign in
        </h1>
        <div className="admin-grid" style={{ marginTop: "1.2rem" }}>
          <div className="admin-field">
            <label htmlFor="username">Email or username</label>
            <input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>
          <div className="admin-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
        </div>
        {error ? <p className="admin-note admin-note-err">{error}</p> : null}
        <div className="admin-actions">
          <button type="submit" className="admin-btn admin-btn-primary" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>
    </div>
  );
}
