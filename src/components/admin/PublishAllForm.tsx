"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CONTENT_SECTIONS, SECTION_LABELS, type ContentSection } from "@/lib/admin/config";
import { clearAllDrafts, listSavedDrafts } from "@/lib/admin/draft-store";

type DraftRow = {
  section: ContentSection;
  imageCount: number;
};

const CONFIRM_MESSAGE =
  "Publish these saved changes to main (production on www.wynderz.in)?\n\nVercel will deploy from that GitHub commit. This cannot be undone except by publishing again or restoring Git history.";

export function PublishAllForm() {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
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

  async function publishAll() {
    if (!window.confirm(CONFIRM_MESSAGE)) return;
    setPublishing(true);
    setError("");
    setSuccess("");
    try {
      const saved = await listSavedDrafts();
      if (saved.length === 0) {
        setError("Nothing to publish. Open a section, make changes, and click Save first.");
        setPublishing(false);
        return;
      }
      const form = new FormData();
      form.set(
        "payload",
        JSON.stringify({
          target: "main",
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
        setPublishing(false);
        return;
      }
      await clearAllDrafts();
      setDrafts([]);
      setSuccess(data.message || "Changes published. The live website will update automatically. Refresh wynderz.in to see them.");
    } catch {
      setError("Network failure. Check your connection and try again.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="admin-panel">
      <h1 className="admin-title">Publish</h1>
      <p className="admin-lead">
        Save changes in each section first. Publish sends every saved section to GitHub{" "}
        <strong>main</strong> in one commit. Vercel then deploys the live website at wynderz.in.
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
            className="admin-btn admin-btn-primary"
            onClick={() => void publishAll()}
            disabled={publishing || drafts.length === 0}
          >
            {publishing ? "Publishing to main…" : "Publish to main"}
          </button>
        </div>
        <p className="admin-lead" style={{ marginTop: "0.9rem" }}>
          You will be asked to confirm before production is updated.
        </p>
      </div>
    </div>
  );
}
