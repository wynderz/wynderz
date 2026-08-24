import homeJson from "../../../content/home.json";
import aboutJson from "../../../content/about.json";
import productsJson from "../../../content/products.json";
import applicationsJson from "../../../content/applications.json";
import contactJson from "../../../content/contact.json";
import globalJson from "../../../content/global.json";
import {
  CONTENT_FILES,
  MAX_JSON_BYTES,
  type ContentSection,
} from "@/lib/admin/config";
import { isAllowedContentFile, isUploadImageRepoPath } from "@/lib/admin/paths";

const bundledContent: Record<ContentSection, unknown> = {
  home: homeJson,
  about: aboutJson,
  products: productsJson,
  applications: applicationsJson,
  contact: contactJson,
  global: globalJson,
  videos: { kicker: "Videos", heading: "Videos", description: "", items: [] },
};

export async function readContentFile(section: ContentSection) {
  const repoPath = CONTENT_FILES[section];
  if (!isAllowedContentFile(repoPath)) {
    throw new Error("Content file is not allowlisted.");
  }
  try {
    const { readFile } = await import("fs/promises");
    const path = await import("path");
    const raw = await readFile(path.join(process.cwd(), repoPath), "utf8");
    if (Buffer.byteLength(raw, "utf8") > MAX_JSON_BYTES) {
      throw new Error("Content file is unexpectedly large.");
    }
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return structuredClone(bundledContent[section]);
    throw error;
  }
}

export async function writeLocalFiles(files: RepoFile[]) {
  const { mkdir, writeFile, unlink, rename } = await import("fs/promises");
  const path = await import("path");
  for (const file of files) {
    const abs = path.join(process.cwd(), file.path);
    if (file.delete) {
      try {
        await unlink(abs);
      } catch {
        // Already gone.
      }
      continue;
    }
    await mkdir(path.dirname(abs), { recursive: true });
    if (!file.content) {
      throw new Error("Missing file content.");
    }
    const temp = `${abs}.${process.pid}.tmp`;
    await writeFile(temp, file.content);
    await rename(temp, abs);
  }
}

export type RepoFile = {
  path: string;
  content?: Buffer;
  delete?: boolean;
};

export function assertRepoFilesAllowed(files: RepoFile[]) {
  for (const file of files) {
    if (file.delete) {
      if (!isUploadImageRepoPath(file.path)) {
        throw new Error("Only uploaded images can be removed.");
      }
      continue;
    }
    const allowedJson = isAllowedContentFile(file.path);
    const allowedUpload = isUploadImageRepoPath(file.path);
    if (!allowedJson && !allowedUpload) {
      throw new Error("That file path is not allowed.");
    }
  }
}
