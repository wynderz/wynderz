/** Builds a URL with updated query params (null removes a key). */
export function withParams(base: string, params: Record<string, string>, changes: Record<string, string | number | null | undefined>) {
  const q = new URLSearchParams(params);
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === undefined || v === "") q.delete(k);
    else q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
