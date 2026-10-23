import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { Db } from "@/lib/portal/db";
import { ctx, freshDb, hasDb } from "./helpers";
import { readDocumentFile, uploadDocument } from "@/lib/portal/services/documents";

/** Upload + download round-trip through the configured storage driver (local disk in tests). */
describe.skipIf(!hasDb)("document storage round-trip", () => {
  let db: Db;
  let pool: Pool;
  beforeAll(async () => ({ db, pool } = await freshDb()));
  afterAll(async () => pool?.end());

  it("stores the bytes under a server-generated key and returns them unchanged", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.4\n% test document\n%%EOF\n");
    const doc = await uploadDocument(db, ctx, new File([pdf], "../../evil name.pdf"), { title: "Test PDF" });
    const { doc: row, bytes } = await readDocumentFile(db, ctx, doc.id);
    expect(row.storageKey).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.pdf$/);
    expect(row.originalName).toBe("evil name.pdf");
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(bytes.equals(Buffer.from(pdf))).toBe(true);
  });
});
