import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createZipViaRust, isRustArchiveEnabled } from "../../electron/main/runtime/rustFileOps";
import { rustCoreRuntime } from "../../electron/main/runtime/rustCoreRuntime";

const runtime = vi.hoisted(() => ({ userDataPath: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => runtime.userDataPath, isPackaged: false },
}));

vi.mock("../../electron/main/appLogger", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const temporaryDirectories: string[] = [];

afterEach(async () => {
  delete process.env.SUYAN_USE_RUST_ARCHIVE;
  await rustCoreRuntime.stop().catch(() => undefined);
  vi.restoreAllMocks();
  runtime.userDataPath = "";
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

/** 用 Node 的 zlib 无法读 zip，改用 PowerShell Expand-Archive 解包并比对内容。 */
async function expandZip(zipPath: string, destDir: string): Promise<void> {
  const { execFileSync } = await import("node:child_process");
  execFileSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`,
  ]);
}

describe("Rust archive createZip contract", () => {
  it("isRustArchiveEnabled respects the feature flag", () => {
    expect(isRustArchiveEnabled()).toBe(false);
    process.env.SUYAN_USE_RUST_ARCHIVE = "1";
    expect(isRustArchiveEnabled()).toBe(true);
  });

  it("createZipViaRust returns null when the feature flag is off", async () => {
    const result = await createZipViaRust("C:/nope/out.zip", []);
    expect(result).toBeNull();
  });

  it("creates a ZIP whose extracted contents match the JSZip reference", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-rust-zip-"));
    temporaryDirectories.push(dir);

    const source1 = path.join(dir, "a.jpg");
    const source2 = path.join(dir, "sub", "b.png");
    await fs.mkdir(path.dirname(source2), { recursive: true });
    const content1 = Buffer.from("aaa");
    const content2 = Buffer.from("bbbbb");
    await fs.writeFile(source1, content1);
    await fs.writeFile(source2, content2);

    const outputZip = path.join(dir, "out.zip");
    const uploadZip = path.join(dir, "ref.zip");

    // Rust 实现。
    process.env.SUYAN_USE_RUST_ARCHIVE = "1";
    const rustResult = await createZipViaRust(outputZip, [
      { zipPath: "data.json", sourcePath: source1 },
      { zipPath: "images/a.jpg", sourcePath: source1 },
      { zipPath: "images/sub/b.png", sourcePath: source2 },
    ]);
    expect(rustResult).not.toBeNull();
    expect(rustResult?.entryCount).toBe(3);

    // JSZip 参考实现（与 archiveStore 相同的打包方式）。
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("data.json", content1);
    zip.file("images/a.jpg", content1);
    zip.file("images/sub/b.png", content2);
    await fs.writeFile(uploadZip, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));

    // 解包两个 ZIP 并比对。
    const rustOut = path.join(dir, "rust-out");
    const refOut = path.join(dir, "ref-out");
    await expandZip(outputZip, rustOut);
    await expandZip(uploadZip, refOut);

    const rustData = await fs.readFile(path.join(rustOut, "data.json"));
    const refData = await fs.readFile(path.join(refOut, "data.json"));
    expect(rustData).toEqual(refData);

    const rustImg = await fs.readFile(path.join(rustOut, "images", "a.jpg"));
    const refImg = await fs.readFile(path.join(refOut, "images", "a.jpg"));
    expect(rustImg).toEqual(refImg);
    expect(rustImg).toEqual(content1);

    const rustSub = await fs.readFile(path.join(rustOut, "images", "sub", "b.png"));
    const refSub = await fs.readFile(path.join(refOut, "images", "sub", "b.png"));
    expect(rustSub).toEqual(refSub);
    expect(rustSub).toEqual(content2);
  }, 30_000);
});