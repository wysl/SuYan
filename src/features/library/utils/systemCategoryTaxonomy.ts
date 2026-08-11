import {
  UNCATEGORIZED_CATEGORY_ID,
  UNCATEGORIZED_CATEGORY_NAME,
  type CategoryNode,
  type CategoryTaxonomy,
} from "../types/category";
import {
  getPhotographyCategoryAliasPairs,
  photographyCategoryDefinitions,
} from "./photographyCategories";
import { buildSystemCategoryId, normalizeCategoryLabelKey } from "./categoryId";

function nowIso(): string {
  return new Date().toISOString();
}

function buildUncategorizedNode(timestamp: string): CategoryNode {
  return {
    id: UNCATEGORIZED_CATEGORY_ID,
    name: UNCATEGORIZED_CATEGORY_NAME,
    type: "system",
    parentId: null,
    group: "系统",
    aliases: ["未归类", "unknown", "none"],
    keywords: ["未分类"],
    description: "尚未归属到具体领域的提示词素材。",
    examples: [],
    embedding: null,
    usageCount: 0,
    imageFileName: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Build the immutable system taxonomy seed from the precise photography tree.
 * Leaf categories are assignable; `group` is the sidebar parent section
 * (商业摄影 / 人像摄影 / 自然摄影 / 纪实摄影 / 艺术摄影 / 特殊摄影).
 * Stable ids: system:<groupSlug>:<labelSlug>.
 */
export function buildSystemCategoryTaxonomy(timestamp = nowIso()): CategoryTaxonomy {
  const aliasByCanonical = new Map<string, string[]>();
  for (const [alias, canonical] of getPhotographyCategoryAliasPairs()) {
    const key = normalizeCategoryLabelKey(canonical);
    const list = aliasByCanonical.get(key) ?? [];
    if (!list.some((item) => normalizeCategoryLabelKey(item) === normalizeCategoryLabelKey(alias))) {
      list.push(alias);
    }
    aliasByCanonical.set(key, list);
  }

  const nodes: CategoryNode[] = [buildUncategorizedNode(timestamp)];

  for (const definition of photographyCategoryDefinitions) {
    const id = buildSystemCategoryId(definition.group, definition.label);
    const aliasList = aliasByCanonical.get(normalizeCategoryLabelKey(definition.label)) ?? [];
    const keywords = Array.from(
      new Set(
        [definition.label, ...aliasList, ...definition.description.split(/[、，,/\s]+/)]
          .map((part) => part.trim())
          .filter((part) => part.length >= 2),
      ),
    ).slice(0, 24);

    nodes.push({
      id,
      name: definition.label,
      type: "system",
      parentId: null,
      group: definition.group,
      aliases: aliasList,
      keywords,
      description: definition.description,
      examples: [],
      embedding: null,
      usageCount: 0,
      imageFileName: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  return {
    schemaVersion: 1,
    updatedAt: timestamp,
    nodes,
  };
}

export function getSystemCategoryNodes(): CategoryNode[] {
  return buildSystemCategoryTaxonomy().nodes;
}

export function findSystemCategoryIdByName(name: string): string | null {
  const key = normalizeCategoryLabelKey(name);
  if (!key) {
    return null;
  }

  const taxonomy = buildSystemCategoryTaxonomy();
  for (const node of taxonomy.nodes) {
    if (node.id === UNCATEGORIZED_CATEGORY_ID) {
      continue;
    }
    if (normalizeCategoryLabelKey(node.name) === key) {
      return node.id;
    }
    if (node.aliases.some((alias) => normalizeCategoryLabelKey(alias) === key)) {
      return node.id;
    }
  }

  return null;
}
