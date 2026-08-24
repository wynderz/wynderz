import { NextResponse } from "next/server";
import { isContentSection } from "@/lib/admin/config";
import { readContentFile } from "@/lib/admin/content-files";
import { requireAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Your session expired. Please sign in again." }, { status: 401 });
  }

  const section = new URL(request.url).searchParams.get("section") || "";
  if (!isContentSection(section)) {
    return NextResponse.json({ error: "Unknown content section." }, { status: 400 });
  }

  try {
    const content = await readContentFile(section);
    return NextResponse.json({ ok: true, section, content });
  } catch {
    return NextResponse.json({ error: "Could not read content files." }, { status: 500 });
  }
}
