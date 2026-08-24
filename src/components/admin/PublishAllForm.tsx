"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CONTENT_SECTIONS, SECTION_LABELS, type ContentSection } from "@/lib/admin/config";
import { clearAllDrafts, listSavedDrafts } from "@/lib/admin/draft-store";
import type { PublishTarget } from "@/lib/admin/github";

type DraftRow = {
  section: ContentSection;
  imageCount: number;
};

export function PublishAllForm() {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState<PublishTarget | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function refresh() {
    setLoading(true);
    const saved = await listSavedDrafts();
    setDrafts(saved.map((item) => ({ section: item.section, imageCount: Object.keys(item.pending).length })));
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function publishAll(target: PublishTarget) {
    if (target === "main" && !window.confirm("Publish these changes to main (production)?")) {
      return;
    }
    setPublishing(target);
    setError("");
    setSuccess("");
    try {
      const saved = await listSavedDrafts();
      if (saved.length === 0) {
        setError("Nothing to publish. Open a section, make changes, and click Save first.");
        setPublishing(null);
        return;
      }
      const form = new FormData();
      form.set(
        "payload",
        JSON.stringify({
          target,
          sections: saved.map((item) => ({ section: item.section, content: item.content })),
        }),
      );
      for (const item of saved) {
        for (const [fieldPath, file] of Object.entries(item.pending)) {
          form.append(`imageFields_${item.section}`, fieldPath);
          form.append(`images_${item.section}`, file);
        }
      }
      const response = await fetch("/api/admin/publish", { method: "POST", body: form });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        setError(data.error || "Could not publish changes.");
        setPublishing(null);
        return;
      }
      await clearAllDrafts();
      setDrafts([]);
      setSuccess(data.message || "Published.");
    } catch {
      setError("Network failure. Check your connection and try again.");
    } finally {
      setPublishing(null);
    }
  }

  const busy = publishing !== null;

  return (
    <div className="admin-panel">
      <h1 className="admin-title">Publish</h1>
      <p className="admin-lead">
        Save changes in each section first. Then publish to <strong>dev</strong> (preview) or{" "}
        <strong>main</strong> (production). Each option creates one GitHub commit on that branch.
        Vercel deploys from the branch it is connected to.
      </p>
      <div className="admin-card">
        {loading ? <p className="admin-lead">Checking saved sections…</p> : null}
        {!loading && drafts.length === 0 ? (
          <p className="admin-lead" style={{ margin: 0 }}>
            No saved changes waiting to publish. Edit a section and click <strong>Save</strong>, then
            return here.
          </p>
        ) : null}
        {!loading && drafts.length > 0 ? (
          <ul className="admin-publish-list">
            {drafts.map((draft) => (
              <li key={draft.section}>
                <Link href={`/admin/${draft.section}`}>{SECTION_LABELS[draft.section]}</Link>
                <span>
                  Saved
                  {draft.imageCount > 0 ? ` · ${draft.imageCount} image${draft.imageCount === 1 ? "" : "s"}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {error ? <p className="admin-note admin-note-err">{error}</p> : null}
        {success ? <p className="admin-note admin-note-ok">{success}</p> : null}
        <div className="admin-actions">
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => void publishAll("dev")}
            disabled={busy || drafts.length === 0}
          >
            {publishing === "dev" ? "Publishing to dev…" : "Publish to dev"}
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={() => void publishAll("main")}
            disabled={busy || drafts.length === 0}
          >
            {publishing === "main" ? "Publishing to main…" : "Publish to main"}
          </button>
        </div>
        <p className="admin-lead" style={{ marginTop: "0.9rem" }}>
          Dev uses <code>GITHUB_BRANCH_DEV</code> (default <code>dev</code>). Main uses{" "}
          <code>GITHUB_BRANCH_MAIN</code> (default <code>main</code>).
        </p>
      </div>
    </div>
  );
}
