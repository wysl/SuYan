import { useLibraryStore } from "../store/useLibraryStore";
import { resolveCategoryName } from "../utils/categoryTaxonomy";
import { confidenceBand } from "../types/category";

/**
 * Lightweight inbox for uncategorized / low-confidence materials.
 *
 * Intentionally NOT mounted in the category browser UI for now: the panel only
 * listed titles without drag-select or one-click AI classify, which misled users.
 * Keep the component for a future complete review flow; do not re-surface until
 * drag + AI actions are ready.
 */
export function CategoryInboxPanel() {
  return null;
}
