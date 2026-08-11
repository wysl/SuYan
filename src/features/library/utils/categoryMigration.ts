import type { LibraryFile, LibraryItem } from "../types/library";
import {
  UNCATEGORIZED_CATEGORY_ID,
  UNCATEGORIZED_CATEGORY_NAME,
  type CategoryAssignmentSource,
  type CategoryTaxonomy,
} from "../types/category";
import {
  createEmptyCategoryTaxonomy,
  ensureSystemCategoryTaxonomy,
  resolveCategoryIdFromLegacyName,
  resolveCategoryName,
  recomputeCategoryUsageCounts,
} from "./categoryTaxonomy";
import { normalizeCategoryLabelKey } from "./categoryId";

export const LIBRARY_SCHEMA_VERSION_V2 = 2 as const;

export type CategoryMigrationResult = {
  item: LibraryItem;
  changed: boolean;
};

/**
 * Normalize a single item onto categoryId taxonomy while preserving legacy category label.
 * - categoryId is authoritative when present and valid
 * - otherwise resolve from the **current** category display label only
 * - never re-assign from legacyCategory alone (that field is history after "移出分类")
 * - keep category string as display label for compatibility
 */
export function migrateLibraryItemCategories(
  item: LibraryItem,
  taxonomy: CategoryTaxonomy,
): CategoryMigrationResult {
  const currentCategoryLabel =
    typeof item.category === "string" && item.category.trim() ? item.category.trim() : null;
  const storedLegacyLabel =
    typeof item.legacyCategory === "string" && item.legacyCategory.trim()
      ? item.legacyCategory.trim()
      : null;
  // Historical hint only — must not resurrect an intentionally cleared category.
  const historyLabel = storedLegacyLabel || currentCategoryLabel;

  let categoryId = typeof item.categoryId === "string" && item.categoryId.trim() ? item.categoryId.trim() : null;
  let categorySource: CategoryAssignmentSource | null = item.categorySource ?? null;
  let categoryConfidence =
    typeof item.categoryConfidence === "number" && Number.isFinite(item.categoryConfidence)
      ? Math.min(1, Math.max(0, item.categoryConfidence))
      : null;

  if (categoryId) {
    const known = taxonomy.nodes.some((node) => node.id === categoryId);
    if (!known) {
      // Unknown id → resolve from current display label (not legacy history).
      const fromCurrent = resolveCategoryIdFromLegacyName(taxonomy, currentCategoryLabel);
      categoryId = fromCurrent;
      if (!categorySource) {
        categorySource = fromCurrent ? "system" : null;
      }
    }
  } else if (currentCategoryLabel) {
    // No id but still has a display label (legacy library / freeform) → map by label.
    const resolved = resolveCategoryIdFromLegacyName(taxonomy, currentCategoryLabel);
    categoryId = resolved;
    if (resolved) {
      categorySource = categorySource ?? "system";
      if (categoryConfidence == null) {
        categoryConfidence = 1;
      }
    }
  }
  // categoryId null + category null/empty = intentional uncategorized (e.g. 移出分类).
  // Do not rebuild from legacyCategory.

  if (categoryId === UNCATEGORIZED_CATEGORY_ID) {
    categoryId = null;
  }

  // Multi-genre: keep primary + any still-valid secondary ids.
  const knownIds = new Set(taxonomy.nodes.map((node) => node.id));
  const rawGenreIds = Array.isArray(item.genreIds)
    ? item.genreIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim())
    : [];
  const secondaryGenreIds = rawGenreIds.filter(
    (id) => id !== categoryId && id !== UNCATEGORIZED_CATEGORY_ID && knownIds.has(id),
  );
  const genreIds = categoryId ? [categoryId, ...secondaryGenreIds] : secondaryGenreIds.length > 0 ? secondaryGenreIds : null;

  const displayName = categoryId
    ? resolveCategoryName(taxonomy, categoryId, currentCategoryLabel || historyLabel)
    : currentCategoryLabel &&
        normalizeCategoryLabelKey(currentCategoryLabel) !== normalizeCategoryLabelKey(UNCATEGORIZED_CATEGORY_NAME)
      ? currentCategoryLabel
      : null;

  const nextLegacy =
    historyLabel &&
    (!displayName || normalizeCategoryLabelKey(historyLabel) !== normalizeCategoryLabelKey(displayName))
      ? historyLabel
      : null;

  const next: LibraryItem = {
    ...item,
    categoryId: categoryId,
    category: displayName,
    genreIds,
    categorySource: categoryId ? categorySource ?? "system" : null,
    categoryConfidence: categoryId ? categoryConfidence ?? 1 : null,
    legacyCategory: nextLegacy,
  };

  const prevGenre = Array.isArray(item.genreIds) ? item.genreIds.join("|") : "";
  const nextGenre = Array.isArray(genreIds) ? genreIds.join("|") : "";

  const changed =
    next.categoryId !== (item.categoryId ?? null) ||
    next.category !== (item.category ?? null) ||
    next.categorySource !== (item.categorySource ?? null) ||
    next.categoryConfidence !== (item.categoryConfidence ?? null) ||
    next.legacyCategory !== (item.legacyCategory ?? null) ||
    prevGenre !== nextGenre;

  return { item: next, changed };
}

export function migrateLibraryFileCategories(
  library: LibraryFile,
  taxonomyInput?: CategoryTaxonomy | null,
): { library: LibraryFile; taxonomy: CategoryTaxonomy; changed: boolean } {
  // Always re-seed the precise system tree first so obsolete system leaves remap.
  const seeded = ensureSystemCategoryTaxonomy(
    taxonomyInput ?? library.categoryTaxonomy ?? createEmptyCategoryTaxonomy(),
  );
  let taxonomy = seeded;
  let changed =
    library.schemaVersion !== LIBRARY_SCHEMA_VERSION_V2 ||
    taxonomy.nodes.length !== (library.categoryTaxonomy?.nodes.length ?? 0);
  const items: LibraryItem[] = [];

  for (const raw of library.items) {
    const result = migrateLibraryItemCategories(raw, taxonomy);
    items.push(result.item);
    if (result.changed) {
      changed = true;
    }
  }

  taxonomy = recomputeCategoryUsageCounts(
    taxonomy,
    items.map((item) => item.categoryId),
  );

  return {
    library: {
      ...library,
      schemaVersion: LIBRARY_SCHEMA_VERSION_V2,
      updatedAt: new Date().toISOString(),
      items,
      categoryTaxonomy: taxonomy,
    },
    taxonomy,
    changed,
  };
}

export function assignItemCategory(
  item: LibraryItem,
  taxonomy: CategoryTaxonomy,
  categoryId: string | null,
  source: CategoryAssignmentSource,
  confidence = 1,
): LibraryItem {
  if (!categoryId || categoryId === UNCATEGORIZED_CATEGORY_ID) {
    // Keep prior label only as history; current category fields stay empty so
    // migrate/save cannot put the item back into the previous category.
    const historyLabel =
      (typeof item.category === "string" && item.category.trim()) ||
      (typeof item.legacyCategory === "string" && item.legacyCategory.trim()) ||
      null;

    return {
      ...item,
      categoryId: null,
      category: null,
      genreIds: null,
      categorySource: null,
      categoryConfidence: null,
      legacyCategory: historyLabel,
      updatedAt: new Date().toISOString(),
    };
  }

  const name = resolveCategoryName(taxonomy, categoryId, item.category);
  const previousLabel =
    (typeof item.category === "string" && item.category.trim()) ||
    (typeof item.legacyCategory === "string" && item.legacyCategory.trim()) ||
    null;
  const legacyCategory =
    previousLabel && normalizeCategoryLabelKey(previousLabel) !== normalizeCategoryLabelKey(name)
      ? previousLabel
      : item.legacyCategory ?? null;

  // Keep prior secondary genres that remain valid, with the new primary first.
  const knownIds = new Set(taxonomy.nodes.map((node) => node.id));
  const priorSecondary = Array.isArray(item.genreIds)
    ? item.genreIds.filter((id) => id && id !== categoryId && id !== UNCATEGORIZED_CATEGORY_ID && knownIds.has(id))
    : [];
  const genreIds = [categoryId, ...priorSecondary];

  return {
    ...item,
    categoryId,
    category: name,
    genreIds,
    categorySource: source,
    categoryConfidence: Math.min(1, Math.max(0, confidence)),
    legacyCategory,
    updatedAt: new Date().toISOString(),
  };
}
