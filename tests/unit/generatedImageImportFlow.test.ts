import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../..");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

describe("generated image library import flow", () => {
  it("uses a dedicated IPC instead of renderer data-url fetch and metadata patching", () => {
    const canvasSource = readSource("src/features/library/components/CanvasView.tsx");
    const storeSource = readSource("src/features/library/store/useLibraryStore.ts");
    const ipcSource = readSource("electron/main/ipc/registerIpcHandlers.ts");

    expect(canvasSource).toContain("onImportGeneratedImages(data.images");
    expect(canvasSource).not.toContain("fetch(image.dataUrl)");
    expect(storeSource).toContain("window.suyanApi.importGeneratedImages({ images, metadata })");
    expect(storeSource.slice(storeSource.indexOf("importGeneratedImages: async"), storeSource.indexOf("importImageFilesForItem:"))).not.toContain("saveItemsBatch");
    expect(ipcSource).toContain('handleResult("image:import-generated"');
  });

  it("creates generated items with complete prompt metadata before one library append", () => {
    const source = readSource("electron/main/library/imageFiles.ts");
    const body = source.slice(source.indexOf("export async function importGeneratedImages"), source.indexOf("export async function importImageFilePaths"));

    expect(body).toContain("decodeGeneratedImageDataUrl(image.dataUrl)");
    expect(body).toContain("buildImportedMediaItem(draft, id, imageFileName, createdAt)");
    expect(body).toContain("const library = await appendLibraryItems(items)");
    expect(body).toContain('promptType: "image"');
    expect(body).toContain('"library-import-success"');
    expect(body).toContain('"library-import-failed"');
  });
});
