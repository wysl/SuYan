import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelVideoViaRust,
  compressVideoViaRust,
  isRustVideoCompressEnabled,
} from "../../electron/main/runtime/rustFileOps";
import { rustCoreRuntime } from "../../electron/main/runtime/rustCoreRuntime";

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

const ffmpegPath = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("ffmpeg-static") as { default?: string } | string;
    return typeof mod === "string" ? mod : mod.default ?? null;
  } catch {
    return null;
  }
})();
const ffmpegAvailable = typeof ffmpegPath === "string" && fs.existsSync(ffmpegPath);

const temporaryDirectories: string[] = [];

afterEach(async () => {
  delete process.env.SUYAN_USE_RUST_VIDEO_COMPRESS;
  await rustCoreRuntime.stop().catch(() => undefined);
  vi.restoreAllMocks();
  runtime.userDataPath = "";
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.promises.rm(directory, { recursive: true, force: true })),
  );
});

function makeTestVideo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "suyan-video-fixture-"));
  temporaryDirectories.push(dir);
  const inputPath = path.join(dir, "input.mp4");
  const result = spawnSync(ffmpegPath as string, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=duration=2:size=320x240:rate=30",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    inputPath,
  ]);
  if (result.status !== 0) {
    throw new Error(`无法生成测试视频: ${result.stderr?.toString()}`);
  }
  return inputPath;
}

describe("Rust video compressFile contract", () => {
  it("isRustVideoCompressEnabled respects the feature flag", () => {
    expect(isRustVideoCompressEnabled()).toBe(false);
    process.env.SUYAN_USE_RUST_VIDEO_COMPRESS = "1";
    expect(isRustVideoCompressEnabled()).toBe(true);
  });

  it("compressVideoViaRust returns null when the feature flag is off", async () => {
    const result = await compressVideoViaRust({
      ffmpegPath: ffmpegPath as string,
      args: [],
      timeoutMs: 5000,
      duration: 0,
    });
    expect(result).toBeNull();
  });

  it("runs ffmpeg via Rust and reports exit code 0 with progress events", async () => {
    if (!rustCoreAvailable || !ffmpegAvailable) {
      return;
    }
    const inputPath = makeTestVideo();
    const outputPath = path.join(path.dirname(inputPath), "out.mp4");

    process.env.SUYAN_USE_RUST_VIDEO_COMPRESS = "1";

    const fractions: number[] = [];
    const result = await compressVideoViaRust({
      ffmpegPath: ffmpegPath as string,
      args: ["-i", inputPath, "-c:v", "libx264", "-preset", "ultrafast", "-y", outputPath],
      timeoutMs: 30_000,
      duration: 2,
      onProgress: (fraction) => fractions.push(fraction),
    });

    expect(result).not.toBeNull();
    expect(result?.code).toBe(0);
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.statSync(outputPath).size).toBeGreaterThan(0);
    expect(fractions.length).toBeGreaterThan(0);
    expect(fractions[0]).toBeGreaterThan(0);
    expect(fractions[fractions.length - 1]).toBeLessThanOrEqual(1);
  }, 60_000);

  it("returns nonzero code when ffmpeg fails", async () => {
    if (!rustCoreAvailable || !ffmpegAvailable) {
      return;
    }
    const inputPath = makeTestVideo();
    const outputPath = path.join(path.dirname(inputPath), "out.mp4");

    process.env.SUYAN_USE_RUST_VIDEO_COMPRESS = "1";

    const result = await compressVideoViaRust({
      ffmpegPath: ffmpegPath as string,
      // 非法参数：不存在的输入文件。
      args: ["-i", path.join(path.dirname(inputPath), "missing.mp4"), "-y", outputPath],
      timeoutMs: 15_000,
      duration: 0,
    });

    expect(result).not.toBeNull();
    expect(result!.code).not.toBe(0);
  }, 60_000);

  it("cancelVideoViaRust returns false when the feature flag is off", async () => {
    expect(await cancelVideoViaRust()).toBe(false);
  });
});