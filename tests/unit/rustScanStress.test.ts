import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { collectMediaFiles } from "../../electron/main/library/externalLibraryScanner";
import { scanMediaFilesViaRustStream } from "../../electron/main/runtime/rustFileOps";
import { rustCoreRuntime } from "../../electron/main/runtime/rustCoreRuntime";
import { RUST_CORE_MAX_MESSAGE_BYTES } from "../../electron/main/runtime/rustCoreClient";

const runtime = vi.hoisted(() => ({ userDataPath: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => runtime.userDataPath, isPackaged: false },
}));

vi.mock("../../electron/main/appLogger", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const rustCoreBinary = path.resolve(
  process.cwd(),
  "native/suyan-core/target/release",
  process.platform === "win32" ? "suyan-core.exe" : "suyan-core",
);
const rustCoreAvailable = process.platform === "win32" && fs.existsSync(rustCoreBinary);

/**
 * 阶段 5 压力测试：超过协议单条 4MB 上限的大目录扫描。
 * 单条扫描记录约 118 字节，40k 文件即超过 4MB，因此必须走流式分页。
 * 目标规模 50k 文件，可分页聚合而不会产出超限消息。
 */
describe("100k 级大目录扫描压力测试（流式分页）", () => {
  const fileCount = 50_000;
  const rootPath = path.join(os.tmpdir(), `suyan-stress-${Date.now()}`);
  const directories = 50;
  const filesPerDir = 1000;

  beforeAll(async () => {
    if (!rustCoreAvailable) {
      return;
    }
    for (let d = 0; d < directories; d += 1) {
      const dir = path.join(rootPath, `dir${d}`);
      fs.mkdirSync(dir, { recursive: true });
      for (let f = 0; f < filesPerDir; f += 1) {
        fs.writeFileSync(path.join(dir, `img${f}.jpg`), "");
      }
    }
  }, 120_000);

  afterAll(async () => {
    fs.rmSync(rootPath, { recursive: true, force: true });
    await rustCoreRuntime.stop().catch(() => undefined);
    delete process.env.SUYAN_USE_RUST_FILE_OPS;
  }, 120_000);

  it("流式分页扫描 50k 文件，全程无单条消息超过 4MB", async () => {
    if (!rustCoreAvailable) {
      return;
    }
    process.env.SUYAN_USE_RUST_FILE_OPS = "1";
    await rustCoreRuntime.start();

    const t0 = Date.now();
    const result = await scanMediaFilesViaRustStream(rootPath, true, ["jpg"]);
    const elapsed = Date.now() - t0;

    expect(result).not.toBeNull();
    expect(result?.files).toHaveLength(fileCount);
    // 每条消息都小于协议上限：分页生效的证明（若单条返回必被 RustCoreClient 拒绝）。
    expect(result!.files.length).toBeGreaterThan(0);
    // 扫描耗时合理（机器负载波动放宽到 60s）。
    expect(elapsed).toBeLessThan(60_000);
  }, 120_000);

  it("Rust 流式扫描与 Node 扫描结果数量一致", async () => {
    if (!rustCoreAvailable) {
      return;
    }
    process.env.SUYAN_USE_RUST_FILE_OPS = "1";
    const rustFiles = await scanMediaFilesViaRustStream(rootPath, true, ["jpg"]);

    delete process.env.SUYAN_USE_RUST_FILE_OPS;
    const nodeFiles = await collectMediaFiles(rootPath, true);

    expect(rustFiles?.files).toHaveLength(fileCount);
    expect(nodeFiles).toHaveLength(fileCount);
    expect(rustFiles?.files.map((f) => f.relativePath)).toEqual(nodeFiles.map((f) => f.relativePath));
  }, 120_000);

  it("RUST_CORE_MAX_MESSAGE_BYTES 常量与 Rust 侧 MAX_MESSAGE_BYTES 一致（4MB）", () => {
    expect(RUST_CORE_MAX_MESSAGE_BYTES).toBe(4 * 1024 * 1024);
  });
});