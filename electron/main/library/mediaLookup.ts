import { getImagePath } from "./libraryPaths";
import { findLibraryItemByImageFileName } from "./libraryStore";
import { resolveMediaAbsolutePath } from "./mediaPathResolver";

export async function resolveLibraryMediaPath(imageFileName: string): Promise<string> {
  const item = await findLibraryItemByImageFileName(imageFileName);
  return item ? resolveMediaAbsolutePath(item) : getImagePath(imageFileName);
}
