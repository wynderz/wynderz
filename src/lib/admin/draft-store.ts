import { CONTENT_SECTIONS, type ContentSection } from "@/lib/admin/config";

const JSON_PREFIX = "wynderz-cms-draft-";
const DB_NAME = "wynderz-cms";
const STORE = "images";

function jsonKey(section: ContentSection) {
  return `${JSON_PREFIX}${section}`;
}

function imageKey(section: ContentSection, fieldPath: string) {
  return `${section}::${fieldPath}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet(key: string): Promise<File | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as File | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, file: File) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).put(file, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(key: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbKeys(): Promise<string[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String));
    req.onerror = () => reject(req.error);
  });
}

export function hasDraftJson(section: ContentSection) {
  return Boolean(window.localStorage.getItem(jsonKey(section)));
}

export function readDraftJson(section: ContentSection): unknown | null {
  const raw = window.localStorage.getItem(jsonKey(section));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    window.localStorage.removeItem(jsonKey(section));
    return null;
  }
}

export async function saveDraft(
  section: ContentSection,
  content: unknown,
  pending: Record<string, File>,
) {
  window.localStorage.setItem(jsonKey(section), JSON.stringify(content));
  for (const [fieldPath, file] of Object.entries(pending)) {
    await idbSet(imageKey(section, fieldPath), file);
  }
}

export async function loadDraftImages(section: ContentSection) {
  const keys = await idbKeys();
  const prefix = `${section}::`;
  const pending: Record<string, File> = {};
  const previews: Record<string, string> = {};
  for (const key of keys) {
    if (!key.startsWith(prefix)) continue;
    const fieldPath = key.slice(prefix.length);
    const file = await idbGet(key);
    if (!file) continue;
    pending[fieldPath] = file;
    previews[fieldPath] = URL.createObjectURL(file);
  }
  return { pending, previews };
}

export async function clearDraft(section: ContentSection) {
  window.localStorage.removeItem(jsonKey(section));
  const keys = await idbKeys();
  const prefix = `${section}::`;
  for (const key of keys) {
    if (key.startsWith(prefix)) await idbDelete(key);
  }
}

export async function listSavedDrafts() {
  const drafts: Array<{
    section: ContentSection;
    content: unknown;
    pending: Record<string, File>;
  }> = [];
  for (const section of CONTENT_SECTIONS) {
    const content = readDraftJson(section);
    if (content == null) continue;
    const { pending } = await loadDraftImages(section);
    drafts.push({ section, content, pending });
  }
  return drafts;
}

export async function clearAllDrafts() {
  for (const section of CONTENT_SECTIONS) {
    await clearDraft(section);
  }
}
