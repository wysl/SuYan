import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { orderLibraryRoots } from "../../electron/main/library/libraryRootOrder";
import { readLibraryRoots, reorderLibraryRoots } from "../../electron/main/library/libraryRoots";
import type { LibraryRoot } from "@/features/library/types/library";

const runtime = vi.hoisted(() => ({ userDataPath: "" }));

vi.mock("electron", () => ({
  app: {
    getPath: () => runtime.userDataPath,
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
}));

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { force: true, recursive: true })));
  runtime.userDataPath = "";
});

const roots: LibraryRoot[] = [
  {
    id: "root-a",
    label: "A",
    absolutePath: "C:/素材/A",
    recursive: true,
    lastScanAt: null,
  },
  {
    id: "root-b",
    label: "B",
    absolutePath: "C:/素材/B",
    recursive: true,
    lastScanAt: null,
  },
  {
    id: "root-c",
    label: "C",
    absolutePath: "C:/素材/C",
    recursive: true,
    lastScanAt: null,
  },
];

describe("orderLibraryRoots", () => {
  it("moves requested roots first and appends omitted roots in their existing order", () => {
    expect(orderLibraryRoots(roots, ["root-c", "root-a"])).toEqual([roots[2], roots[0], roots[1]]);
  });

  it("ignores duplicate and unknown IDs without losing a root", () => {
    expect(orderLibraryRoots(roots, [" root-b ", "root-b", "unknown"])).toEqual([roots[1], roots[0], roots[2]]);
  });
});

describe("library root order persistence", () => {
  it("keeps the reordered sequence when the roots file is read again", async () => {
    const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-library-root-order-"));
    temporaryDirectories.push(dataDirectory);
    runtime.userDataPath = dataDirectory;
    const libraryDirectory = path.join(dataDirectory, "library");
    const rootsPath = path.join(libraryDirectory, "library-roots.json");

    await fs.mkdir(libraryDirectory, { recursive: true });
    await fs.writeFile(
      rootsPath,
      JSON.stringify({ schemaVersion: 1, roots }),
      "utf8",
    );

    await reorderLibraryRoots(["root-c", "root-a", "root-b"]);
    const reopened = await readLibraryRoots({ refreshStatus: false });
    expect(reopened.map((root) => root.id)).toEqual(["root-c", "root-a", "root-b"]);

    const persisted = JSON.parse(await fs.readFile(rootsPath, "utf8")) as { roots: LibraryRoot[] };
    expect(persisted.roots.map((root) => root.id)).toEqual(["root-c", "root-a", "root-b"]);
  });
});
