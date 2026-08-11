import type { CategoryTaxonomy } from "../types/category";
import { UNCATEGORIZED_CATEGORY_ID, UNCATEGORIZED_CATEGORY_NAME } from "../types/category";
import type { PromptCardData } from "./promptFilters";
import type { PromptImageGroup } from "./promptImageGroups";
import { findCategoryNodeById } from "./categoryTaxonomy";

export type PromptGroupCategoryMembership = {
  categoryIds: string[];
  labelKeys: string[];
};

export function normalizePromptGroupCategoryKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-Hans-CN");
}

export function getPromptGroupCategoryLabels(
  group: PromptImageGroup,
  taxonomy?: CategoryTaxonomy | null,
): string[] {
  return getPromptCardCategoryLabels(group.primaryItem, taxonomy);
}

export function getPromptGroupCategoryMembershipKeys(
  group: PromptImageGroup,
  taxonomy?: CategoryTaxonomy | null,
): PromptGroupCategoryMembership {
  const categoryIds = getPromptCardCategoryIds(group.primaryItem);
  const labels = getPromptCardCategoryLabels(group.primaryItem, taxonomy);

  return {
    categoryIds,
    labelKeys: labels.map(normalizePromptGroupCategoryKey).filter(Boolean),
  };
}

function getPromptCardCategoryIds(item: PromptCardData): string[] {
  const ids: string[] = [];
  const seenIds = new Set<string>();

  for (const id of [item.categoryId, ...item.genreIds]) {
    const normalizedId = typeof id === "string" ? id.trim() : "";

    if (!normalizedId || normalizedId === UNCATEGORIZED_CATEGORY_ID || seenIds.has(normalizedId)) {
      continue;
    }

    seenIds.add(normalizedId);
    ids.push(normalizedId);
  }

  return ids;
}

function getPromptCardCategoryLabels(
  item: PromptCardData,
  taxonomy?: CategoryTaxonomy | null,
): string[] {
  const labels: string[] = [];
  const seenKeys = new Set<string>();

  addCategoryLabel(labels, seenKeys, item.category);

  for (const categoryId of getPromptCardCategoryIds(item)) {
    addCategoryLabel(labels, seenKeys, resolveCategoryLabelFromId(categoryId, taxonomy));
  }

  return labels;
}

function resolveCategoryLabelFromId(
  categoryId: string,
  taxonomy?: CategoryTaxonomy | null,
): string | null {
  const node = findCategoryNodeById(taxonomy, categoryId);

  if (node) {
    return node.name;
  }

  if (categoryId === UNCATEGORIZED_CATEGORY_ID) {
    return null;
  }

  const segments = categoryId.split(":").map((segment) => segment.trim()).filter(Boolean);

  if (segments[0] === "system" && segments.length >= 3) {
    return segments[segments.length - 1] ?? null;
  }

  return null;
}

function addCategoryLabel(labels: string[], seenKeys: Set<string>, value: string | null | undefined): void {
  const label = typeof value === "string" ? value.trim() : "";
  const key = normalizePromptGroupCategoryKey(label);

  if (!label || !key || key === normalizePromptGroupCategoryKey(UNCATEGORIZED_CATEGORY_NAME) || seenKeys.has(key)) {
    return;
  }

  seenKeys.add(key);
  labels.push(label);
}
