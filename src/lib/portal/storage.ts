import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { AppError } from "./errors";

/**
 * Private file storage. Selected by PORTAL_STORAGE_DRIVER:
 *  - "local" (default): disk outside /public, never served statically. Development / persistent-disk hosts.
 *  - "s3": a private S3-compatible bucket (AWS S3, Cloudflare R2, MinIO). Required on serverless (Vercel).
 * Keys are always server-generated (see storeBytes) and validated by assertStorageKey.
 */
export interface FileStorage {
  /** Fails if the key already exists. */
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

export function assertStorageKey(key: string) {
  if (
    !/^[a-z0-9/_.-]+$/i.test(key) ||
    key.length > 512 ||
    key.startsWith("/") ||
    key.endsWith("/") ||
    key.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new AppError("Invalid storage key.", 400);
  }
  return key;
}

const missingFile = () => new AppError("The stored file is missing.", 404, "not_found");

export class LocalStorage implements FileStorage {
  constructor(private root: string) {}
  private resolve(key: string) {
    const full = path.resolve(this.root, assertStorageKey(key));
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new AppError("Invalid storage key.", 400);
    return full;
  }
  async put(key: string, bytes: Uint8Array) {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes, { flag: "wx", mode: 0o600 });
  }
  async get(key: string) {
    const full = this.resolve(key);
    try {
      return await readFile(full);
    } catch {
      throw missingFile();
    }
  }
  async remove(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

/** The subset of S3Client used here, so tests can pass a fake without a real bucket. */
export type S3Sender = Pick<S3Client, "send">;

export class S3Storage implements FileStorage {
  constructor(
    private client: S3Sender,
    private bucket: string,
    private prefix = "",
  ) {}
  private objectKey(key: string) {
    return this.prefix + assertStorageKey(key);
  }
  private async exists(objectKey: string) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }));
      return true;
    } catch (err) {
      const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e.$metadata?.httpStatusCode === 404 || e.name === "NotFound" || e.name === "NoSuchKey") return false;
      throw err;
    }
  }
  async put(key: string, bytes: Uint8Array) {
    const objectKey = this.objectKey(key);
    // Some S3-compatible stores (e.g. Supabase Storage) ignore If-None-Match and would silently overwrite,
    // so check first; the conditional write below keeps it atomic where the provider supports it.
    if (await this.exists(objectKey)) throw new Error(`Storage key already exists: ${key}`);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
          Body: bytes,
          ContentType: "application/octet-stream",
          // Conditional write: atomic "never overwrite" on AWS S3 and R2.
          IfNoneMatch: "*",
        }),
      );
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 412 || status === 409) throw new Error(`Storage key already exists: ${key}`);
      throw err;
    }
  }
  async get(key: string) {
    let body;
    try {
      ({ Body: body } = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) })));
    } catch (err) {
      if (err instanceof NoSuchKey || (err as { name?: string }).name === "NoSuchKey") throw missingFile();
      throw err;
    }
    if (!body) throw missingFile();
    return Buffer.from(await body.transformToByteArray());
  }
  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }));
  }
}

type Env = Record<string, string | undefined>;

/** Builds the storage backend from environment variables. Exported for tests. */
export function createStorage(env: Env = process.env): FileStorage {
  const driver = (env.PORTAL_STORAGE_DRIVER || "local").trim().toLowerCase();
  if (driver === "local") {
    return new LocalStorage(path.resolve(process.cwd(), env.PORTAL_STORAGE_DIR || "./.portal-storage"));
  }
  if (driver === "s3") {
    const bucket = env.PORTAL_S3_BUCKET?.trim();
    if (!bucket) throw new Error("PORTAL_S3_BUCKET is required when PORTAL_STORAGE_DRIVER=s3.");
    const endpoint = env.PORTAL_S3_ENDPOINT?.trim() || undefined;
    // R2 uses region "auto"; AWS needs the bucket's real region.
    const region = env.PORTAL_S3_REGION?.trim() || (endpoint ? "auto" : undefined);
    if (!region) throw new Error("PORTAL_S3_REGION is required when PORTAL_S3_ENDPOINT is not set.");
    const accessKeyId = env.PORTAL_S3_ACCESS_KEY_ID?.trim();
    const secretAccessKey = env.PORTAL_S3_SECRET_ACCESS_KEY?.trim();
    if (!!accessKeyId !== !!secretAccessKey) {
      throw new Error("Set both PORTAL_S3_ACCESS_KEY_ID and PORTAL_S3_SECRET_ACCESS_KEY, or neither (default AWS credential chain).");
    }
    let prefix = (env.PORTAL_S3_PREFIX || "").trim().replace(/^\/+|\/+$/g, "");
    if (prefix) prefix = assertStorageKey(prefix) + "/";
    const client = new S3Client({
      region,
      endpoint,
      forcePathStyle: env.PORTAL_S3_FORCE_PATH_STYLE === "true",
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    });
    return new S3Storage(client, bucket, prefix);
  }
  throw new Error(`Unknown PORTAL_STORAGE_DRIVER "${driver}" (expected "local" or "s3").`);
}

let storage: FileStorage | null = null;
export function getStorage(): FileStorage {
  if (!storage) storage = createStorage();
  return storage;
}

/* ------------------------------------------------------------- validation */

type Detected = { mime: string; ext: string; inline: boolean };

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

/** Detects type from content (magic bytes) and cross-checks the extension. SVG/HTML are rejected. */
export function detectFileType(fileName: string, b: Uint8Array): Detected {
  const ext = path.extname(fileName).toLowerCase().replace(".", "");
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46])) return { mime: "application/pdf", ext: "pdf", inline: true };
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47])) return { mime: "image/png", ext: "png", inline: true };
  if (startsWith(b, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg", inline: true };
  if (startsWith(b, [0x47, 0x49, 0x46, 0x38])) return { mime: "image/gif", ext: "gif", inline: true };
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return { mime: "image/webp", ext: "webp", inline: true };
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) {
    const zipTypes: Record<string, string> = {
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      zip: "application/zip",
    };
    if (zipTypes[ext]) return { mime: zipTypes[ext], ext, inline: false };
    throw new AppError("Unsupported archive type. Allowed: .xlsx, .docx, .pptx, .zip");
  }
  if (startsWith(b, [0xd0, 0xcf, 0x11, 0xe0])) {
    const oleTypes: Record<string, string> = { xls: "application/vnd.ms-excel", doc: "application/msword" };
    if (oleTypes[ext]) return { mime: oleTypes[ext], ext, inline: false };
    throw new AppError("Unsupported Office file type.");
  }
  if (startsWith(b, [0x41, 0x43, 0x31, 0x30]) && ext === "dwg") return { mime: "application/acad", ext: "dwg", inline: false };
  // Plain text formats: must not contain NUL bytes or markup.
  if (["csv", "txt", "dxf", "tsv"].includes(ext)) {
    const head = b.subarray(0, 4096);
    if (head.includes(0)) throw new AppError("This file does not look like a text file.");
    const text = new TextDecoder().decode(head).toLowerCase();
    if (/<\s*(script|html|svg)/.test(text)) throw new AppError("Files containing markup are not allowed.");
    return { mime: ext === "csv" ? "text/csv" : "text/plain", ext, inline: false };
  }
  throw new AppError("Unsupported file type. Allowed: PDF, images (PNG/JPG/WEBP/GIF), Excel, Word, PowerPoint, CSV, TXT, DWG/DXF, ZIP.");
}

export function safeFileName(name: string) {
  const base = path.basename(name).normalize("NFKC").replace(/[^\w.\- ()]+/g, "_").replace(/_{2,}/g, "_").trim();
  return (base || "file").slice(0, 150);
}

export function maxUploadBytes(mb?: number) {
  return (mb ?? Number(process.env.PORTAL_MAX_UPLOAD_MB || 15)) * 1024 * 1024;
}

export async function storeBytes(fileName: string, bytes: Uint8Array, maxBytes = maxUploadBytes()) {
  if (bytes.byteLength === 0) throw new AppError("The file is empty.");
  if (bytes.byteLength > maxBytes) throw new AppError(`File is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`, 413);
  const type = detectFileType(fileName, bytes);
  const now = new Date();
  const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${type.ext}`;
  await getStorage().put(key, bytes);
  return { key, ...type, size: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex"), originalName: safeFileName(fileName) };
}
