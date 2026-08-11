import type { LibraryItem } from "../types/library";
import type { CategoryHealthIssue, CategoryTaxonomy } from "../types/category";
import { UNCATEGORIZED_CATEGORY_ID } from "../types/category";
import { normalizeCategoryLabelKey } from "./categoryId";

/**
 * Detect duplicate / too-broad / orphan taxonomy health issues.
 * Phase-2 foundation — pure, no AI required.
 */
export function analyzeCategoryHealth(
  taxonomy: CategoryTaxonomy,
  items: readonly LibraryItem[],
): CategoryHealthIssue[] {
  const issues: CategoryHealthIssue[] = [];
  const itemsByCategory = new Map<string, number>();
  for (const item of items) {
    const id = item.categoryId;
    if (!id) {
      continue;
    }
    itemsByCategory.set(id, (itemsByCategory.get(id) ?? 0) + 1);
  }

  // Duplicates: same normalized name or overlapping aliases across different ids
  const nameOwners = new Map<string, string[]>();
  for (const node of taxonomy.nodes) {
    if (node.id === UNCATEGORIZED_CATEGORY_ID) {
      continue;
    }
    const keys = [node.name, ...node.aliases].map(normalizeCategoryLabelKey).filter(Boolean);
    for (const key of keys) {
      const owners = nameOwners.get(key) ?? [];
      if (!owners.includes(node.id)) {
        owners.push(node.id);
      }
      nameOwners.set(key, owners);
    }
  }

  const seenDuplicatePairs = new Set<string>();
  for (const [key, owners] of nameOwners.entries()) {
    if (owners.length < 2) {
      continue;
    }
    const pairKey = owners.slice().sort().join("|");
    if (seenDuplicatePairs.has(pairKey)) {
      continue;
    }
    seenDuplicatePairs.add(pairKey);
    const names = owners
      .map((id) => taxonomy.nodes.find((node) => node.id === id)?.name ?? id)
      .join(" / ");
    issues.push({
      id: `duplicate:${pairKey}`,
      kind: "duplicate",
      title: `可能重复的分类：${names}`,
      detail: `标签或别名「${key}」同时命中多个分类节点，建议合并。`,
      categoryIds: owners,
      suggestedAction: "merge",
    });
  }

  // Too broad: usage dominates the library
  const totalCategorized = Array.from(itemsByCategory.values()).reduce((sum, count) => sum + count, 0);
  if (totalCategorized >= 20) {
    for (const node of taxonomy.nodes) {
      const count = itemsByCategory.get(node.id) ?? 0;
      if (count >= 30 && count / totalCategorized >= 0.45) {
        issues.push({
          id: `too_broad:${node.id}`,
          kind: "too_broad",
          title: `分类过宽：${node.name}`,
          detail: `约 ${count} 条素材（${Math.round((count / totalCategorized) * 100)}%）落在该分类，建议拆分。`,
          categoryIds: [node.id],
          suggestedAction: "split",
        });
      }
    }
  }

  // Orphans: taxonomy nodes never used (skip system seed noise — only custom/ai)
  for (const node of taxonomy.nodes) {
    if (node.type === "system" || node.id === UNCATEGORIZED_CATEGORY_ID) {
      continue;
    }
    const count = itemsByCategory.get(node.id) ?? 0;
    if (count === 0) {
      issues.push({
        id: `orphan:${node.id}`,
        kind: "orphan",
        title: `未使用的自定义分类：${node.name}`,
        detail: "词库中存在但素材未引用，可删除或保留备用。",
        categoryIds: [node.id],
        suggestedAction: "review",
      });
    }
  }

  return issues;
}

/**
 * Merge source category into target: retarget items and remove source node.
 */
export function mergeCategories(
  taxonomy: CategoryTaxonomy,
  items: readonly LibraryItem[],
  sourceCategoryId: string,
  targetCategoryId: string,
): { taxonomy: CategoryTaxonomy; items: LibraryItem[] } {
  if (sourceCategoryId === targetCategoryId) {
    return { taxonomy, items: [...items] };
  }

  const target = taxonomy.nodes.find((node) => node.id === targetCategoryId);
  const source = taxonomy.nodes.find((node) => node.id === sourceCategoryId);
  if (!target || !source) {
    return { taxonomy, items: [...items] };
  }

  const nextItems = items.map((item) =>
    item.categoryId === sourceCategoryId
      ? {
          ...item,
          categoryId: targetCategoryId,
          category: target.name,
          categorySource: item.categorySource ?? "user",
          categoryConfidence: 1,
          updatedAt: new Date().toISOString(),
        }
      : item,
  );

  const nextNodes = taxonomy.nodes
    .filter((node) => node.id !== sourceCategoryId)
    .map((node) => {
      if (node.id !== targetCategoryId) {
        return node;
      }
      return {
        ...node,
        aliases: unique([
          ...node.aliases,
          source.name,
          ...source.aliases,
        ]),
        keywords: unique([...node.keywords, ...source.keywords]),
        examples: unique([...node.examples, ...source.examples]),
        description: node.description || source.description,
        usageCount: node.usageCount + source.usageCount,
        updatedAt: new Date().toISOString(),
      };
    });

  return {
    taxonomy: {
      ...taxonomy,
      updatedAt: new Date().toISOString(),
      nodes: nextNodes,
    },
    items: nextItems,
  };
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = normalizeCategoryLabelKey(trimmed);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
