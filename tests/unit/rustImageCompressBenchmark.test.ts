import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { compressImageViaRust } from "../../electron/main/runtime/rustFileOps";
import { rustCoreRuntime } from "../../electron/main/runtime/rustCoreRuntime";
import { getSharp } from "../../electron/main/runtime/imageRuntime";

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
const tempDir = path.join(os.tmpdir(), `suyan-image-bench-${Date.now()}`);

beforeAll(() => {
  fs.mkdirSync(tempDir, { recursive: true });
});

afterAll(async () => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  await rustCoreRuntime.stop().catch(() => undefined);
});

describe("Node (sharp) vs Rust image compression performance", () => {
  it("compares WebP encode time on the fixture image", async () => {
    if (!rustCoreAvailable) {
      return;
    }
    // 预热 sidecar。
    process.env.SUYAN_USE_RUST_IMAGE_COMPRESS = "1";
    await rustCoreRuntime.start();

    // Rust 压缩。
    const rustOut = path.join(tempDir, "rust.webp");
    let t0 = Date.now();
    const rustResult = await compressImageViaRust({
      sourcePath: fixturePath,
      outputPath: rustOut,
      ext: ".png",
      quality: 80,
      format: "webp",
    });
    const rustMs = Date.now() - t0;

    // sharp 压缩。
    const source = fs.readFileSync(fixturePath);
    const sharp = getSharp();
    t0 = Date.now();
    const sharpOut = await sharp(source).webp({ quality: 80 }).toBuffer();
    const sharpMs = Date.now() - t0;

    // eslint-disable-next-line no-console
    console.log(
      `Rust WebP: ${rustMs}ms (${rustResult?.outputBytes} bytes), sharp WebP: ${sharpMs}ms (${sharpOut.length} bytes)`,
    );

    // 两者都应产出比原图更小的输出。
    const sourceSize = fs.statSync(fixturePath).size;
    expect(rustResult?.outputBytes).toBeLessThan(sourceSize);
    expect(sharpOut.length).toBeLessThan(sourceSize);
  }, 60_000);
});