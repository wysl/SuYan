import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertSafeRelativePath,
  getComponentPlatformDir,
  parseComponentManifest,
  promoteComponentDir,
  readCurrentComponent,
  safeExtractZip,
  selfCheckFfmpeg,
  sha256Hex,
  verifyEd25519Signature,
  verifyExtractedFiles,
  verifySha256,
  writeCurrentComponent,
  type CommandRunner,
  type ZipArchiveLoader,
} from "../../electron/main/modules/componentSecurity";
import { DEFAULT_COMPONENT_LIMITS } from "../../electron/main/modules/componentConfig";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(dir);
  return dir;
}

const loadZip: ZipArchiveLoader = async (data) => {
  const { default: JSZip } = await import("jszip");
  return JSZip.loadAsync(data);
};
async function makeZip(files: Record<string, Buffer>): Promise<Buffer> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("componentSecurity hashing", () => {
  it("computes sha256 and compares in constant time", () => {
    const abc = sha256Hex(Buffer.from("abc"));
    expect(abc).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(verifySha256(Buffer.from("abc"), abc)).toBe(true);
    expect(verifySha256(Buffer.from("abc"), abc.toUpperCase())).toBe(true);
    expect(verifySha256(Buffer.from("abc"), "00")).toBe(false);
    expect(verifySha256(Buffer.from("abc"), "")).toBe(false);
  });
});

describe("componentSecurity signature and manifest", () => {
  const sampleManifest = {
    componentId: "ffmpeg",
    version: "7.1.1-suyan.1",
    platform: "win32-x64",
    archive: { name: "ffmpeg-win32-x64.zip", sha256: "ab".repeat(32), size: 123 },
    files: [{ name: "ffmpeg.exe", sha256: "cd".repeat(32), size: 10 }],
  };

  it("verifies a valid Ed25519 signature and rejects tampering", () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const payload = Buffer.from(JSON.stringify(sampleManifest), "utf8");
    const signature = crypto.sign(null, payload, privateKey);
    expect(verifyEd25519Signature(payload, signature, publicPem)).toBe(true);
    const tampered = Buffer.from(`${JSON.stringify(sampleManifest)} `, "utf8");
    expect(verifyEd25519Signature(tampered, signature, publicPem)).toBe(false);
    expect(verifyEd25519Signature(payload, signature, "")).toBe(false);
  });

  it("parses a valid manifest and rejects malformed ones", () => {
    const parsed = parseComponentManifest(JSON.stringify(sampleManifest));
    expect(parsed.componentId).toBe("ffmpeg");
    expect(parsed.files).toHaveLength(1);
    expect(() => parseComponentManifest("{}")).toThrow();
    const emptyFiles = { ...sampleManifest, files: [] };
    expect(() => parseComponentManifest(JSON.stringify(emptyFiles))).toThrow();
  });
});
describe("componentSecurity safe path and extraction", () => {
  it("normalizes safe relative paths and rejects traversal", () => {
    expect(assertSafeRelativePath("ffmpeg.exe")).toBe("ffmpeg.exe");
    expect(assertSafeRelativePath("sub\\bin\\ff.dll")).toBe("sub/bin/ff.dll");
    expect(assertSafeRelativePath("./a/./b")).toBe("a/b");
    expect(() => assertSafeRelativePath("../escape")).toThrow();
    expect(() => assertSafeRelativePath("a/../../escape")).toThrow();
    expect(() => assertSafeRelativePath("/abs/path")).toThrow();
    expect(() => assertSafeRelativePath("C:/win")).toThrow();
    expect(() => assertSafeRelativePath("")).toThrow();
  });

  it("extracts a benign zip and verifies file hashes", async () => {
    const dest = path.join(await makeTempDir("suyan-extract-"), "out");
    const exe = Buffer.from("hello ffmpeg binary");
    const lic = Buffer.from("license text");
    const zipBuffer = await makeZip({ "ffmpeg.exe": exe, "docs/LICENSE": lic });
    const result = await safeExtractZip(zipBuffer, dest, DEFAULT_COMPONENT_LIMITS, loadZip);
    expect(result.files.sort()).toEqual(["docs/LICENSE", "ffmpeg.exe"]);
    const manifestFiles = [
      { name: "ffmpeg.exe", sha256: sha256Hex(exe), size: exe.length },
      { name: "docs/LICENSE", sha256: sha256Hex(lic), size: lic.length },
    ];
    await expect(verifyExtractedFiles(dest, manifestFiles)).resolves.toBeUndefined();
    await fs.writeFile(path.join(dest, "ffmpeg.exe"), "tampered");
    await expect(verifyExtractedFiles(dest, manifestFiles)).rejects.toThrow();
  });
  it("rejects zip-slip entries via the extraction guard", async () => {
    const dest = path.join(await makeTempDir("suyan-slip-"), "out");
    const evilLoader: ZipArchiveLoader = async () => ({
      files: { evil: { name: "../escape.txt", dir: false, async: async () => Buffer.from("x") } },
    });
    await expect(
      safeExtractZip(Buffer.from("zip"), dest, DEFAULT_COMPONENT_LIMITS, evilLoader),
    ).rejects.toThrow();
  });

  it("enforces maxEntries and total uncompressed caps", async () => {
    const dest = path.join(await makeTempDir("suyan-bomb-"), "out");
    const twoEntries: ZipArchiveLoader = async () => ({
      files: {
        a: { name: "a.bin", dir: false, async: async () => Buffer.alloc(10) },
        b: { name: "b.bin", dir: false, async: async () => Buffer.alloc(10) },
      },
    });
    await expect(
      safeExtractZip(Buffer.from("z"), dest, { ...DEFAULT_COMPONENT_LIMITS, maxEntries: 1 }, twoEntries),
    ).rejects.toThrow();
    await expect(
      safeExtractZip(
        Buffer.from("z"),
        dest,
        { ...DEFAULT_COMPONENT_LIMITS, maxTotalUncompressedBytes: 15 },
        twoEntries,
      ),
    ).rejects.toThrow();
  });
});
describe("componentSecurity install state and self-check", () => {
  it("round-trips current.json and promotes a staged version", async () => {
    const base = await makeTempDir("suyan-state-");
    expect(await readCurrentComponent(base, "ffmpeg")).toBeNull();
    const current = { version: "7.1.1-suyan.1", platform: "win32-x64", installedAt: new Date().toISOString() };
    await writeCurrentComponent(base, "ffmpeg", current);
    const loaded = await readCurrentComponent(base, "ffmpeg");
    expect(loaded?.version).toBe("7.1.1-suyan.1");
    expect(loaded?.platform).toBe("win32-x64");
    const staging = path.join(base, "ffmpeg", ".staging");
    await fs.mkdir(staging, { recursive: true });
    await fs.writeFile(path.join(staging, "ffmpeg.exe"), "BIN");
    const finalDir = getComponentPlatformDir(base, "ffmpeg", current.version, "win32-x64");
    await promoteComponentDir(staging, finalDir);
    expect(await fs.readFile(path.join(finalDir, "ffmpeg.exe"), "utf8")).toBe("BIN");
  });

  it("passes self-check only on a successful ffmpeg -version", async () => {
    const ok: CommandRunner = async () => ({ stdout: "ffmpeg version 7.1.1", stderr: "", code: 0 });
    const badExit: CommandRunner = async () => ({ stdout: "ffmpeg version 7.1.1", stderr: "", code: 1 });
    const wrongOutput: CommandRunner = async () => ({ stdout: "some other tool", stderr: "", code: 0 });
    expect(await selfCheckFfmpeg("ffmpeg", ok)).toBe(true);
    expect(await selfCheckFfmpeg("ffmpeg", badExit)).toBe(false);
    expect(await selfCheckFfmpeg("ffmpeg", wrongOutput)).toBe(false);
  });
});
