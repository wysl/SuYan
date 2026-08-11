import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compressImageViaRust,
  isRustImageCompressEnabled,
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

const fixturePath = path.join(process.cwd(), "tests/fixtures/compress-test.png");

const temporaryDirectories: string[] = [];

afterEach(async () => {
  delete process.env.SUYAN_USE_RUST_IMAGE_COMPRESS;
  await rustCoreRuntime.stop().catch(() => undefined);
  vi.restoreAllMocks();
  runtime.userDataPath = "";
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.promises.rm(directory, { recursive: true, force: true })),
  );
});

describe("Rust image compressFile contract", () => {
  it("isRustImageCompressEnabled respects the feature flag", () => {
    expect(isRustImageCompressEnabled()).toBe(false);
    process.env.SUYAN_USE_RUST_IMAGE_COMPRESS = "1";
    expect(isRustImageCompressEnabled()).toBe(true);
  });

  it("compressImageViaRust returns null when the feature flag is off", async () => {
    const result = await compressImageViaRust({
      sourcePath: fixturePath,
      outputPath: path.join(os.tmpdir(), "nope.webp"),
      ext: ".png",
      quality: 80,
      format: "webp",
    });
    expect(result).toBeNull();
  });

  it("compresses PNG to WebP lossy and produces a smaller output", async () => {
    if (!rustCoreAvailable) {
      return;
    }
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "suyan-rust-image-"));
    temporaryDirectories.push(dir);
    const outputPath = path.join(dir, "out.webp");

    process.env.SUYAN_USE_RUST_IMAGE_COMPRESS = "1";
    const sourceSize = fs.statSync(fixturePath).size;

    const result = await compressImageViaRust({
      sourcePath: fixturePath,
      outputPath,
      ext: ".png",
      quality: 80,
      format: "webp",
    });

    expect(result).not.toBeNull();
    expect(result?.outputBytes).toBeGreaterThan(0);
    expect(result?.outputBytes).toBeLessThan(sourceSize);
    expect(fs.statSync(outputPath).size).toBe(result?.outputBytes);
  }, 30_000);

  it("compresses PNG to PNG best and produces a smaller output", async () => {
    if (!rustCoreAvailable) {
      return;
    }
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "suyan-rust-image-"));
    temporaryDirectories.push(dir);
    const outputPath = path.join(dir, "out.png");

    process.env.SUYAN_USE_RUST_IMAGE_COMPRESS = "1";
    const sourceSize = fs.statSync(fixturePath).size;

    const result = await compressImageViaRust({
      sourcePath: fixturePath,
      outputPath,
      ext: ".png",
      quality: 80,
      format: "keep",
    });

    expect(result).not.toBeNull();
    expect(result?.outputBytes).toBeGreaterThan(0);
    expect(result?.outputBytes).toBeLessThan(sourceSize);
    expect(fs.statSync(outputPath).size).toBe(result?.outputBytes);
  }, 30_000);

  it("preserves dimensions when no maxSide is set", async () => {
    if (!rustCoreAvailable) {
      return;
    }
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "suyan-rust-image-"));
    temporaryDirectories.push(dir);
    const outputPath = path.join(dir, "out.webp");

    process.env.SUYAN_USE_RUST_IMAGE_COMPRESS = "1";

    const result = await compressImageViaRust({
      sourcePath: fixturePath,
      outputPath,
      ext: ".png",
      quality: 80,
      format: "webp",
    });

    expect(result?.width).toBe(800);
    expect(result?.height).toBe(600);
  }, 30_000);
});