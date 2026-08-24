import {
  CONTENT_FILES,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_SAVE,
  type ContentSection,
} from "@/lib/admin/config";
import { readContentFile, type RepoFile } from "@/lib/admin/content-files";
import {
  detectImageExt,
  isUploadImageRepoPath,
  repoPathToWebPath,
  uploadRepoPath,
  webPathToRepoPath,
} from "@/lib/admin/paths";
import { collectImageFields, getAt, mergeExistingContent, setAt } from "@/lib/admin/validate";

export type SectionImage = {
  fieldPath: string;
  file: File;
};

export async function applySectionUpdate(
  section: ContentSection,
  incoming: unknown,
  images: SectionImage[],
) {
  const current = await readContentFile(section);
  let merged = mergeExistingContent(current, incoming, "", section);
  const allowedImageFields = new Set(collectImageFields(merged));
  const files: RepoFile[] = [];
  const replacedUploads = new Set<string>();

  if (images.length > MAX_IMAGES_PER_SAVE) {
    throw new Error(`You can replace at most ${MAX_IMAGES_PER_SAVE} images in ${section}.`);
  }

  for (const image of images) {
    if (!allowedImageFields.has(image.fieldPath)) {
      throw new Error(`That image field cannot be updated (${section}).`);
    }
    if (image.file.size > MAX_IMAGE_BYTES) {
      throw new Error(`${image.file.name} exceeds 5 MB.`);
    }
    const bytes = new Uint8Array(await image.file.arrayBuffer());
    const ext = detectImageExt(bytes);
    if (!ext) {
      throw new Error(`${image.file.name} is not a supported image (JPG, PNG, WEBP, GIF, or SVG).`);
    }

    const nextRepoPath = uploadRepoPath(section, image.fieldPath, ext);
    const previous = getAt(merged, image.fieldPath);
    if (typeof previous === "string" && previous.startsWith("/images/")) {
      const previousRepo = webPathToRepoPath(previous);
      if (isUploadImageRepoPath(previousRepo) && previousRepo !== nextRepoPath) {
        if (!replacedUploads.has(previousRepo)) {
          files.push({ path: previousRepo, delete: true });
          replacedUploads.add(previousRepo);
        }
      }
    }

    files.push({ path: nextRepoPath, content: Buffer.from(bytes) });
    merged = setAt(merged, image.fieldPath, repoPathToWebPath(nextRepoPath));
  }

  files.push({
    path: CONTENT_FILES[section],
    content: Buffer.from(`${JSON.stringify(merged, null, 2)}\n`, "utf8"),
  });

  return { files, merged };
}
