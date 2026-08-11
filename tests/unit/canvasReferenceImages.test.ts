import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => process.env.SUYAN_CANVAS_REFERENCE_TEST_DIR ?? "",
  },
  nativeImage: {
    createFromBuffer: (bytes: Buffer) => {
      const valid = bytes.toString("utf8") !== "invalid";
      return {
        getSize: () => ({ height: 480, width: 640 }),
        isEmpty: () => !valid,
        toPNG: () => Buffer.from("normalized-png"),
      };
    },
  },
}));

vi.mock("../../electron/main/appLogger", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe("canvas reference image persistence", () => {
  let testDir = "";

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-canvas-reference-"));
    process.env.SUYAN_CANVAS_REFERENCE_TEST_DIR = testDir;
  });

  afterEach(async () => {
    delete process.env.SUYAN_CANVAS_REFERENCE_TEST_DIR;
    await fs.rm(testDir, { force: true, recursive: true });
  });

  it("normalizes a reference by decoded content and restores it after a reload", async () => {
    const { readCanvasReferenceImage, saveCanvasReferenceImage } = await import(
      "../../electron/main/library/canvasReferenceImages"
    );
    const sourceDataUrl = `data:application/octet-stream;base64,${Buffer.from("source-bytes").toString("base64")}`;

    const saved = await saveCanvasReferenceImage(sourceDataUrl, "mismatched.jpg");
    const restored = await readCanvasReferenceImage(saved.fileName);

    expect(saved).toMatchObject({
      fileName: expect.stringMatching(/^canvas-reference-.+\.png$/),
      height: 480,
      title: "mismatched",
      width: 640,
    });
    expect(restored.dataUrl).toBe(
      `data:image/png;base64,${Buffer.from("normalized-png").toString("base64")}`,
    );
    await expect(
      fs.stat(path.join(testDir, "library", "canvas-references", saved.fileName)),
    ).resolves.toMatchObject({ size: Buffer.byteLength("normalized-png") });
  });

  it("removes only managed canvas references", async () => {
    const { removeCanvasReferenceImage, saveCanvasReferenceImage } = await import(
      "../../electron/main/library/canvasReferenceImages"
    );
    const dataUrl = `data:image/png;base64,${Buffer.from("source-bytes").toString("base64")}`;
    const saved = await saveCanvasReferenceImage(dataUrl, "source.png");

    await expect(removeCanvasReferenceImage("library-original.png")).resolves.toEqual({ removed: false });
    await expect(removeCanvasReferenceImage(saved.fileName)).resolves.toEqual({ removed: true });
  });

  it("rejects image bytes that cannot be decoded", async () => {
    const { saveCanvasReferenceImage } = await import(
      "../../electron/main/library/canvasReferenceImages"
    );
    const dataUrl = `data:image/png;base64,${Buffer.from("invalid").toString("base64")}`;

    await expect(saveCanvasReferenceImage(dataUrl, "bad.png")).rejects.toThrow("无法解码");
  });
});
