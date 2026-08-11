import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "@/features/library/types/library";
import {
  createEmptyLibrary,
  findExternalLibraryItem,
  findLibraryItemById,
  readLibraryFile,
  writeLibraryFile,
} from "../../electron/main/library/libraryStore";

const runtime = vi.hoisted(() => ({ userDataPath: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => runtime.userDataPath, isPackaged: false },
}));

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  runtime.userDataPath = "";
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("library store cache", () => {
  it("reuses the normalized snapshot and indexes after a write", async () => {
    const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-library-cache-"));
    temporaryDirectories.push(userDataPath);
    runtime.userDataPath = userDataPath;
    await fs.mkdir(path.join(userDataPath, "library"), { recursive: true });
    await fs.writeFile(path.join(userDataPath, "library", ".default-library-seeded"), "seeded", "utf8");

    const item = makeItem();
    const library = createEmptyLibrary();
    library.items = [item];
    await writeLibraryFile(library);

    const readSpy = vi.spyOn(fs, "readFile");
    const first = await readLibraryFile();
    const second = await readLibraryFile();

    expect(readSpy).not.toHaveBeenCalled();
    expect(second).toBe(first);
    expect(await findLibraryItemById(item.id)).toMatchObject({ id: item.id });
    expect(await findExternalLibraryItem("root-1", "nested/photo.jpg")).toMatchObject({ id: item.id });
  });

  it("refreshes the snapshot and indexes immediately after the next write", async () => {
    const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-library-cache-refresh-"));
    temporaryDirectories.push(userDataPath);
    runtime.userDataPath = userDataPath;
    const item = makeItem();
    const library = createEmptyLibrary();
    library.items = [item];
    await writeLibraryFile(library);

    await writeLibraryFile({ ...library, items: [{ ...item, title: "???" }] });

    expect(await findLibraryItemById(item.id)).toMatchObject({ title: "???" });
  });
});

function makeItem(): LibraryItem {
  return {
    id: "item-1",
    title: "????",
    imageFileName: "item-1.jpg",
    mediaStorage: { kind: "external", rootId: "root-1", relativePath: "nested/photo.jpg", size: 10, mtimeMs: 20, status: "available" },
    prompt: "prompt",
    negativePrompt: "",
    category: null,
    tags: [],
    generationMethod: null,
    promptType: "image",
    sourceUrl: null,
    authorName: null,
    authorUrl: null,
    authorAvatarUrl: null,
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
  };
}
