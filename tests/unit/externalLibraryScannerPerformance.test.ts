import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryRoot } from "@/features/library/types/library";
import { collectMediaFiles, createExternalLibraryItem } from "../../electron/main/library/externalLibraryScanner";

const runtime = vi.hoisted(() => ({ userDataPath: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => runtime.userDataPath, isPackaged: false },
}));

vi.mock("../../electron/main/appLogger", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  runtime.userDataPath = "";
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("external library scan optimization", () => {
  it("collects sorted files with size and mtime in one scan result", async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-scan-files-"));
    temporaryDirectories.push(rootPath);
    await fs.mkdir(path.join(rootPath, "nested"));
    await fs.writeFile(path.join(rootPath, "b.jpg"), Buffer.from("bbb"));
    await fs.writeFile(path.join(rootPath, "nested", "a.png"), Buffer.from("aaaa"));
    await fs.writeFile(path.join(rootPath, "skip.txt"), "skip", "utf8");

    const files = await collectMediaFiles(rootPath, true);

    expect(files.map((file) => file.relativePath)).toEqual(["b.jpg", path.join("nested", "a.png")]);
    expect(files.map((file) => file.size)).toEqual([3, 4]);
    expect(files.every((file) => Number.isFinite(file.mtimeMs))).toBe(true);
  });



  it("uses bounded concurrent directory workers for recursive scans", async () => {
    const source = await fs.readFile(
      path.join(process.cwd(), "electron/main/library/externalLibraryScanner.ts"),
      "utf8",
    );

    expect(source).toContain("const directoryConcurrency = recursive ? 8 : 1");
    expect(source).toContain("mapWithConcurrency(currentDirectories, directoryConcurrency");
    expect(source).toContain("const childDirectories: string[] = []");
  });

  it("reuses scan stats when creating an external item", async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-scan-item-"));
    temporaryDirectories.push(rootPath);
    const sourcePath = path.join(rootPath, "photo.jpg");
    await fs.writeFile(sourcePath, Buffer.from("photo"));
    const root: LibraryRoot = {
      id: "root-1",
      label: "External",
      absolutePath: rootPath,
      recursive: true,
      watchEnabled: false,
      lastScanAt: null,
    };
    const statSpy = vi.spyOn(fs, "stat");

    const item = await createExternalLibraryItem(root, sourcePath, "2026-07-29T00:00:00.000Z", {
      size: 123,
      mtimeMs: 456,
    });

    expect(statSpy).not.toHaveBeenCalled();
    expect(item.mediaStorage).toMatchObject({ rootId: "root-1", relativePath: "photo.jpg", size: 123, mtimeMs: 456 });
  });
});
