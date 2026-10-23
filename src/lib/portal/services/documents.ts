import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, type Ctx } from "../audit";
import type { Db, Tx } from "../db";
import { documents, expenses, financialYears, invoices, materials, projects, suppliers, users } from "../db/schema";
import { AppError, notFound } from "../errors";
import { getStorage, maxUploadBytes, storeBytes } from "../storage";
import { listQuery, optId, optText, reqText } from "../validation";
import { getSetting } from "./settings";
import { archivedFilter, countAll, offset, pageOf, search } from "./shared";

export const DOC_TYPES = ["invoice", "bill", "quotation", "purchase_order", "contract", "receipt", "project_document", "drawing", "attendance_upload", "other"] as const;

export const documentMeta = z.object({
  title: reqText(200),
  docType: z.enum(DOC_TYPES).default("other"),
  financialYearId: optId,
  projectId: optId,
  expenseId: optId,
  materialId: optId,
  supplierId: optId,
  invoiceId: optId,
  notes: optText(2000),
});

export const documentListQuery = listQuery.extend({
  docType: z.enum(DOC_TYPES).optional(),
  projectId: z.coerce.number().int().positive().optional(),
  expenseId: z.coerce.number().int().positive().optional(),
  materialId: z.coerce.number().int().positive().optional(),
  supplierId: z.coerce.number().int().positive().optional(),
});

async function assertLinks(tx: Tx, m: z.infer<typeof documentMeta>) {
  const exists = async (table: typeof projects | typeof expenses | typeof materials | typeof suppliers | typeof invoices | typeof financialYears, id: number | null, label: string) => {
    if (!id) return;
    const [r] = await tx.select({ id: table.id }).from(table).where(eq(table.id, id));
    if (!r) throw new AppError(`Linked ${label} not found.`);
  };
  await exists(projects, m.projectId, "project");
  await exists(expenses, m.expenseId, "expense");
  await exists(materials, m.materialId, "material");
  await exists(suppliers, m.supplierId, "supplier");
  await exists(invoices, m.invoiceId, "invoice");
  await exists(financialYears, m.financialYearId, "financial year");
}

/** Stores the file privately, then records metadata. Removes the file if the DB write fails. */
export async function uploadDocument(db: Db, ctx: Ctx, file: File, rawMeta: unknown) {
  const meta = documentMeta.parse(rawMeta);
  const { maxMb } = await getSetting(db, "uploads");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const stored = await storeBytes(file.name, bytes, maxUploadBytes(maxMb));
  try {
    return await db.transaction(async (tx) => {
      await assertLinks(tx, meta);
      // Inherit year/project from the linked record when not given.
      let { financialYearId, projectId } = meta;
      if (meta.expenseId && (!financialYearId || !projectId)) {
        const [e] = await tx.select({ fy: expenses.financialYearId, p: expenses.projectId }).from(expenses).where(eq(expenses.id, meta.expenseId));
        financialYearId ??= e.fy;
        projectId ??= e.p;
      }
      if (meta.materialId && (!financialYearId || !projectId)) {
        const [m] = await tx.select({ fy: materials.financialYearId, p: materials.projectId }).from(materials).where(eq(materials.id, meta.materialId));
        financialYearId ??= m.fy;
        projectId ??= m.p;
      }
      const [row] = await tx
        .insert(documents)
        .values({
          ...meta,
          financialYearId,
          projectId,
          originalName: stored.originalName,
          storageKey: stored.key,
          mimeType: stored.mime,
          sizeBytes: stored.size,
          sha256: stored.sha256,
          uploadedBy: ctx.userId,
        })
        .returning();
      await audit(tx, ctx, { action: "upload", entity: "document", entityId: row.id, summary: `Uploaded ${row.title} (${row.originalName}, ${Math.round(row.sizeBytes / 1024)} KB)` });
      return row;
    });
  } catch (e) {
    await getStorage().remove(stored.key).catch(() => {});
    throw e;
  }
}

export async function listDocuments(db: Db, raw: unknown) {
  const q = documentListQuery.parse(raw);
  const where = and(
    q.fy ? eq(documents.financialYearId, q.fy) : undefined,
    q.docType ? eq(documents.docType, q.docType) : undefined,
    q.projectId ? eq(documents.projectId, q.projectId) : undefined,
    q.expenseId ? eq(documents.expenseId, q.expenseId) : undefined,
    q.materialId ? eq(documents.materialId, q.materialId) : undefined,
    q.supplierId ? eq(documents.supplierId, q.supplierId) : undefined,
    archivedFilter(documents.archivedAt, q.archived),
    search(q.q, [documents.title, documents.originalName, documents.notes, projects.code, projects.name, suppliers.name]),
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: documents.id,
        title: documents.title,
        docType: documents.docType,
        originalName: documents.originalName,
        mimeType: documents.mimeType,
        sizeBytes: documents.sizeBytes,
        projectId: documents.projectId,
        projectCode: projects.code,
        supplierId: documents.supplierId,
        supplierName: suppliers.name,
        expenseId: documents.expenseId,
        materialId: documents.materialId,
        invoiceId: documents.invoiceId,
        yearLabel: financialYears.label,
        financialYearId: documents.financialYearId,
        notes: documents.notes,
        uploadedBy: users.name,
        createdAt: documents.createdAt,
        archivedAt: documents.archivedAt,
      })
      .from(documents)
      .leftJoin(projects, eq(projects.id, documents.projectId))
      .leftJoin(suppliers, eq(suppliers.id, documents.supplierId))
      .leftJoin(financialYears, eq(financialYears.id, documents.financialYearId))
      .leftJoin(users, eq(users.id, documents.uploadedBy))
      .where(where)
      .orderBy(desc(documents.createdAt))
      .limit(q.pageSize)
      .offset(offset(q)),
    db
      .select({ total: countAll })
      .from(documents)
      .leftJoin(projects, eq(projects.id, documents.projectId))
      .leftJoin(suppliers, eq(suppliers.id, documents.supplierId))
      .where(where),
  ]);
  return pageOf(rows, total, q);
}

export async function getDocument(db: Tx, id: number) {
  const [row] = await db.select().from(documents).where(eq(documents.id, id));
  if (!row) throw notFound("Document");
  return row;
}

export async function readDocumentFile(db: Db, ctx: Ctx, id: number) {
  const doc = await getDocument(db, id);
  const bytes = await getStorage().get(doc.storageKey);
  await audit(db, ctx, { action: "download", entity: "document", entityId: id, summary: `Downloaded ${doc.title}` });
  return { doc, bytes };
}

export async function updateDocument(db: Db, ctx: Ctx, id: number, raw: unknown) {
  const meta = documentMeta.parse(raw);
  return db.transaction(async (tx) => {
    await getDocument(tx, id);
    await assertLinks(tx, meta);
    const [row] = await tx.update(documents).set(meta).where(eq(documents.id, id)).returning();
    await audit(tx, ctx, { action: "update", entity: "document", entityId: id, summary: `Updated document ${row.title}` });
    return row;
  });
}

export async function setDocumentArchived(db: Db, ctx: Ctx, id: number, archived: boolean) {
  const [row] = await db.update(documents).set({ archivedAt: archived ? new Date() : null }).where(eq(documents.id, id)).returning();
  if (!row) throw notFound("Document");
  await audit(db, ctx, { action: archived ? "archive" : "restore", entity: "document", entityId: id, summary: `${archived ? "Archived" : "Restored"} document ${row.title}` });
  return row;
}

export async function documentCounts(db: Db) {
  return db
    .select({ docType: documents.docType, n: countAll, bytes: sql<number>`coalesce(sum(${documents.sizeBytes}),0)::bigint` })
    .from(documents)
    .where(isNull(documents.archivedAt))
    .groupBy(documents.docType);
}
