import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../..");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

describe("IPC library lookup performance contract", () => {
  it("uses the library image filename index for thumbnail source resolution", () => {
    const source = readSource("electron/main/ipc/registerIpcHandlers.ts");
    const functionBody = source.slice(source.indexOf("async function resolveImageThumbnailSource"));

    expect(functionBody).toContain("findLibraryItemByImageFileName(imageFileName)");
    expect(functionBody).not.toContain("library.items.find((candidate) => candidate.imageFileName === imageFileName)");
  });

  it("uses the same index before hydrating pending remote materials", () => {
    const source = readSource("electron/main/ipc/registerIpcHandlers.ts");
    const functionBody = source.slice(source.indexOf("async function hydrateRemoteMaterialByImageFileName"));

    expect(functionBody).toContain("findLibraryItemByImageFileName(imageFileName)");
    expect(functionBody).toContain('item.remoteImageStatus !== "pending"');
  });
});


describe("media path lookup performance contract", () => {
  it("uses the image filename index before resolving managed or external media paths", () => {
    const source = readSource("electron/main/library/imageFiles.ts");
    const functionBody = source.slice(source.indexOf("async function resolveMediaPathByImageFileName"));

    expect(functionBody).toContain("findLibraryItemByImageFileName(imageFileName)");
    expect(functionBody).not.toContain("library.items.find((candidate) => candidate.imageFileName === imageFileName)");
  });
});


describe("library root lookup performance contract", () => {
  it("resolves external media roots through the cached root index", () => {
    const source = readSource("electron/main/library/mediaPathResolver.ts");

    expect(source).toContain("findLibraryRootById(storage.rootId)");
    expect(source).not.toContain("(await readLibraryRoots()).find");
  });

  it("keeps status refresh separate from path lookup", () => {
    const source = readSource("electron/main/library/libraryRoots.ts");

    expect(source).toContain("refreshStatus?: boolean");
    expect(source).toContain("findLibraryRootById");
    expect(source).toContain("invalidateRootsCache()");
  });
});

describe("library item lookup performance contract", () => {
  it("uses the cached id index for item-scoped media operations", () => {
    const source = readSource("electron/main/library/imageFiles.ts");

    expect(source).toContain("findLibraryItemById(itemId)");
    expect(source).not.toContain("library.items.find((item) => item.id === itemId)");
  });
});
