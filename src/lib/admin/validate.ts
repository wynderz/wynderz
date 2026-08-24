import type { ContentSection } from "@/lib/admin/config";
import { normalizeYoutubeUrl } from "@/lib/admin/youtube";

const MAX_STRING = 8_000;
const LONG_STRING_KEYS = new Set([
  "about",
  "aboutExtended",
  "description",
  "intro",
  "quote",
  "summary",
  "bio",
  "body",
]);
const IMAGE_KEYS = new Set([
  "image",
  "src",
  "logo",
  "heroImage",
  "companyImage",
  "spotlightImage",
  "thumbnail",
]);
const LOCKED_KEYS = new Set(["icon", "gallery"]);
const MUTABLE_ARRAY_PATHS = new Set([
  "items",
  "hero.slides",
  "gallery.images",
  "categories",
  "capabilities.items",
  "socialLinks",
  "navLinks",
  "galleryNavItems",
  "businessHours",
  "company.paragraphs",
  "profile.highlights",
  "profile.facts",
]);
const MAX_ARRAY_ITEMS = 80;
const PLACEHOLDER_IMAGE = "/images/brand/logo.png";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function looksLikeImagePath(value: string) {
  return value.startsWith("/images/");
}

function looksLikeUrl(value: string) {
  return /^(https?:\/\/|tel:|mailto:|\/|#)/i.test(value);
}

function isMutableArray(path: string) {
  if (MUTABLE_ARRAY_PATHS.has(path)) return true;
  if (path.endsWith(".items") && !path.includes("categories")) return true;
  if (path.endsWith(".paragraphs") || path.endsWith(".highlights") || path.endsWith(".facts")) return true;
  if (/^navLinks\.\d+\.items$/.test(path)) return true;
  if (/^categories\.\d+\.items$/.test(path)) return true;
  return false;
}

function sanitizeId(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  if (slug.length < 2) {
    throw new Error("Each item needs a short ID made of letters, numbers, and hyphens.");
  }
  return slug;
}

function sanitizeString(value: string, path: string, current: string) {
  const cleaned = value.replace(/\u0000/g, "").trim();
  const key = path.split(".").pop() || "";
  const max = LONG_STRING_KEYS.has(key) ? 12_000 : MAX_STRING;
  if (cleaned.length > max) {
    throw new Error(`Text is too long in ${path}.`);
  }
  if (looksLikeImagePath(current) || IMAGE_KEYS.has(key)) {
    if (!cleaned.startsWith("/images/") || cleaned.includes("..") || cleaned.includes("\\")) {
      throw new Error(`Invalid image path in ${path}.`);
    }
    if (cleaned.length > 240) {
      throw new Error(`Image path is too long in ${path}.`);
    }
  }
  if (key === "youtubeUrl" || key === "youtubeVideoId") {
    return cleaned;
  }
  if (looksLikeUrl(current) && cleaned) {
    if (!looksLikeUrl(cleaned) || cleaned.toLowerCase().includes("javascript:") || cleaned.toLowerCase().includes("data:")) {
      throw new Error(`Invalid URL in ${path}.`);
    }
  }
  if (key === "id" && cleaned) {
    return sanitizeId(cleaned);
  }
  return cleaned;
}

function defaultItem(path: string, sample: unknown, section?: ContentSection): unknown {
  if (Array.isArray(sample) && typeof sample[0] === "string") return "";
  if (isPlainObject(sample)) {
    const clone = structuredClone(sample);
    if ("id" in clone) clone.id = `item-${Date.now().toString(36)}`;
    if ("name" in clone) clone.name = "New item";
    if ("title" in clone) clone.title = "New item";
    if ("label" in clone) clone.label = "New item";
    if ("summary" in clone) clone.summary = "";
    if ("description" in clone) clone.description = "";
    if ("image" in clone) clone.image = PLACEHOLDER_IMAGE;
    if ("src" in clone) clone.src = PLACEHOLDER_IMAGE;
    if ("thumbnail" in clone) clone.thumbnail = PLACEHOLDER_IMAGE;
    if ("youtubeUrl" in clone) clone.youtubeUrl = "https://www.youtube.com/watch?v=";
    if ("youtubeVideoId" in clone) clone.youtubeVideoId = "";
    if ("isActive" in clone) clone.isActive = true;
    if ("inCarousel" in clone) clone.inCarousel = false;
    return clone;
  }
  if (section === "videos" || path.includes("youtube")) {
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
  if (path.includes("gallery.images") || path === "gallery.images") {
    return { id: `gallery-${Date.now().toString(36)}`, src: PLACEHOLDER_IMAGE, alt: "", href: "/products" };
  }
  if (section === "applications") {
    return { title: "New item", description: "" };
  }
  if (path === "items" || path.endsWith(".items")) {
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

export function mergeExistingContent(
  current: unknown,
  incoming: unknown,
  path = "",
  section?: ContentSection,
): unknown {
  if (Array.isArray(current)) {
    if (!Array.isArray(incoming)) {
      throw new Error(`Invalid list${path ? ` at ${path}` : ""}.`);
    }
    const mutable = isMutableArray(path);
    if (!mutable && incoming.length !== current.length) {
      throw new Error(`This list cannot be added to or removed from${path ? ` (${path})` : ""}.`);
    }
    if (incoming.length > MAX_ARRAY_ITEMS) {
      throw new Error("That list is too long.");
    }
    const sample = current[0];
    return incoming.map((item, index) => {
      const childPath = path ? `${path}.${index}` : String(index);
      const baseline = current[index] ?? defaultItem(path, sample, section);
      return mergeExistingContent(baseline, item, childPath, section);
    });
  }

  if (isPlainObject(current)) {
    if (!isPlainObject(incoming)) {
      throw new Error(`Invalid content${path ? ` at ${path}` : ""}.`);
    }
    const next: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(current), ...Object.keys(incoming)]);
    for (const key of keys) {
      if (!(key in current) && !["isActive", "displayOrder", "youtubeVideoId", "youtubeUrl", "thumbnail"].includes(key)) {
        continue;
      }
      const childPath = path ? `${path}.${key}` : key;
      if (LOCKED_KEYS.has(key) && key in current) {
        next[key] = current[key];
        continue;
      }
      if (key === "id") {
        const incomingId = incoming[key];
        const currentId = current.id ? String(current.id) : "";
        const generated = currentId.startsWith("item-") || currentId.startsWith("gallery-");
        if (typeof incomingId === "string" && (!currentId || generated)) {
          next[key] = sanitizeId(incomingId);
        } else {
          next[key] = currentId;
        }
        continue;
      }
      const baseline = key in current ? current[key] : incoming[key];
      next[key] = mergeExistingContent(baseline, incoming[key] ?? baseline, childPath, section);
    }

    if ("youtubeUrl" in next || "youtubeVideoId" in next) {
      const url = String(next.youtubeUrl || "");
      if (url) {
        try {
          const normalized = normalizeYoutubeUrl(url);
          next.youtubeUrl = normalized.youtubeUrl;
          next.youtubeVideoId = normalized.youtubeVideoId;
        } catch (error) {
          throw error;
        }
      }
    }
    return next;
  }

  if (typeof current === "boolean") {
    return Boolean(incoming);
  }
  if (typeof current === "number") {
    const value = Number(incoming);
    if (!Number.isFinite(value)) throw new Error(`Invalid number${path ? ` at ${path}` : ""}.`);
    return value;
  }

  if (typeof current === "string") {
    if (typeof incoming !== "string") {
      throw new Error(`Invalid text${path ? ` at ${path}` : ""}.`);
    }
    return sanitizeString(incoming, path, current);
  }

  return current;
}

export function collectImageFields(value: unknown, path = "", found: string[] = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectImageFields(item, path ? `${path}.${index}` : String(index), found));
    return found;
  }
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (IMAGE_KEYS.has(key) && typeof child === "string") found.push(childPath);
      else collectImageFields(child, childPath, found);
    }
  }
  return found;
}

export function getAt(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current == null) return undefined;
    if (Array.isArray(current)) return current[Number(key)];
    if (typeof current === "object") return (current as Record<string, unknown>)[key];
    return undefined;
  }, value);
}

export function setAt<T>(value: T, path: string, nextValue: unknown): T {
  const clone = structuredClone(value);
  const keys = path.split(".");
  let current: unknown = clone;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    if (Array.isArray(current)) current = current[Number(key)];
    else current = (current as Record<string, unknown>)[key];
  }
  const last = keys[keys.length - 1];
  if (Array.isArray(current)) current[Number(last)] = nextValue;
  else (current as Record<string, unknown>)[last] = nextValue;
  return clone;
}

export { IMAGE_KEYS, PLACEHOLDER_IMAGE };
