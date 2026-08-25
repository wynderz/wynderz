import { NextResponse } from "next/server";
import { applySectionUpdate } from "@/lib/admin/apply-section";
import { CONTENT_SECTIONS, MAX_JSON_BYTES, isContentSection, type ContentSection } from "@/lib/admin/config";
import { assertRepoFilesAllowed, writeLocalFiles, type RepoFile } from "@/lib/admin/content-files";
import { commitRepoFiles, getGithubConfig, getPublishBranch, isPublishTarget } from "@/lib/admin/github";
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

  const payloadRaw = String(form.get("payload") || "");
  if (!payloadRaw || Buffer.byteLength(payloadRaw, "utf8") > MAX_JSON_BYTES * CONTENT_SECTIONS.length) {
    return errorResponse("Publish payload is missing or too large.", 400);
  }

  let payload: { sections?: Array<{ section?: string; content?: unknown }>; target?: string };
  try {
    payload = JSON.parse(payloadRaw) as {
      sections?: Array<{ section?: string; content?: unknown }>;
      target?: string;
    };
  } catch {
    return errorResponse("Invalid publish data.", 400);
  }

  const targetValue = String(payload.target || form.get("target") || "");
  if (!isPublishTarget(targetValue)) {
    return errorResponse("Choose Publish to dev or Publish to main.", 400);
  }
  const target = targetValue;
  const branch = getPublishBranch(target);

  const items = payload.sections || [];
  if (items.length === 0) {
    return errorResponse("Nothing to publish. Save at least one section first.", 400);
  }

  const seen = new Set<string>();
  const files: RepoFile[] = [];
  const mergedBySection: Record<string, unknown> = {};

  try {
    for (const item of items) {
      const name = String(item.section || "");
      if (!isContentSection(name)) {
        return errorResponse("Unknown content section.", 400);
      }
      if (seen.has(name)) {
        return errorResponse("Duplicate section in publish request.", 400);
      }
      seen.add(name);
      const section: ContentSection = name;
      const imageFields = form.getAll(`imageFields_${section}`).map((value) => String(value));
      const imageFiles = form
        .getAll(`images_${section}`)
        .filter((value): value is File => value instanceof File && value.size > 0);
      if (imageFields.length !== imageFiles.length) {
        return errorResponse(`Image upload data is incomplete for ${section}.`, 400);
      }
      const images = imageFields.map((fieldPath, index) => ({ fieldPath, file: imageFiles[index] }));
      const applied = await applySectionUpdate(section, item.content, images);
      files.push(...applied.files);
      mergedBySection[section] = applied.merged;
    }
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Invalid content.", 400);
  }

  try {
    assertRepoFilesAllowed(files);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "That file path is not allowed.", 400);
  }

  const github = getGithubConfig(target);
  const onVercel = process.env.VERCEL === "1";

  if (onVercel && !github) {
    return errorResponse(
      "GitHub is not configured. Add GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH_DEV, and GITHUB_BRANCH_MAIN in Vercel.",
      503,
    );
  }

  const labels = [...seen].join(", ");
  const message = `Admin: publish ${labels} to ${branch}`;

  try {
    if (github) {
      const commit = await commitRepoFiles(files, message, target);
      return NextResponse.json({
        ok: true,
        committed: true,
        sha: commit.sha,
        branch: commit.branch,
        content: mergedBySection,
        message:
          "Changes published. The live website will update automatically. Refresh wynderz.in to see them.",
      });
    }

    await writeLocalFiles(files);
    return NextResponse.json({
      ok: true,
      committed: false,
      branch,
      content: mergedBySection,
      message: `Changes saved locally (would publish to ${branch}). Add GitHub environment variables to commit and deploy.`,
    });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 502;
    return errorResponse(
      error instanceof Error ? error.message : "Could not publish changes.",
      status >= 400 && status < 600 ? status : 502,
    );
  }
}
