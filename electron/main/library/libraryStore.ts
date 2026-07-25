import fs from "node:fs/promises";
import path from "node:path";
import type { LibraryFile, LibraryItem, MediaStorage, VideoKeyframe } from "../../../src/features/library/types/library";
import { normalizeNsfwRating } from "../../../src/features/library/utils/nsfwRating";
import { normalizePromptType } from "../../../src/features/library/utils/promptType";
import { AppError } from "../ipc/errors";
import { getImagesDir, getLibraryDataDir, getLibraryPath } from "./libraryPaths";
import { createDefaultLibrary, createDefaultSeedImage, getDefaultSeedImageFileNames, shouldEnableDefaultLibrarySeed } from "./defaultLibrarySeed";
import { refreshExternalMediaHealth } from "./externalMediaHealth";

const schemaVersion = 1;
const defaultSeedMarkerFileName = ".default-library-seeded";
let libraryMutationQueue: Promise<void> = Promise.resolve();
let cachedLibraryPath: string | null = null;
let cachedItemsByImageFileName: Map<string, LibraryItem> | null = null;

export function createEmptyLibrary(): LibraryFile {
  return {
    schemaVersion,
    updatedAt: new Date().toISOString(),
    items: [],
  };
}

function enqueueLibraryMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = libraryMutationQueue.then(operation, operation);
  libraryMutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function ensureLibraryStorage(): Promise<void> {
  await enqueueLibraryMutation(ensureLibraryStorageUnlocked);
}

async function ensureLibraryStorageUnlocked(): Promise<void> {
  await fs.mkdir(getImagesDir(), { recursive: true });

  try {
    await fs.access(getLibraryPath());
  } catch {
    await writeInitialLibraryUnlocked();
    return;
  }

  if (await hasDefaultSeedMarker()) {
    return;
  }

  const content = await fs.readFile(getLibraryPath(), "utf8");
  let parsed: unknown;

  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return;
  }

  if (isLibraryFile(parsed) && parsed.items.length === 0) {
    if (shouldWriteDefaultSeed()) {
      await writeDefaultSeedLibraryUnlocked();
      return;
    }

    await markDefaultSeeded();
    return;
  }

  if (isLibraryFile(parsed)) {
    await markDefaultSeeded();
  }
}

export async function readLibraryFile(options?: { refreshExternalHealth?: boolean }): Promise<LibraryFile> {
  if (options?.refreshExternalHealth) {
    return updateLibraryFile(async (library) => {
      const healthyLibrary = await refreshExternalMediaHealth(library);
      return healthyLibrary === library ? null : healthyLibrary;
    }, { skipNormalize: true });
  }

  return enqueueLibraryMutation(async () => {
    await ensureLibraryStorageUnlocked();
    return readLibraryFileUnlocked();
  });
}

async function readLibraryFileUnlocked(): Promise<LibraryFile> {
  const content = await fs.readFile(getLibraryPath(), "utf8");
  const parsed = JSON.parse(content) as unknown;

  if (!isLibraryFile(parsed)) {
    throw new AppError("LIBRARY_SCHEMA_INVALID", "素材库文件结构不合法。");
  }

  const library: LibraryFile = {
    ...parsed,
    items: parsed.items.map(normalizeItem),
  };
  refreshLibraryLookupCache(library);
  return library;
}

export async function writeLibraryFile(library: LibraryFile, options?: { skipNormalize?: boolean }): Promise<LibraryFile> {
  return enqueueLibraryMutation(async () => {
    await ensureLibraryStorageUnlocked();
    return writeLibraryFileUnlocked(library, options);
  });
}

async function writeLibraryFileUnlocked(
  library: LibraryFile,
  options?: { skipNormalize?: boolean },
): Promise<LibraryFile> {
  await fs.mkdir(getLibraryDataDir(), { recursive: true });
  await fs.mkdir(getImagesDir(), { recursive: true });

  const normalized: LibraryFile = options?.skipNormalize
    ? {
        schemaVersion,
        updatedAt: new Date().toISOString(),
        items: library.items,
      }
    : {
        schemaVersion,
        updatedAt: new Date().toISOString(),
        items: library.items.map(normalizeItem),
      };

  if (!isLibraryFile(normalized)) {
    throw new AppError("LIBRARY_SCHEMA_INVALID", "素材库文件结构不合法。");
  }

  const tempPath = `${getLibraryPath()}.tmp`;

  // 紧凑 JSON 比 pretty-print 更小、更快，删除/导入时写盘更轻。
  await fs.writeFile(tempPath, JSON.stringify(normalized), "utf8");
  await fs.rename(tempPath, getLibraryPath());
  refreshLibraryLookupCache(normalized);

  return normalized;
}

export async function updateLibraryFile(
  updater: (library: LibraryFile) => Promise<LibraryFile | null> | LibraryFile | null,
  options?: { skipNormalize?: boolean },
): Promise<LibraryFile> {
  return enqueueLibraryMutation(async () => {
    await ensureLibraryStorageUnlocked();
    const current = await readLibraryFileUnlocked();
    const next = await updater(current);
    return next ? writeLibraryFileUnlocked(next, options) : current;
  });
}

/**
 * Renderer saves are metadata edits based on a possibly stale snapshot. Merge them
 * with the latest disk state so watcher/import additions are retained and external
 * path health cannot be overwritten by an older renderer copy.
 */
export async function saveLibraryFileFromRenderer(library: LibraryFile): Promise<LibraryFile> {
  return updateLibraryFile((current) => {
    const incomingById = new Map(library.items.map((item) => [item.id, normalizeItem(item)]));
    const items = current.items.map((currentItem) => {
      const incoming = incomingById.get(currentItem.id);

      if (!incoming) {
        return currentItem;
      }

      return {
        ...incoming,
        mediaStorage: currentItem.mediaStorage,
      };
    });

    return { ...current, items };
  });
}

export async function appendLibraryItems(items: LibraryItem[]): Promise<LibraryFile> {
  return updateLibraryFile((library) => ({
    ...library,
    items: [...items, ...library.items],
  }));
}

export async function findLibraryItemByImageFileName(imageFileName: string): Promise<LibraryItem | null> {
  const libraryPath = getLibraryPath();

  if (cachedLibraryPath !== libraryPath) {
    cachedLibraryPath = null;
    cachedItemsByImageFileName = null;
  }

  if (!cachedItemsByImageFileName) {
    await readLibraryFile();
  }

  return cachedItemsByImageFileName?.get(imageFileName) ?? null;
}

function refreshLibraryLookupCache(library: LibraryFile): void {
  cachedLibraryPath = getLibraryPath();
  cachedItemsByImageFileName = new Map(library.items.map((item) => [item.imageFileName, item]));
}

export function normalizeItem(item: LibraryItem): LibraryItem {
  const remoteImageUrl = normalizeOptionalString(item.remoteImageUrl);

  return {
    id: item.id,
    title: item.title,
    imageFileName: item.imageFileName,
    mediaStorage: normalizeMediaStorage(item.mediaStorage),
    prompt: item.prompt,
    negativePrompt: item.negativePrompt,
    category: normalizeOptionalString(item.category),
    tags: item.tags,
    generationMethod: normalizeOptionalString(item.generationMethod),
    promptType: normalizePromptType(item.promptType, item),
    sourceUrl: normalizeOptionalString(item.sourceUrl),
    remoteImageUrl,
    remoteImageStatus: remoteImageUrl ? normalizeRemoteImageStatus(item.remoteImageStatus) : null,
    authorName: normalizeOptionalString(item.authorName),
    authorUrl: normalizeOptionalString(item.authorUrl),
    authorAvatarUrl: normalizeOptionalString(item.authorAvatarUrl),
    nsfwRating: normalizeNsfwRating(item.nsfwRating),
    nsfwCheckedAt: normalizeOptionalString(item.nsfwCheckedAt),
    videoDurationSec: normalizeOptionalNumber(item.videoDurationSec),
    videoPosterFileName: normalizeOptionalString(item.videoPosterFileName),
    videoKeyframes: normalizeVideoKeyframes(item.videoKeyframes),
    videoReferenceImages: normalizeStringArray(item.videoReferenceImages),
    videoFramesGeneratedAt: normalizeOptionalString(item.videoFramesGeneratedAt),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function isLibraryFile(input: unknown): input is LibraryFile {
  if (!isRecord(input)) {
    return false;
  }

  return (
    input.schemaVersion === schemaVersion &&
    typeof input.updatedAt === "string" &&
    Array.isArray(input.items) &&
    input.items.every(isLibraryItem)
  );
}

function isLibraryItem(input: unknown): input is LibraryItem {
  if (!isRecord(input)) {
    return false;
  }

  return (
    typeof input.id === "string" &&
    typeof input.title === "string" &&
    typeof input.imageFileName === "string" &&
    isOptionalMediaStorage(input.mediaStorage) &&
    typeof input.prompt === "string" &&
    typeof input.negativePrompt === "string" &&
    Array.isArray(input.tags) &&
    input.tags.every((tag) => typeof tag === "string") &&
    isOptionalString(input.category) &&
    isOptionalString(input.generationMethod) &&
    isOptionalPromptType(input.promptType) &&
    isOptionalString(input.sourceUrl) &&
    isOptionalString(input.remoteImageUrl) &&
    isOptionalRemoteImageStatus(input.remoteImageStatus) &&
    isOptionalString(input.authorName) &&
    isOptionalString(input.authorUrl) &&
    isOptionalString(input.authorAvatarUrl) &&
    isOptionalNsfwRating(input.nsfwRating) &&
    isOptionalString(input.nsfwCheckedAt) &&
    isOptionalNumber(input.videoDurationSec) &&
    isOptionalString(input.videoPosterFileName) &&
    isOptionalVideoKeyframes(input.videoKeyframes) &&
    isOptionalStringArray(input.videoReferenceImages) &&
    isOptionalString(input.videoFramesGeneratedAt) &&
    typeof input.createdAt === "string" &&
    typeof input.updatedAt === "string"
  );
}

function isOptionalNsfwRating(input: unknown): boolean {
  return input === undefined || input === "unknown" || input === "safe" || input === "nsfw";
}

function isOptionalRemoteImageStatus(input: unknown): boolean {
  return input === undefined || input === null || input === "pending" || input === "downloaded";
}

function isOptionalMediaStorage(input: unknown): boolean {
  return (
    input === undefined ||
    input === "managed" ||
    (isRecord(input) &&
      input.kind === "external" &&
      typeof input.rootId === "string" &&
      typeof input.relativePath === "string" &&
      (input.size === undefined || input.size === null || (typeof input.size === "number" && Number.isFinite(input.size))) &&
      (input.mtimeMs === undefined || input.mtimeMs === null || (typeof input.mtimeMs === "number" && Number.isFinite(input.mtimeMs))) &&
      (input.status === undefined || input.status === "available" || input.status === "missing"))
  );
}

function normalizeMediaStorage(input: LibraryItem["mediaStorage"]): MediaStorage {
  if (
    input &&
    typeof input === "object" &&
    input.kind === "external" &&
    input.rootId.trim() &&
    input.relativePath.trim()
  ) {
    return {
      kind: "external",
      rootId: input.rootId.trim(),
      relativePath: input.relativePath.trim(),
      size: normalizeOptionalNumber(input.size),
      mtimeMs: normalizeOptionalNumber(input.mtimeMs),
      status: input.status === "missing" ? "missing" : "available",
    };
  }

  return "managed";
}

function isOptionalString(input: unknown): boolean {
  return input === undefined || input === null || typeof input === "string";
}

function isOptionalNumber(input: unknown): boolean {
  return input === undefined || input === null || (typeof input === "number" && Number.isFinite(input));
}

function isOptionalStringArray(input: unknown): boolean {
  return input === undefined || (Array.isArray(input) && input.every((entry) => typeof entry === "string"));
}

function isOptionalVideoKeyframes(input: unknown): boolean {
  if (input === undefined) {
    return true;
  }

  return (
    Array.isArray(input) &&
    input.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.imageFileName === "string" &&
        typeof entry.atSec === "number" &&
        Number.isFinite(entry.atSec) &&
        typeof entry.label === "string",
    )
  );
}

function isOptionalPromptType(input: unknown): boolean {
  return input === undefined || typeof input === "string";
}

function normalizeOptionalNumber(input: unknown): number | null {
  return typeof input === "number" && Number.isFinite(input) && input >= 0 ? input : null;
}

function normalizeOptionalString(input: string | null | undefined): string | null {
  return typeof input === "string" && input.trim() ? input.trim() : null;
}

function normalizeRemoteImageStatus(input: LibraryItem["remoteImageStatus"]): LibraryItem["remoteImageStatus"] {
  return input === "pending" || input === "downloaded" ? input : null;
}

function normalizeVideoKeyframes(input: unknown): VideoKeyframe[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter(
      (entry): entry is VideoKeyframe =>
        isRecord(entry) &&
        typeof entry.imageFileName === "string" &&
        entry.imageFileName.trim().length > 0 &&
        typeof entry.atSec === "number" &&
        Number.isFinite(entry.atSec) &&
        typeof entry.label === "string",
    )
    .map((entry) => ({
      imageFileName: entry.imageFileName.trim(),
      atSec: Math.max(0, entry.atSec),
      label: entry.label.trim(),
    }));
}

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return [
    ...new Set(
      input
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

async function writeDefaultSeedLibraryUnlocked(): Promise<void> {
  await ensureDefaultSeedImages();
  await writeLibraryFileUnlocked(createDefaultLibrary());
  await markDefaultSeeded();
}

async function writeInitialLibraryUnlocked(): Promise<void> {
  // 默认写入空素材库，避免演示提示词组进入开源包/正式包。
  // 仅当显式设置 PROMPT_LIBRARY_ENABLE_SEED=true 时写入内置演示种子。
  if (shouldWriteDefaultSeed()) {
    await writeDefaultSeedLibraryUnlocked();
    return;
  }

  await writeLibraryFileUnlocked(createEmptyLibrary());
  await markDefaultSeeded();
}

export function shouldWriteDefaultSeed(options?: {
  enableSeedEnv?: string | undefined;
}): boolean {
  return shouldEnableDefaultLibrarySeed(options?.enableSeedEnv);
}

async function ensureDefaultSeedImages(): Promise<void> {
  await fs.mkdir(getImagesDir(), { recursive: true });

  await Promise.all(
    getDefaultSeedImageFileNames().map(async (imageFileName) => {
      const imagePath = path.join(getImagesDir(), imageFileName);

      try {
        await fs.access(imagePath);
      } catch {
        await fs.writeFile(imagePath, createDefaultSeedImage(imageFileName));
      }
    }),
  );
}

async function hasDefaultSeedMarker(): Promise<boolean> {
  try {
    await fs.access(getDefaultSeedMarkerPath());
    return true;
  } catch {
    return false;
  }
}

async function markDefaultSeeded(): Promise<void> {
  await fs.writeFile(getDefaultSeedMarkerPath(), new Date().toISOString(), "utf8");
}

function getDefaultSeedMarkerPath(): string {
  return path.join(getLibraryDataDir(), defaultSeedMarkerFileName);
}
