import { NextResponse } from "next/server";
import { applySectionUpdate } from "@/lib/admin/apply-section";
import {
  COMMIT_TITLES,
  MAX_JSON_BYTES,
  isContentSection,
  type ContentSection,
} from "@/lib/admin/config";
import { assertRepoFilesAllowed, writeLocalFiles } from "@/lib/admin/content-files";
import { commitRepoFiles, getGithubConfig } from "@/lib/admin/github";
import { requireAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";
export const maxDuration = 60;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminSession();
  } catch {
    return errorResponse("Your session expired. Please sign in again.", 401);
  }

  if (!sameOrigin(request)) {
    return errorResponse("Invalid request origin.", 403);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("Could not read the submitted form. The files may be too large.", 413);
  }

  const sectionValue = String(form.get("section") || "");
  if (!isContentSection(sectionValue)) {
    return errorResponse("Unknown content section.", 400);
  }
  const section: ContentSection = sectionValue;

  const rawContent = String(form.get("content") || "");
  if (!rawContent || Buffer.byteLength(rawContent, "utf8") > MAX_JSON_BYTES) {
    return errorResponse("Content payload is missing or too large.", 400);
  }

  let incoming: unknown;
  try {
    incoming = JSON.parse(rawContent);
  } catch {
    return errorResponse("Invalid content data.", 400);
  }

  const imageFiles = form
    .getAll("images")
    .filter((item): item is File => item instanceof File && item.size > 0);
  const imageFields = form.getAll("imageFields").map((item) => String(item));
  if (imageFiles.length !== imageFields.length) {
    return errorResponse("Image upload data is incomplete.", 400);
  }

  let files;
  let merged;
  try {
    const applied = await applySectionUpdate(
      section,
      incoming,
      imageFields.map((fieldPath, index) => ({ fieldPath, file: imageFiles[index] })),
    );
    files = applied.files;
    merged = applied.merged;
    assertRepoFilesAllowed(files);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Invalid content.", 400);
  }

  const github = getGithubConfig();
  const onVercel = process.env.VERCEL === "1";

  if (onVercel && !github) {
    return errorResponse(
      "GitHub is not configured. Add GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, and GITHUB_BRANCH in Vercel.",
      503,
    );
  }

  try {
    if (github) {
      const commit = await commitRepoFiles(files, COMMIT_TITLES[section]);
      return NextResponse.json({
        ok: true,
        committed: true,
        sha: commit.sha,
        content: merged,
        message:
          "Changes saved successfully. A Vercel deployment should start automatically from this GitHub commit.",
      });
    }

    await writeLocalFiles(files);
    return NextResponse.json({
      ok: true,
      committed: false,
      content: merged,
      message:
        "Changes saved to local files. Configure GitHub environment variables to commit and trigger a Vercel deploy.",
    });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 502;
    return errorResponse(
      error instanceof Error ? error.message : "Could not save changes.",
      status >= 400 && status < 600 ? status : 502,
    );
  }
}
