import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "@/features/library/types/library";
import {
  createEmptyLibrary,
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
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe("library store backup recovery", () => {
  it("creates .bak after the second write and keeps the previous snapshot", async () => {
    const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-library-bak-"));
    temporaryDirectories.push(userDataPath);
    runtime.userDataPath = userDataPath;
    await fs.mkdir(path.join(userDataPath, "library"), { recursive: true });
    await fs.writeFile(path.join(userDataPath, "library", ".default-library-seeded"), "seeded", "utf8");

    const first = makeItem("item-1", "first");
    const second = makeItem("item-2", "second");
    const libraryPath = path.join(userDataPath, "library", "library.json");

    await writeLibraryFile({ ...createEmptyLibrary(), items: [first] });
    await writeLibraryFile({ ...createEmptyLibrary(), items: [second] });

    const primary = JSON.parse(await fs.readFile(libraryPath, "utf8")) as { items: Array<{ id: string }> };
    const backup = JSON.parse(await fs.readFile(`${libraryPath}.bak`, "utf8")) as { items: Array<{ id: string }> };

    expect(primary.items.map((item) => item.id)).toEqual(["item-2"]);
    expect(backup.items.map((item) => item.id)).toEqual(["item-1"]);
  });

  it("recovers from .bak when library.json is corrupt", async () => {
    const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-library-recover-"));
    temporaryDirectories.push(userDataPath);
    runtime.userDataPath = userDataPath;
    const libraryDir = path.join(userDataPath, "library");
    await fs.mkdir(libraryDir, { recursive: true });
    await fs.writeFile(path.join(libraryDir, ".default-library-seeded"), "seeded", "utf8");

    const libraryPath = path.join(libraryDir, "library.json");
    const goodSnapshot = JSON.stringify({
      schemaVersion: 2,
      updatedAt: "2026-01-01T00:00:00.000Z",
      items: [makeItem("item-recover", "recover-me")],
      categoryTaxonomy: null,
    });

    // Simulate a crash that left the primary file corrupt while .bak holds the last good write.
    await fs.writeFile(`${libraryPath}.bak`, goodSnapshot, "utf8");
    await fs.writeFile(libraryPath, "{not-json", "utf8");

    const restored = await readLibraryFile();

    expect(restored.items.map((entry) => entry.id)).toEqual(["item-recover"]);

    const repaired = JSON.parse(await fs.readFile(libraryPath, "utf8")) as { items: Array<{ id: string }> };
    expect(repaired.items.map((entry) => entry.id)).toEqual(["item-recover"]);
  });
});

function makeItem(id: string, title: string): LibraryItem {
  return {
    id,
    title,
    imageFileName: `${id}.jpg`,
    mediaStorage: "managed",
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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
