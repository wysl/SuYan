import type { LibraryRoot } from "../../../src/features/library/types/library";

/** Apply a requested ID order while keeping valid roots that were omitted. */
export function orderLibraryRoots(
  roots: readonly LibraryRoot[],
  rootIds: readonly string[],
): LibraryRoot[] {
  const rootsById = new Map(roots.map((root) => [root.id, root]));
  const orderedRoots: LibraryRoot[] = [];
  const usedIds = new Set<string>();

  for (const rootId of rootIds) {
    const normalizedRootId = rootId.trim();
    const root = rootsById.get(normalizedRootId);

    if (!root || usedIds.has(normalizedRootId)) {
      continue;
    }

    usedIds.add(normalizedRootId);
    orderedRoots.push(root);
  }

  for (const root of roots) {
    if (!usedIds.has(root.id)) {
      usedIds.add(root.id);
      orderedRoots.push(root);
    }
  }

  return orderedRoots;
}
