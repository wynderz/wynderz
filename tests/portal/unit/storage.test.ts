import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, NoSuchKey, PutObjectCommand } from "@aws-sdk/client-s3";
import { afterAll, describe, expect, it } from "vitest";
import { assertStorageKey, createStorage, LocalStorage, S3Storage, type S3Sender } from "@/lib/portal/storage";

describe("assertStorageKey", () => {
  it("accepts server-generated keys", () => {
    expect(assertStorageKey("2026/10/0b6f3c1e-4b7a-4a8e-9c1d-2f3e4a5b6c7d.pdf")).toBeTruthy();
    expect(assertStorageKey("a_b-c.d")).toBe("a_b-c.d");
  });
  it.each(["", "../etc/passwd", "a/../b", "/abs", "a//b", "a/", "./a", "a b", "a\\b", "x?y", "é.pdf", "a".repeat(513)])(
    "rejects %j",
    (key) => expect(() => assertStorageKey(key)).toThrow("Invalid storage key."),
  );
});

describe("createStorage", () => {
  it("defaults to local disk", () => {
    expect(createStorage({})).toBeInstanceOf(LocalStorage);
    expect(createStorage({ PORTAL_STORAGE_DRIVER: "local" })).toBeInstanceOf(LocalStorage);
  });
  it("selects s3 for AWS (bucket + region)", () => {
    expect(createStorage({ PORTAL_STORAGE_DRIVER: "s3", PORTAL_S3_BUCKET: "b", PORTAL_S3_REGION: "ap-south-1" })).toBeInstanceOf(S3Storage);
  });
  it("selects s3 for R2 (endpoint, region defaults to auto)", () => {
    const s = createStorage({
      PORTAL_STORAGE_DRIVER: "S3",
      PORTAL_S3_BUCKET: "b",
      PORTAL_S3_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
      PORTAL_S3_ACCESS_KEY_ID: "id",
      PORTAL_S3_SECRET_ACCESS_KEY: "secret",
    });
    expect(s).toBeInstanceOf(S3Storage);
  });
  it("rejects incomplete or unknown configuration", () => {
    expect(() => createStorage({ PORTAL_STORAGE_DRIVER: "blob" })).toThrow(/Unknown PORTAL_STORAGE_DRIVER/);
    expect(() => createStorage({ PORTAL_STORAGE_DRIVER: "s3", PORTAL_S3_REGION: "us-east-1" })).toThrow(/PORTAL_S3_BUCKET/);
    expect(() => createStorage({ PORTAL_STORAGE_DRIVER: "s3", PORTAL_S3_BUCKET: "b" })).toThrow(/PORTAL_S3_REGION/);
    expect(() =>
      createStorage({ PORTAL_STORAGE_DRIVER: "s3", PORTAL_S3_BUCKET: "b", PORTAL_S3_REGION: "us-east-1", PORTAL_S3_ACCESS_KEY_ID: "id" }),
    ).toThrow(/both/);
    expect(() =>
      createStorage({ PORTAL_STORAGE_DRIVER: "s3", PORTAL_S3_BUCKET: "b", PORTAL_S3_REGION: "us-east-1", PORTAL_S3_PREFIX: "../x" }),
    ).toThrow("Invalid storage key.");
  });
});

/** In-memory fake of the S3 commands used by S3Storage, honouring IfNoneMatch. */
function fakeS3(opts: { honoursIfNoneMatch?: boolean } = {}) {
  const { honoursIfNoneMatch = true } = opts;
  const objects = new Map<string, Uint8Array>();
  const calls: unknown[] = [];
  const client: S3Sender = {
    send: (async (cmd: unknown) => {
      calls.push(cmd);
      if (cmd instanceof PutObjectCommand) {
        const { Key, Body, IfNoneMatch } = cmd.input;
        if (honoursIfNoneMatch && IfNoneMatch === "*" && objects.has(Key!)) throw Object.assign(new Error("PreconditionFailed"), { $metadata: { httpStatusCode: 412 } });
        objects.set(Key!, Body as Uint8Array);
        return {};
      }
      if (cmd instanceof HeadObjectCommand) {
        if (!objects.has(cmd.input.Key!)) throw Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
        return {};
      }
      if (cmd instanceof GetObjectCommand) {
        const bytes = objects.get(cmd.input.Key!);
        if (!bytes) throw new NoSuchKey({ message: "NoSuchKey", $metadata: {} });
        return { Body: { transformToByteArray: async () => bytes } };
      }
      if (cmd instanceof DeleteObjectCommand) {
        objects.delete(cmd.input.Key!);
        return {};
      }
      throw new Error("unexpected command");
    }) as S3Sender["send"],
  };
  return { client, objects, calls };
}

describe("S3Storage", () => {
  it("puts, gets and removes under the prefix, never overwriting", async () => {
    const { client, objects, calls } = fakeS3();
    const s = new S3Storage(client, "bucket", "portal/");
    await s.put("2026/10/a.pdf", new Uint8Array([1, 2, 3]));
    expect([...objects.keys()]).toEqual(["portal/2026/10/a.pdf"]);
    expect(calls.find((c) => c instanceof PutObjectCommand)?.input).toMatchObject({ Bucket: "bucket", IfNoneMatch: "*" });

    await expect(s.put("2026/10/a.pdf", new Uint8Array([9]))).rejects.toThrow(/already exists/);
    const got = await s.get("2026/10/a.pdf");
    expect(Buffer.isBuffer(got)).toBe(true);
    expect([...got]).toEqual([1, 2, 3]);

    await s.remove("2026/10/a.pdf");
    await expect(s.get("2026/10/a.pdf")).rejects.toMatchObject({ status: 404 });
  });
  it("refuses to overwrite even when the provider ignores If-None-Match (Supabase Storage)", async () => {
    const { client, objects } = fakeS3({ honoursIfNoneMatch: false });
    const s = new S3Storage(client, "bucket");
    await s.put("a.txt", new Uint8Array([1]));
    await expect(s.put("a.txt", new Uint8Array([2]))).rejects.toThrow(/already exists/);
    expect([...objects.get("a.txt")!]).toEqual([1]);
  });
  it("validates keys before calling the bucket", async () => {
    const { client, calls } = fakeS3();
    const s = new S3Storage(client, "bucket");
    await expect(s.put("../x", new Uint8Array([1]))).rejects.toThrow("Invalid storage key.");
    await expect(s.get("a//b")).rejects.toThrow("Invalid storage key.");
    expect(calls).toHaveLength(0);
  });
});

describe("LocalStorage", () => {
  const dirs: string[] = [];
  afterAll(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));
  it("round-trips and refuses to overwrite", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "portal-storage-"));
    dirs.push(dir);
    const s = new LocalStorage(dir);
    await s.put("2026/10/a.txt", new Uint8Array([104, 105]));
    await expect(s.put("2026/10/a.txt", new Uint8Array([1]))).rejects.toThrow();
    expect((await s.get("2026/10/a.txt")).toString()).toBe("hi");
    await s.remove("2026/10/a.txt");
    await expect(s.get("2026/10/a.txt")).rejects.toMatchObject({ status: 404 });
  });
});
