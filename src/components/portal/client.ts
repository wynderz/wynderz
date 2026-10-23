"use client";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

/** JSON fetch against /api/portal with consistent error handling. */
export async function api<T = unknown>(url: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? (init.body !== undefined || init.form ? "POST" : "GET"),
    headers: init.form ? undefined : { "Content-Type": "application/json" },
    body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.href = `/portal/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new ApiError(data.error || "Request failed.", res.status, data.code, data.fields);
  }
  return data as T;
}

/* Tiny toast bus so any component can notify without prop drilling. */
export function toast(message: string, kind: "success" | "error" = "success") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("pt-toast", { detail: { message, kind } }));
}
