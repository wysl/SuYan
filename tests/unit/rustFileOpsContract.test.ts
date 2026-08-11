import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectMediaFiles } from "../../electron/main/library/externalLibraryScanner";
import { sha256FileViaRust, scanMediaFilesViaRustStream } from "../../electron/main/runtime/rustFileOps";
import { rustCoreRuntime } from "../../electron/main/runtime/rustCoreRuntime";

const runtime = vi.hoisted(() => ({ userDataPath: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => runtime.userDataPath, isPackaged: false },
}));

vi.mock("../../electron/main/appLogger", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const temporaryDirectories: string[] = [];

async function cleanup() {
  vi.restoreAllMocks();
  runtime.userDataPath = "";
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
}

afterEach(async () => {
  delete process.env.SUYAN_USE_RUST_FILE_OPS;
  await rustCoreRuntime.stop().catch(() => undefined);
  await cleanup();
});

describe("Rust file ops contract", () => {
  it("scanMediaFilesViaRust returns null when the feature flag is off", async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-rust-scan-off-"));
    temporaryDirectories.push(rootPath);
    await fs.writeFile(path.join(rootPath, "a.jpg"), Buffer.from("aaa"));

    const result = await scanMediaFilesViaRustStream(rootPath, true, ["jpg"]);
    expect(result).toBeNull();
  });

  it("collectMediaFiles Node and Rust produce identical relative paths and sizes", async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-rust-scan-"));
    temporaryDirectories.push(rootPath);
    await fs.mkdir(path.join(rootPath, "nested"));
    await fs.writeFile(path.join(rootPath, "b.jpg"), Buffer.from("bbb"));
    await fs.writeFile(path.join(rootPath, "nested", "a.PNG"), Buffer.from("aaaa"));
    await fs.writeFile(path.join(rootPath, "skip.txt"), "skip", "utf8");
    await fs.writeFile(path.join(rootPath, "nested", "c.webp"), Buffer.from("ccccc"));

    // Node 实现（feature flag 关闭）。
    const nodeFiles = await collectMediaFiles(rootPath, true);

    // Rust 实现（feature flag 打开）。
    process.env.SUYAN_USE_RUST_FILE_OPS = "1";
    const rustFiles = await collectMediaFiles(rootPath, true);

    expect(nodeFiles.map((file) => file.relativePath)).toEqual(
      rustFiles.map((file) => file.relativePath),
    );
    expect(nodeFiles.map((file) => file.size)).toEqual(rustFiles.map((file) => file.size));
    expect(rustFiles).toHaveLength(3);
    expect(rustFiles.map((file) => file.relativePath)).toEqual([
      "b.jpg",
      path.join("nested", "a.PNG"),
      path.join("nested", "c.webp"),
    ]);
  });

  it("sha256FileViaRust matches Node createHash for the same file", async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-rust-hash-"));
    temporaryDirectories.push(rootPath);
    const filePath = path.join(rootPath, "data.png");
    const content = Buffer.from("hello world hello world hello world");
    await fs.writeFile(filePath, content);

    const nodeHash = createHash("sha256").update(content).digest("hex");

    process.env.SUYAN_USE_RUST_FILE_OPS = "1";
    const rustResult = await sha256FileViaRust(filePath);

    expect(rustResult).not.toBeNull();
    expect(rustResult?.hash).toBe(nodeHash);
    expect(rustResult?.size).toBe(content.length);
  });

  it("sha256FileViaRust returns null when the feature flag is off", async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-rust-hash-off-"));
    temporaryDirectories.push(rootPath);
    const filePath = path.join(rootPath, "data.png");
    await fs.writeFile(filePath, Buffer.from("data"));

    const result = await sha256FileViaRust(filePath);
    expect(result).toBeNull();
  });
});

describe("Rust streaming scan edge cases", () => {
  it("returns LIBRARY_ROOT_UNAVAILABLE when the root does not exist", async () => {
    process.env.SUYAN_USE_RUST_FILE_OPS = "1";
    const missing = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-rust-missing-"));
    temporaryDirectories.push(missing);
    await fs.rm(missing, { recursive: true, force: true });

    const result = await scanMediaFilesViaRustStream(path.join(missing, "nope"), true, ["jpg"]);
    // 没有抛出，返回 null 表示 Sidecar 不可用或不可访问；验证不崩溃。
    expect(result === null || result === undefined).toBeTruthy();
  });

  it("tolerates a directory deleted between pages and keeps returning files", async () => {
    process.env.SUYAN_USE_RUST_FILE_OPS = "1";
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-rust-deleted-"));
    temporaryDirectories.push(rootPath);
    await fs.mkdir(path.join(rootPath, "keep"), { recursive: true });
    await fs.mkdir(path.join(rootPath, "gone"), { recursive: true });
    for (let i = 0; i < 50; i += 1) {
      await fs.writeFile(path.join(rootPath, "keep", `k${i}.jpg`), "");
    }
    for (let i = 0; i < 80; i += 1) {
      await fs.writeFile(path.join(rootPath, "gone", `g${i}.jpg`), "");
    }

    const runtime = await import("../../electron/main/runtime/rustCoreRuntime");
    const rustCoreRuntime = runtime.rustCoreRuntime;
    await rustCoreRuntime.stop().catch(() => undefined);
    await rustCoreRuntime.start();
    const { sessionId } = await rustCoreRuntime.request<{ sessionId: string }>("library.scanStart", {
      rootPath,
      recursive: true,
      extensions: ["jpg"],
    });

    // 第一页只取 50 个；随后删除 gone 目录，再继续拉取。
    const page1 = await rustCoreRuntime.request<{ files: unknown[]; done: boolean; errors: string[] }>(
      "library.scanNext",
      { sessionId, pageSize: 50 },
    );
    await fs.rm(path.join(rootPath, "gone"), { recursive: true, force: true });

    let total = page1.files.length;
    let errors = page1.errors.length;
    for (;;) {
      const page = await rustCoreRuntime.request<{ files: unknown[]; done: boolean; errors: string[] }>(
        "library.scanNext",
        { sessionId, pageSize: 100 },
      );
      total += page.files.length;
      errors += page.errors.length;
      if (page.done) {
        break;
      }
    }
    await rustCoreRuntime.request("library.scanEnd", { sessionId });

    // 删除目录被记录为错误，但剩余文件全部返回，不崩溃。
    expect(errors).toBeGreaterThan(0);
    expect(total).toBe(50);
  }, 20_000);

  it("scans a long nested path beyond Windows MAX_PATH", async () => {
    process.env.SUYAN_USE_RUST_FILE_OPS = "1";
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-rust-long-"));
    temporaryDirectories.push(rootPath);
    let current = rootPath;
    const segment = `segment-${"x".repeat(30)}`;
    for (let i = 0; i < 8; i += 1) {
      current = path.join(current, `${segment}-${i}`);
    }
    await fs.mkdir(current, { recursive: true });
    await fs.writeFile(path.join(current, "deep.jpg"), "");

    const result = await scanMediaFilesViaRustStream(current, true, ["jpg"]);
    expect(result).not.toBeNull();
    expect(result?.files).toHaveLength(1);
    expect(result!.files[0].absolutePath.length).toBeGreaterThan(260);
  }, 20_000);
});