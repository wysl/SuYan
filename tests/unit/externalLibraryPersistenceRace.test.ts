import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryFile, LibraryItem, LibraryRoot } from "@/features/library/types/library";
import { saveLibraryFileFromRenderer } from "../../electron/main/library/libraryStore";
import { syncExternalLibraryRoot } from "../../electron/main/library/externalLibrarySync";

const runtime = vi.hoisted(() => ({ userDataPath: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => runtime.userDataPath, isPackaged: false },
}));

vi.mock("../../electron/main/appLogger", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("../../electron/main/library/imageThumbnails", () => ({
  warmLibraryItemThumbnails: vi.fn(),
}));

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
  runtime.userDataPath = "";
});

describe("external library persistence serialization", () => {
  it("retains a user metadata edit made while watcher reconciliation is blocked", async () => {
    const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-race-user-data-"));
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-race-root-"));
    temporaryDirectories.push(userDataPath, rootPath);
    runtime.userDataPath = userDataPath;

    const libraryDirectory = path.join(userDataPath, "library");
    await fs.mkdir(path.join(libraryDirectory, "images"), { recursive: true });
    await fs.writeFile(path.join(libraryDirectory, ".default-library-seeded"), "seeded", "utf8");
    const existing = makeManagedItem("existing", "Original title");
    await fs.writeFile(
      path.join(libraryDirectory, "library.json"),
      JSON.stringify(makeLibrary(existing)),
      "utf8",
    );

    const addedPath = path.join(rootPath, "watcher-added.jpg");
    await fs.writeFile(addedPath, Buffer.from("watcher-owned-source"));
    const root: LibraryRoot = {
      id: "root-1",
      label: "External",
      absolutePath: rootPath,
      recursive: true,
      watchEnabled: true,
      lastScanAt: null,
    };

    let releaseLstat: (() => void) | undefined;
    const lstatGate = new Promise<void>((resolve) => {
      releaseLstat = resolve;
    });
    let notifyBlocked: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      notifyBlocked = resolve;
    });
    const originalLstat = fs.lstat.bind(fs);
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (path.resolve(String(target)) === path.resolve(addedPath)) {
        notifyBlocked?.();
        await lstatGate;
      }
      return originalLstat(target, options as never);
    });

    const watcherSave = syncExternalLibraryRoot(root, {
      addedOrChangedPaths: [addedPath],
      removedPaths: [],
    });
    await blocked;

    const rendererSnapshot = makeLibrary({ ...existing, title: "User edit", updatedAt: new Date().toISOString() });
    rendererSnapshot.items[0] = {
      ...rendererSnapshot.items[0],
      category: "肖像摄影",
      categoryId: "system:人像摄影:肖像摄影",
      genreIds: ["system:人像摄影:肖像摄影", "system:人像摄影:婚礼摄影"],
    };
    const userSave = saveLibraryFileFromRenderer(rendererSnapshot);
    releaseLstat?.();

    await watcherSave;
    const saved = await userSave;

    expect(saved.items).toHaveLength(2);
    expect(saved.items.find((item) => item.id === existing.id)?.title).toBe("User edit");
    expect(saved.items.find((item) => item.id === existing.id)?.genreIds).toEqual([
      "system:人像摄影:肖像摄影",
      "system:人像摄影:婚礼摄影",
    ]);
    expect(saved.items.some((item) => item.mediaStorage !== "managed" && item.mediaStorage?.relativePath === "watcher-added.jpg"))
      .toBe(true);
  });
});

function makeLibrary(...items: LibraryItem[]): LibraryFile {
  return { schemaVersion: 1, updatedAt: "2026-07-25T00:00:00.000Z", items };
}

function makeManagedItem(id: string, title: string): LibraryItem {
  return {
    id,
    title,
    imageFileName: `${id}.jpg`,
    mediaStorage: "managed",
    prompt: "prompt",
    negativePrompt: "",
    category: "??",
    tags: ["tag"],
    generationMethod: null,
    promptType: "image",
    sourceUrl: null,
    authorName: null,
    authorUrl: null,
    authorAvatarUrl: null,
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
  };
}
