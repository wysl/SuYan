import fs from "node:fs/promises";
import type { ExternalMediaStatus, LibraryFile, LibraryItem, LibraryRoot } from "../../../src/features/library/types/library";
import { resolveExternalMediaPath } from "../../../src/features/library/utils/externalMediaPath";
import { readLibraryRoots } from "./libraryRoots";
import { mapWithConcurrency } from "./asyncMap";

export type ExternalMediaHealth = {
  status: ExternalMediaStatus;
  size: number | null;
  mtimeMs: number | null;
};

/** Reads external sources without touching them and returns a normalized health snapshot. */
export async function inspectExternalMedia(
  item: Pick<LibraryItem, "mediaStorage">,
  roots?: Awaited<ReturnType<typeof readLibraryRoots>>,
): Promise<ExternalMediaHealth | null> {
  const availableRoots = roots ?? (await readLibraryRoots());
  const rootsById = new Map(availableRoots.map((root) => [root.id, root]));
  return inspectExternalMediaWithRootIndex(item, rootsById);
}

function inspectExternalMediaWithRootIndex(
  item: Pick<LibraryItem, "mediaStorage">,
  rootsById: ReadonlyMap<string, LibraryRoot>,
): Promise<ExternalMediaHealth | null> {
  const storage = item.mediaStorage;

  if (!storage || storage === "managed") {
    return Promise.resolve(null);
  }

  const root = rootsById.get(storage.rootId);

  if (!root) {
    return Promise.resolve({ status: "missing", size: null, mtimeMs: null });
  }

  if (root.status === "missing") {
    return Promise.resolve({ status: "missing", size: null, mtimeMs: null });
  }

  let sourcePath: string;

  try {
    sourcePath = resolveExternalMediaPath(root.absolutePath, storage.relativePath);
  } catch {
    return Promise.resolve({ status: "missing", size: null, mtimeMs: null });
  }

  return fs
    .stat(sourcePath)
    .then((stats) =>
      stats.isFile()
        ? { status: "available" as const, size: stats.size, mtimeMs: stats.mtimeMs }
        : { status: "missing" as const, size: null, mtimeMs: null },
    )
    .catch(() => ({ status: "missing" as const, size: null, mtimeMs: null }));
}

/** Refreshes external health while preserving object identity when nothing changed. */
export async function refreshExternalMediaHealth(library: LibraryFile): Promise<LibraryFile> {
  const externalItems = library.items.filter((item) => item.mediaStorage && item.mediaStorage !== "managed");

  if (externalItems.length === 0) {
    return library;
  }

  const roots = await readLibraryRoots();
  const rootsById = new Map(roots.map((root) => [root.id, root]));
  const healthEntries = await mapWithConcurrency(externalItems, 32, async (item) => {
    return [item.id, await inspectExternalMediaWithRootIndex(item, rootsById)] as const;
  });
  const healthById = new Map(healthEntries);
  let changed = false;

  const items = library.items.map((item) => {
    const health = healthById.get(item.id);

    if (!health || !item.mediaStorage || item.mediaStorage === "managed") {
      return item;
    }

    const current = item.mediaStorage;

    if (
      current.status === health.status &&
      (current.size ?? null) === health.size &&
      (current.mtimeMs ?? null) === health.mtimeMs
    ) {
      return item;
    }

    changed = true;
    return {
      ...item,
      mediaStorage: { ...current, ...health },
    };
  });

  return changed ? { ...library, items } : library;
}
