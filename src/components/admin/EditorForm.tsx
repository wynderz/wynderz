"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAdminDirty } from "@/components/admin/AdminShell";
import { PREVIEW_PATHS, SECTION_LABELS, type ContentSection } from "@/lib/admin/config";
import { clearDraft, loadDraftImages, readDraftJson, saveDraft } from "@/lib/admin/draft-store";
import { IMAGE_KEYS, PLACEHOLDER_IMAGE, collectImageFields, setAt } from "@/lib/admin/validate";

const LOCKED_KEYS = new Set(["icon", "gallery"]);
const LONG_KEYS = new Set([
  "about",
  "aboutExtended",
  "description",
  "intro",
  "quote",
  "summary",
  "bio",
  "body",
]);
const BOOLEAN_KEYS = new Set(["inCarousel", "isActive", "gallery"]);

type EditorFormProps = {
  section: ContentSection;
  description: string;
};

function humanize(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\burl\b/i, "URL")
    .replace(/\bcta\b/i, "CTA")
    .replace(/^./, (value) => value.toUpperCase())
    .trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function itemTitle(value: unknown, index: number) {
  if (isPlainObject(value)) {
    return String(value.name || value.title || value.label || value.day || value.id || `Item ${index + 1}`);
  }
  return `Item ${index + 1}`;
}

function isMutableList(path: string) {
  return (
    path === "items" ||
    path.endsWith(".items") ||
    path === "hero.slides" ||
    path === "gallery.images" ||
    path === "categories" ||
    path === "socialLinks" ||
    path === "navLinks" ||
    path === "galleryNavItems" ||
    path === "businessHours" ||
    path === "company.paragraphs" ||
    path === "profile.highlights" ||
    path === "profile.facts" ||
    /^navLinks\.\d+\.items$/.test(path)
  );
}

function newListItem(path: string, sample: unknown, section: ContentSection): unknown {
  if (typeof sample === "string") return "";
  if (isPlainObject(sample)) {
    const clone = structuredClone(sample);
    if ("id" in clone) clone.id = `item-${Date.now().toString(36)}`;
    if ("name" in clone) clone.name = "New item";
    if ("title" in clone) clone.title = "New item";
    if ("label" in clone) clone.label = "New item";
    if ("youtubeUrl" in clone) clone.youtubeUrl = "https://www.youtube.com/watch?v=";
    if ("youtubeVideoId" in clone) clone.youtubeVideoId = "";
    if ("thumbnail" in clone) clone.thumbnail = PLACEHOLDER_IMAGE;
    if ("image" in clone) clone.image = PLACEHOLDER_IMAGE;
    if ("src" in clone) clone.src = PLACEHOLDER_IMAGE;
    if ("inCarousel" in clone) clone.inCarousel = false;
    if ("isActive" in clone) clone.isActive = true;
    return clone;
  }
  if (section === "videos") {
    return {
      title: "New video",
      description: "",
      youtubeUrl: "https://www.youtube.com/watch?v=",
      youtubeVideoId: "",
      thumbnail: PLACEHOLDER_IMAGE,
      isActive: true,
      displayOrder: 1,
    };
  }
  if (path.includes("gallery")) {
    return { id: `gallery-${Date.now().toString(36)}`, src: PLACEHOLDER_IMAGE, alt: "New image", href: "/products", isActive: true };
  }
  if (section === "applications") {
    return { title: "New item", description: "" };
  }
  if (section === "products" || path === "items") {
    return {
      id: `item-${Date.now().toString(36)}`,
      name: "New product",
      category: "",
      image: PLACEHOLDER_IMAGE,
      sourceUrl: "https://www.wynderz.in/",
      summary: "",
      inCarousel: false,
      isActive: true,
    };
  }
  return { title: "New item", description: "" };
}

function pendingSignature(pending: Record<string, File>) {
  return Object.entries(pending)
    .map(([path, file]) => `${path}:${file.name}:${file.size}:${file.lastModified}`)
    .sort()
    .join("|");
}

export function EditorForm({ section, description }: EditorFormProps) {
  const { setDirty } = useAdminDirty();
  const [content, setContent] = useState<unknown>(null);
  const [published, setPublished] = useState<string>("");
  const [lastSaved, setLastSaved] = useState<string>("");
  const [lastSavedPending, setLastSavedPending] = useState("");
  const [pending, setPending] = useState<Record<string, File>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [draftNote, setDraftNote] = useState("");

  const dirty = useMemo(() => {
    if (content == null) return false;
    return JSON.stringify(content) !== lastSaved || pendingSignature(pending) !== lastSavedPending;
  }, [content, lastSaved, lastSavedPending, pending]);

  useEffect(() => {
    setDirty(dirty);
  }, [dirty, setDirty]);

  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      const response = await fetch(`/api/admin/content?section=${section}`, { cache: "no-store" });
      const data = (await response.json()) as { content?: unknown; error?: string };
      if (cancelled) return;
      if (!response.ok) {
        setError(data.error || "Could not load content.");
        setLoading(false);
        return;
      }
      const live = data.content;
      setPublished(JSON.stringify(live));
      const draft = readDraftJson(section);
      const next = draft ?? live;
      setContent(next);
      setLastSaved(JSON.stringify(next));
      if (draft) {
        setDraftNote("Saved changes are waiting on the Publish tab. They will not go live until you publish.");
        const images = await loadDraftImages(section);
        if (cancelled) return;
        setPending(images.pending);
        setPreviews(images.previews);
        setLastSavedPending(pendingSignature(images.pending));
      } else {
        setPending({});
        setPreviews({});
        setLastSavedPending("");
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [section]);

  function update(path: string, value: unknown) {
    setContent((current: unknown) => setAt(current, path, value));
    setSuccess("");
    setDraftNote("");
  }

  function mutateArray(path: string, next: unknown[]) {
    setContent((current: unknown) => setAt(current, path, next));
    setSuccess("");
    setDraftNote("");
  }

  function getArray(path: string): unknown[] {
    if (!path) return Array.isArray(content) ? content : [];
    return path.split(".").reduce<unknown>((current, key) => {
      if (current == null) return undefined;
      if (Array.isArray(current)) return current[Number(key)];
      if (typeof current === "object") return (current as Record<string, unknown>)[key];
      return undefined;
    }, content) as unknown[];
  }

  function onPickImage(path: string, file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError(`${file.name} exceeds 5 MB.`);
      return;
    }
    if (
      !/^image\/(jpeg|png|webp|gif|svg\+xml)$/.test(file.type) &&
      !/\.(jpe?g|png|webp|gif|svg)$/i.test(file.name)
    ) {
      setError("Use a JPG, PNG, WEBP, GIF, or SVG image.");
      return;
    }
    setError("");
    setPending((current) => ({ ...current, [path]: file }));
    setPreviews((current) => {
      if (current[path]) URL.revokeObjectURL(current[path]);
      return { ...current, [path]: URL.createObjectURL(file) };
    });
    setSuccess("");
  }

  async function reset() {
    if (!published) return;
    setContent(JSON.parse(published));
    setLastSaved(published);
    setLastSavedPending("");
    setPending({});
    Object.values(previews).forEach((url) => URL.revokeObjectURL(url));
    setPreviews({});
    setError("");
    setSuccess("");
    setDraftNote("");
    await clearDraft(section);
  }

  async function save() {
    if (content == null) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await saveDraft(section, content, pending);
      setLastSaved(JSON.stringify(content));
      setLastSavedPending(pendingSignature(pending));
      setDraftNote("");
      setSuccess("Saved. Open the Publish tab when you are ready to update the live website.");
    } catch {
      setError("Could not save in this browser. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function preview() {
    window.open(PREVIEW_PATHS[section], "_blank", "noopener,noreferrer");
  }

  function renderValue(value: unknown, path: string, key: string): ReactNode {
    if (LOCKED_KEYS.has(key)) return null;
    if (typeof value === "boolean" || BOOLEAN_KEYS.has(key)) {
      const checked = Boolean(value);
      return (
        <div className="admin-field" key={path}>
          <label htmlFor={path}>
            <input
              id={path}
              type="checkbox"
              checked={checked}
              onChange={(event) => update(path, event.currentTarget.checked)}
              style={{ width: "auto", marginRight: "0.5rem" }}
            />
            {humanize(key)}
          </label>
        </div>
      );
    }
    if (typeof value === "number") {
      return (
        <div className="admin-field" key={path}>
          <label htmlFor={path}>{humanize(key)}</label>
          <input
            id={path}
            type="number"
            value={value}
            onChange={(event) => update(path, Number(event.currentTarget.value))}
          />
        </div>
      );
    }
    if (typeof value === "string") {
      if (IMAGE_KEYS.has(key)) {
        const previewSrc = previews[path] || value;
        return (
          <div className="admin-field admin-image" key={path}>
            <label htmlFor={path}>{humanize(key)}</label>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewSrc} alt="" />
            <input
              id={path}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
              onChange={(event) => onPickImage(path, event.target.files?.[0])}
            />
          </div>
        );
      }
      const Tag = LONG_KEYS.has(key) || value.length > 140 ? "textarea" : "input";
      return (
        <div className="admin-field" key={path}>
          <label htmlFor={path}>{humanize(key)}</label>
          <Tag
            id={path}
            value={value}
            onChange={(event) => update(path, event.currentTarget.value)}
          />
        </div>
      );
    }
    if (Array.isArray(value)) {
      const mutable = isMutableList(path);
      return (
        <div key={path}>
          {value.map((item, index) => {
            const childPath = path ? `${path}.${index}` : String(index);
            if (typeof item === "string") {
              return (
                <div className="admin-field" key={childPath}>
                  <label htmlFor={childPath}>
                    {humanize(key)} {index + 1}
                  </label>
                  <input
                    id={childPath}
                    value={item}
                    onChange={(event) => update(childPath, event.currentTarget.value)}
                  />
                </div>
              );
            }
            return (
              <fieldset className="admin-fieldset" key={childPath}>
                <legend>{itemTitle(item, index)}</legend>
                {mutable ? (
                  <div className="admin-list-actions">
                    <button type="button" className="admin-btn admin-btn-secondary" onClick={() => {
                      if (index === 0) return;
                      const list = [...getArray(path)];
                      [list[index - 1], list[index]] = [list[index], list[index - 1]];
                      mutateArray(path, list);
                    }}>
                      Up
                    </button>
                    <button type="button" className="admin-btn admin-btn-secondary" onClick={() => {
                      const list = [...getArray(path)];
                      if (index >= list.length - 1) return;
                      [list[index + 1], list[index]] = [list[index], list[index + 1]];
                      mutateArray(path, list);
                    }}>
                      Down
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn-secondary"
                      onClick={() => {
                        if (!window.confirm("Are you sure you want to delete this item?")) return;
                        mutateArray(path, getArray(path).filter((_, itemIndex) => itemIndex !== index));
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
                {isPlainObject(item) && item.id ? <p className="admin-locked">ID: {String(item.id)}</p> : null}
                {renderFields(item, childPath)}
              </fieldset>
            );
          })}
          {mutable ? (
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={() => mutateArray(path, [...value, newListItem(path, value[0], section)])}
            >
              Add item
            </button>
          ) : null}
        </div>
      );
    }
    if (isPlainObject(value)) {
      return (
        <fieldset className="admin-fieldset" key={path}>
          <legend>{humanize(key)}</legend>
          {renderFields(value, path)}
        </fieldset>
      );
    }
    return null;
  }

  function renderFields(value: unknown, path = "") {
    if (!isPlainObject(value)) return null;
    return Object.entries(value).map(([key, child]) =>
      renderValue(child, path ? `${path}.${key}` : key, key),
    );
  }

  if (loading) {
    return (
      <div className="admin-panel">
        <h1 className="admin-title">{SECTION_LABELS[section]}</h1>
        <p className="admin-lead">Loading content…</p>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <h1 className="admin-title">{SECTION_LABELS[section]}</h1>
      <p className="admin-lead">{description}</p>
      <div className="admin-card">
        {content != null ? renderFields(content) : <p>No content loaded.</p>}
        {error ? <p className="admin-note admin-note-err">{error}</p> : null}
        {success ? <p className="admin-note admin-note-ok">{success}</p> : null}
        {draftNote ? <p className="admin-note">{draftNote}</p> : null}
        <div className="admin-actions">
          <button type="button" className="admin-btn admin-btn-primary" onClick={() => void save()} disabled={saving || content == null || !dirty}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" className="admin-btn admin-btn-secondary" onClick={preview} disabled={saving}>
            Preview
          </button>
          <button type="button" className="admin-btn admin-btn-secondary" onClick={() => void reset()} disabled={saving}>
            Cancel / Reset
          </button>
        </div>
        <p className="admin-lead" style={{ marginTop: "0.9rem" }}>
          Save stores this section in your browser. It does not change the public website. When every
          section is ready, open <strong>Publish</strong> and publish all saved changes together.
          Image fields: {collectImageFields(content).length} available.
        </p>
      </div>
    </div>
  );
}
