import {
  ALLOWED_IMAGE_EXTS,
  CONTENT_FILES,
  IMAGE_UPLOAD_PREFIX,
  PUBLIC_IMAGE_PREFIX,
  type ContentSection,
} from "@/lib/admin/config";

const CONTENT_FILE_SET = new Set(Object.values(CONTENT_FILES));

export function assertSafeRepoPath(repoPath: string) {
  const normalized = repoPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || normalized.includes("\0")) {
    throw new Error("Invalid file path.");
  }
  if (normalized !== repoPath.replace(/\\/g, "/").replace(/^\/+/, "")) {
    throw new Error("Invalid file path.");
  }
  return normalized;
}

export function isAllowedContentFile(repoPath: string) {
  return CONTENT_FILE_SET.has(assertSafeRepoPath(repoPath));
}

export function isAllowedImageRepoPath(repoPath: string) {
  const normalized = assertSafeRepoPath(repoPath);
  if (!normalized.startsWith(PUBLIC_IMAGE_PREFIX)) return false;
  if (normalized.includes("//")) return false;
  const ext = normalized.split(".").pop()?.toLowerCase() || "";
  return (ALLOWED_IMAGE_EXTS as readonly string[]).includes(ext);
}

export function isUploadImageRepoPath(repoPath: string) {
  return isAllowedImageRepoPath(repoPath) && repoPath.startsWith(IMAGE_UPLOAD_PREFIX);
}

export function webPathToRepoPath(webPath: string) {
  const clean = webPath.trim();
  if (!clean.startsWith("/images/") || clean.includes("..")) {
    throw new Error("Image path must start with /images/.");
  }
  return `public${clean}`;
}

export function repoPathToWebPath(repoPath: string) {
  const normalized = assertSafeRepoPath(repoPath);
  if (!normalized.startsWith("public/")) {
    throw new Error("Invalid public image path.");
  }
  return normalized.slice("public".length);
}

export function uploadRepoPath(section: ContentSection, fieldPath: string, ext: string) {
  const key = `${section}-${fieldPath}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const safeExt = ext.toLowerCase() === "jpeg" ? "jpg" : ext.toLowerCase();
  if (!(ALLOWED_IMAGE_EXTS as readonly string[]).includes(safeExt)) {
    throw new Error("Unsupported image type.");
  }
  return `${IMAGE_UPLOAD_PREFIX}${key}.${safeExt}`;
}

export function detectImageExt(bytes: Uint8Array) {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  if (riff === "RIFF" && webp === "WEBP") return "webp";
  const head = new TextDecoder().decode(bytes.slice(0, 256)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "svg";
  return null;
}
