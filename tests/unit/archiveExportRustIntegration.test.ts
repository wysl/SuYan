import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "@/features/library/types/library";
import { exportLibraryZip } from "../../electron/main/library/archiveStore";
import { rustCoreRuntime } from "../../electron/main/runtime/rustCoreRuntime";

const runtime = vi.hoisted(() => ({ userDataPath: "", savePath: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => runtime.userDataPath, isPackaged: false },
  dialog: {
    showSaveDialog: async () =>
      runtime.savePath ? ({ canceled: false, filePath: runtime.savePath }) : ({ canceled: true, filePath: null }),
  },
}));

vi.mock("../../electron/main/appLogger", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("../../electron/main/library/libraryStore", () => {
  const { readFileSync } = require("node:fs");
  const path = require("node:path");
  return {
    readLibraryFile: async () => JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/library-export-fixture.json"), "utf8")),
    appendLibraryItems: async (items: unknown[]) => ({ items }),
  };
});

vi.mock("../../electron/main/library/mediaPathResolver", () => ({
  resolveMediaAbsolutePath: async (item: { imageFileName: string }) =>
    path.join(process.cwd(), "tests/fixtures/export-images", item.imageFileName),
}));

const temporaryDirectories: string[] = [];

afterEach(async () => {
  delete process.env.SUYAN_USE_RUST_ARCHIVE;
  await rustCoreRuntime.stop().catch(() => undefined);
  vi.restoreAllMocks();
  runtime.userDataPath = "";
  runtime.savePath = "";
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe("exportLibraryZip Rust integration", () => {
  it("exports via Rust when the feature flag is on", async () => {
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-export-integration-"));
    temporaryDirectories.push(outDir);
    const zipPath = path.join(outDir, "out.zip");
    runtime.savePath = zipPath;

    process.env.SUYAN_USE_RUST_ARCHIVE = "1";

    const result = await exportLibraryZip([]);

    expect(result.canceled).toBe(false);
    expect(result.exportedCount).toBeGreaterThan(0);
    expect(fs.stat(zipPath)).resolves.toBeTruthy();

    // 解包确认内容完整。
    const { execFileSync } = await import("node:child_process");
    const destDir = path.join(outDir, "unzipped");
    execFileSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`,
    ]);

    const dataJson = JSON.parse(await fs.readFile(path.join(destDir, "data.json"), "utf8"));
    expect(dataJson.schemaVersion).toBe(1);
    expect(Array.isArray(dataJson.items)).toBe(true);
    expect(dataJson.items.length).toBe(result.exportedCount);

    const imageFiles = await fs.readdir(path.join(destDir, "images"));
    expect(imageFiles.length).toBe(result.exportedCount);
  }, 30_000);
});