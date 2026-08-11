import { dialog } from "electron";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type JSZip from "jszip";
import type { LibraryFile, LibraryItem } from "../../../src/features/library/types/library";
import { isVideoMediaFile } from "../../../src/features/library/utils/mediaFileTypes";
import { normalizeNsfwRating } from "../../../src/features/library/utils/nsfwRating";
import { normalizePromptType } from "../../../src/features/library/utils/promptType";
import { AppError } from "../ipc/errors";
import { createZipViaRust } from "../runtime/rustFileOps";
import { prepareImageThumbnails } from "./imageThumbnails";
import { writeImportMediaBuffer } from "./importedImageWriter";
import { appendLibraryItems, readLibraryFile } from "./libraryStore";
import { resolveMediaAbsolutePath } from "./mediaPathResolver";
import { collectArchiveExportEntries, toPortableArchiveItem } from "./archiveExportPolicy";

type JSZipConstructor = {
  new (): JSZip;
  loadAsync(data: Buffer): Promise<JSZip>;
};

const JSZipRuntime = loadJSZipConstructor();

type ArchiveResult = {
  canceled: boolean;
  filePath: string | null;
  exportedCount: number;
};

export async function exportLibraryZip(itemIds: string[]): Promise<ArchiveResult> {
  const library = await readLibraryFile();
  const selectedIds = new Set(itemIds);
  const items = itemIds.length > 0 ? library.items.filter((item) => selectedIds.has(item.id)) : library.items;
  const defaultFileName = buildSharePackageFileName(items);
  const result = await dialog.showSaveDialog({
    title: "导出分享包",
    defaultPath: defaultFileName,
    filters: [{ name: "ZIP 分享包", extensions: ["zip"] }],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true, filePath: null, exportedCount: 0 };
  }

  const exportFile: LibraryFile = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    items: items.map(toPortableArchiveItem),
  };
  const dataJson = JSON.stringify(exportFile, null, 2);

  // Rust 实现启用时优先流式打包，避免整包读入内存；失败回退 JSZip。
  const rustExported = await exportViaRust(result.filePath, dataJson, items);
  if (rustExported) {
    return { canceled: false, filePath: result.filePath, exportedCount: items.length };
  }

  const zip = new JSZipRuntime();
  zip.file("data.json", dataJson);

  for (const { item, imageBuffer } of await collectArchiveExportEntries(items, resolveMediaAbsolutePath, fs.readFile)) {
    zip.file(`images/${item.imageFileName}`, imageBuffer);
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await fs.writeFile(result.filePath, buffer);

  return { canceled: false, filePath: result.filePath, exportedCount: items.length };
}

export async function importLibraryZip(): Promise<{
  canceled: boolean;
  library: LibraryFile;
  importedCount: number;
}> {
  const result = await dialog.showOpenDialog({
    title: "导入分享包",
    properties: ["openFile"],
    filters: [{ name: "ZIP 分享包", extensions: ["zip"] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, library: await readLibraryFile(), importedCount: 0 };
  }

  const buffer = await fs.readFile(result.filePaths[0]);
  const zip = await JSZipRuntime.loadAsync(buffer);
  const dataFile = zip.file("data.json");

  if (!dataFile) {
    throw new AppError("ZIP_DATA_MISSING", "分享包缺少 data.json。");
  }

  const parsed = JSON.parse(await dataFile.async("string")) as unknown;

  if (!isArchiveLibrary(parsed)) {
    throw new AppError("ZIP_SCHEMA_INVALID", "分享包数据结构不合法。");
  }

  const importedItems: LibraryItem[] = [];

  for (const item of parsed.items) {
    const sourceImage = zip.file(`images/${item.imageFileName}`);

    if (!sourceImage) {
      throw new AppError("ZIP_IMAGE_MISSING", `分享包缺少素材 ${item.imageFileName}。`);
    }

    const nextId = randomUUID();
    const extension = path.extname(item.imageFileName) || ".png";
    const imageBuffer = await sourceImage.async("nodebuffer");
    const imageFileName = await writeImportMediaBuffer(nextId, imageBuffer, extension);
    const now = new Date().toISOString();

    importedItems.push({
      ...item,
      id: nextId,
      imageFileName,
      mediaStorage: "managed",
      promptType: normalizePromptType(item.promptType, { ...item, imageFileName }),
      nsfwRating: normalizeNsfwRating(item.nsfwRating),
      nsfwCheckedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  await prepareImageThumbnails(importedItems.map((item) => item.imageFileName).filter((imageFileName) => !isVideoMediaFile(imageFileName)));
  const library = await appendLibraryItems(importedItems);

  return { canceled: false, library, importedCount: importedItems.length };
}

/** 优先用 Rust 流式导出 ZIP；返回 false 表示未启用或失败，调用方回退 JSZip。 */
async function exportViaRust(
  outputPath: string,
  dataJson: string,
  items: LibraryItem[],
): Promise<boolean> {
  const dataFilePath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "suyan-archive-")), "data.json");
  const tempDir = path.dirname(dataFilePath);

  try {
    await fs.writeFile(dataFilePath, dataJson, "utf8");

    const entries: Array<{ zipPath: string; sourcePath: string }> = [
      { zipPath: "data.json", sourcePath: dataFilePath },
    ];
    for (const item of items) {
      const sourcePath = await resolveMediaAbsolutePath(item);
      entries.push({
        zipPath: `images/${item.imageFileName}`,
        sourcePath,
      });
    }

    const result = await createZipViaRust(outputPath, entries);
    return result !== null;
  } catch {
    // 源文件缺失或 Sidecar 不可用，回退 JSZip（其内部会抛出 ZIP_MEDIA_MISSING）。
    return false;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function isArchiveLibrary(input: unknown): input is LibraryFile {
  if (!isRecord(input)) {
    return false;
  }

  return input.schemaVersion === 1 && Array.isArray(input.items) && input.items.every(isArchiveItem);
}

function isArchiveItem(input: unknown): input is LibraryItem {
  if (!isRecord(input)) {
    return false;
  }

  return (
    typeof input.id === "string" &&
    typeof input.title === "string" &&
    typeof input.imageFileName === "string" &&
    typeof input.prompt === "string" &&
    typeof input.negativePrompt === "string" &&
    Array.isArray(input.tags) &&
    input.tags.every((tag) => typeof tag === "string") &&
    isOptionalString(input.category) &&
    isOptionalString(input.generationMethod) &&
    isOptionalPromptType(input.promptType) &&
    isOptionalString(input.sourceUrl) &&
    isOptionalString(input.authorName) &&
    isOptionalString(input.authorUrl) &&
    isOptionalString(input.authorAvatarUrl) &&
    isOptionalNsfwRating(input.nsfwRating) &&
    isOptionalString(input.nsfwCheckedAt) &&
    typeof input.createdAt === "string" &&
    typeof input.updatedAt === "string"
  );
}

function isOptionalNsfwRating(input: unknown): boolean {
  return input === undefined || input === "unknown" || input === "safe" || input === "nsfw";
}

function buildSharePackageFileName(items: LibraryItem[]): string {
  const dateStamp = new Date().toISOString().slice(0, 10);
  const primaryTitle = items[0]?.title?.trim() || "未命名提示词";
  const safeTitle = primaryTitle
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/[\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  const countSuffix = items.length > 1 ? `-${items.length}图` : "";
  const baseName = safeTitle || "未命名提示词";

  return `素言-${baseName}${countSuffix}-${dateStamp}.zip`;
}

function isOptionalString(input: unknown): boolean {
  return input === undefined || input === null || typeof input === "string";
}

function isOptionalPromptType(input: unknown): boolean {
  return input === undefined || typeof input === "string";
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

function loadJSZipConstructor(): JSZipConstructor {
  const runtimeRequire = createRequire(__filename);

  try {
    return normalizeJSZipModule(runtimeRequire("jszip"));
  } catch {
    const vendorRequire = createRequire(path.join(process.resourcesPath, "vendor", "package.cjs"));
    return normalizeJSZipModule(vendorRequire("jszip"));
  }
}

function normalizeJSZipModule(input: unknown): JSZipConstructor {
  const candidate = (input as { default?: JSZipConstructor }).default ?? input;
  return candidate as JSZipConstructor;
}
