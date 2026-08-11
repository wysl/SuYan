import type { PromptImageLexiconEntry, PromptLexiconSettings } from "../types/library";
import {
  UNCATEGORIZED_CATEGORY_ID,
  UNCATEGORIZED_CATEGORY_NAME,
  type CategoryAssignmentSource,
  type CategoryNode,
  type CategorySuggestion,
  type CategoryTaxonomy,
  type CategoryType,
  confidenceBand,
} from "../types/category";
import { buildAiCandidateCategoryId, buildCustomCategoryId, normalizeCategoryLabelKey } from "./categoryId";
import { isPseudoPhotographyGenreLabel, resolvePhotographyCategory } from "./photographyCategories";
import { buildSystemCategoryTaxonomy, findSystemCategoryIdByName } from "./systemCategoryTaxonomy";

export type ResolvedCategoryLabel = {
  id: string | null;
  name: string;
  source: CategoryAssignmentSource | null;
};

export function createEmptyCategoryTaxonomy(timestamp = new Date().toISOString()): CategoryTaxonomy {
  return buildSystemCategoryTaxonomy(timestamp);
}

export function mergeCategoryTaxonomy(
  base: CategoryTaxonomy,
  extraNodes: readonly CategoryNode[],
): CategoryTaxonomy {
  const byId = new Map<string, CategoryNode>();
  for (const node of base.nodes) {
    byId.set(node.id, node);
  }
  for (const node of extraNodes) {
    const existing = byId.get(node.id);
    if (!existing) {
      byId.set(node.id, node);
      continue;
    }
    byId.set(node.id, {
      ...existing,
      ...node,
      aliases: uniqueStrings([...existing.aliases, ...node.aliases]),
      keywords: uniqueStrings([...existing.keywords, ...node.keywords]),
      examples: uniqueStrings([...existing.examples, ...node.examples]),
      usageCount: Math.max(existing.usageCount, node.usageCount),
    });
  }

  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    nodes: Array.from(byId.values()),
    disabledSystemCategoryIds: base.disabledSystemCategoryIds,
  };
}

/**
 * Ensure the current workspace taxonomy always includes the latest system seed.
 *
 * Policy:
 * - System leaves always come from the seed (authoritative Genre ontology)
 * - Keep user custom / AI nodes that are still legitimate customs
 * - Drop only residual pollution: obsolete system leftovers and pseudo-genres
 */
export function ensureSystemCategoryTaxonomy(
  taxonomy: CategoryTaxonomy | null | undefined,
  timestamp = new Date().toISOString(),
): CategoryTaxonomy {
  const system = buildSystemCategoryTaxonomy(timestamp);
  const base = taxonomy ?? system;
  const disabledSystemCategoryIds = new Set(base.disabledSystemCategoryIds ?? []);
  const systemNameKeys = new Set(
    system.nodes
      .filter((node) => node.id !== UNCATEGORIZED_CATEGORY_ID)
      .flatMap((node) => [
        normalizeCategoryLabelKey(node.name),
        ...node.aliases.map((alias) => normalizeCategoryLabelKey(alias)),
      ])
      .filter(Boolean),
  );

  // Start from system seed. Carry over usageCount / imageFileName for matching system ids.
  const byId = new Map(
    system.nodes
      .filter((node) => !disabledSystemCategoryIds.has(node.id))
      .map((node) => [node.id, { ...node }]),
  );

  for (const node of base.nodes) {
    if (node.type === "system") {
      const current = byId.get(node.id);
      if (!current) {
        continue;
      }
      byId.set(node.id, {
        ...current,
        usageCount: Math.max(current.usageCount, node.usageCount),
        imageFileName: node.imageFileName ?? current.imageFileName,
      });
      continue;
    }

    // Preserve genuine custom / ai categories so auto-classify can match them later.
    // Drop pollution that used to fill「自定义分类」with garbage.
    const nameKey = normalizeCategoryLabelKey(node.name);
    if (!nameKey || nameKey === normalizeCategoryLabelKey(UNCATEGORIZED_CATEGORY_NAME)) {
      continue;
    }
    // Maps onto system leaf/alias → fold usage into system, do not keep duplicate custom.
    // 但用户显式创建的 custom:/ai: 节点即使名字撞系统别名也要保留，否则自定义分类会被吞掉。
    const isGenuineCustomNode = node.id.startsWith("custom:") || node.id.startsWith("ai:");
    if (!isGenuineCustomNode && (systemNameKeys.has(nameKey) || resolvePhotographyCategory(node.name))) {
      const mappedId =
        resolveCategoryIdFromLegacyName(
          { schemaVersion: 1, updatedAt: timestamp, nodes: Array.from(byId.values()) },
          node.name,
        ) ?? null;
      if (mappedId && mappedId !== UNCATEGORIZED_CATEGORY_ID) {
        const mapped = byId.get(mappedId);
        if (mapped) {
          byId.set(mappedId, {
            ...mapped,
            usageCount: Math.max(mapped.usageCount, node.usageCount),
          });
        }
      }
      continue;
    }
    if (isObsoleteSystemGroupLabel(node.group) || isObsoleteSystemGroupLabel(node.name)) {
      continue;
    }
    if (isPseudoPhotographyGenreLabel(node.name)) {
      continue;
    }
    // Keep custom/ai with real ids.
    if (!(node.id.startsWith("custom:") || node.id.startsWith("ai:"))) {
      continue;
    }
    byId.set(node.id, {
      ...node,
      // Normalize custom group label for sidebar.
      group: node.group?.trim() || "自定义分类",
    });
  }

  return {
    schemaVersion: 1,
    updatedAt: timestamp,
    nodes: Array.from(byId.values()),
    disabledSystemCategoryIds: Array.from(disabledSystemCategoryIds),
  };
}

/** Merge user category lexicon entries into taxonomy as custom nodes (by stable custom id). */
export function mergeLexiconCategoriesIntoTaxonomy(
  taxonomy: CategoryTaxonomy,
  lexiconCategories: readonly PromptImageLexiconEntry[],
): CategoryTaxonomy {
  const timestamp = new Date().toISOString();
  const existingNameToId = buildNameIndex(taxonomy.nodes);
  const extra: CategoryNode[] = [];

  for (const entry of lexiconCategories) {
    const label = entry.label.trim();
    if (!label || normalizeCategoryLabelKey(label) === normalizeCategoryLabelKey(UNCATEGORIZED_CATEGORY_NAME)) {
      continue;
    }

    // Already present by name / alias.
    if (existingNameToId.get(normalizeCategoryLabelKey(label))) {
      continue;
    }

    // Map legacy photography labels onto the new system leaves — never create custom clones.
    if (resolvePhotographyCategory(label)) {
      continue;
    }

    // Old system ids / obsolete section headers must not become custom categories.
    if (entry.id.startsWith("system:") || isObsoleteSystemGroupLabel(entry.group) || isObsoleteSystemGroupLabel(label)) {
      continue;
    }

    // Only accept genuine custom/ai draft ids created by the current UI.
    if (!(entry.id.startsWith("custom:") || entry.id.startsWith("ai:"))) {
      continue;
    }

    extra.push({
      id: entry.id,
      name: label,
      type: entry.id.startsWith("ai:") ? "ai" : "custom",
      parentId: entry.parentId ?? null,
      group: entry.group?.trim() || "自定义分类",
      aliases: [],
      keywords: label.split(/[、，,/\s]+/).filter((part) => part.length >= 2).slice(0, 12),
      description: entry.description?.trim() || "",
      examples: [],
      embedding: null,
      usageCount: 0,
      imageFileName: entry.imageFileName ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  return mergeCategoryTaxonomy(taxonomy, extra);
}


/** Old taxonomy section titles that must not reappear as custom groups. */
function isObsoleteSystemGroupLabel(value: string | null | undefined): boolean {
  const key = normalizeCategoryLabelKey(value ?? "");
  if (!key) {
    return false;
  }

  const currentRoots = new Set(
    [
      // 摄影域分组
      "商业摄影", "饮品摄影", "人像摄影", "自然摄影", "纪实摄影", "艺术摄影", "特殊摄影",
      "风光与自然摄影", "特殊技术摄影", "体育摄影", "旅行摄影", "交通摄影",
      "工业摄影", "科学摄影", "农业摄影", "娱乐媒体摄影", "文化历史摄影",
      "宠物摄影", "航天摄影",
      // 非摄影图像类型分组
      "插画绘画", "动漫二次元", "3D与CG", "概念设计", "平面设计",
      "UI界面", "传统艺术", "像素与复古",
      "游戏美术", "影视媒体", "表情包与网络文化", "字体与排版",
      "产品与电商视觉", "科学与医疗视觉", "建筑与空间视觉",
      "时尚与美妆视觉", "混合与实验媒介",
      // 系统内部分组
      "自定义分类", "AI 候选", "系统",
    ].map(
      (label) => normalizeCategoryLabelKey(label),
    ),
  );
  if (currentRoots.has(key)) {
    return false;
  }

  const obsolete = [
    "商业实用类",
    "美食专项类",
    "菜系风格类",
    "人像人物类",
    "风光自然类",
    "纪实记录类",
    "艺术创意类",
    "小众专项细分",
    "历史地域服饰类",
    "视觉风格分析类",
    "光影分析类",
    "道具分析类",
    "服饰分析类",
    "系统分类",
  ];
  return obsolete.some((label) => normalizeCategoryLabelKey(label) === key);
}

export function buildNameIndex(nodes: readonly CategoryNode[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of nodes) {
    map.set(normalizeCategoryLabelKey(node.name), node.id);
    for (const alias of node.aliases) {
      map.set(normalizeCategoryLabelKey(alias), node.id);
    }
  }
  return map;
}

export function findCategoryNodeById(
  taxonomy: CategoryTaxonomy | null | undefined,
  categoryId: string | null | undefined,
): CategoryNode | null {
  if (!taxonomy || !categoryId) {
    return null;
  }
  return taxonomy.nodes.find((node) => node.id === categoryId) ?? null;
}

export function resolveCategoryName(
  taxonomy: CategoryTaxonomy | null | undefined,
  categoryId: string | null | undefined,
  fallbackName?: string | null,
): string {
  const node = findCategoryNodeById(taxonomy, categoryId);
  if (node) {
    return node.name;
  }
  if (fallbackName && fallbackName.trim()) {
    return fallbackName.trim();
  }
  if (categoryId === UNCATEGORIZED_CATEGORY_ID) {
    return UNCATEGORIZED_CATEGORY_NAME;
  }
  return UNCATEGORIZED_CATEGORY_NAME;
}

export function resolveCategoryIdFromLegacyName(
  taxonomy: CategoryTaxonomy,
  legacyName: string | null | undefined,
): string | null {
  if (!legacyName || !legacyName.trim()) {
    return null;
  }
  const key = normalizeCategoryLabelKey(legacyName);
  if (key === normalizeCategoryLabelKey(UNCATEGORIZED_CATEGORY_NAME)) {
    return UNCATEGORIZED_CATEGORY_ID;
  }

  const index = buildNameIndex(taxonomy.nodes);
  const hit = index.get(key);
  if (hit) {
    return hit;
  }

  // Remap obsolete freeform / old system labels via photography alias table.
  const photographyResolved = resolvePhotographyCategory(legacyName);
  if (photographyResolved) {
    const mapped = index.get(normalizeCategoryLabelKey(photographyResolved));
    if (mapped) {
      return mapped;
    }
  }

  return findSystemCategoryIdByName(legacyName);
}

export function ensureTaxonomyHasCategory(
  taxonomy: CategoryTaxonomy,
  name: string,
  type: CategoryType = "custom",
  options?: {
    group?: string;
    description?: string;
    keywords?: readonly string[];
    parentId?: string | null;
    /** Prefer this id when creating a brand-new node (UI draft ids). */
    preferredId?: string | null;
  },
): { taxonomy: CategoryTaxonomy; categoryId: string } {
  const existing = resolveCategoryIdFromLegacyName(taxonomy, name);
  // 只折叠进同名的「自定义/AI」节点（去重）；显式新建的分类不能被系统别名/叶子吞掉。
  if (
    existing &&
    (type === "system" || !existing.startsWith("system:")) &&
    !options?.parentId &&
    !options?.preferredId
  ) {
    return { taxonomy, categoryId: existing };
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { taxonomy, categoryId: UNCATEGORIZED_CATEGORY_ID };
  }

  const timestamp = new Date().toISOString();
  const preferredId =
    typeof options?.preferredId === "string" && options.preferredId.trim()
      ? options.preferredId.trim()
      : null;
  const id =
    preferredId &&
    (preferredId.startsWith("custom:") || preferredId.startsWith("ai:") || preferredId.startsWith("system:")) &&
    !taxonomy.nodes.some((node) => node.id === preferredId)
      ? preferredId
      : type === "system"
        ? buildCustomCategoryId(trimmed)
        : type === "ai"
          ? buildAiCandidateCategoryId(trimmed)
          : buildCustomCategoryId(trimmed);
  const defaultGroup = type === "system" ? "系统分类" : type === "ai" ? "AI 候选" : "自定义分类";
  const parentId =
    typeof options?.parentId === "string" && options.parentId.trim() && options.parentId !== id
      ? options.parentId.trim()
      : null;
  const node: CategoryNode = {
    id,
    name: trimmed,
    type,
    parentId,
    group: options?.group?.trim() || defaultGroup,
    aliases: [],
    keywords: options?.keywords ? [...options.keywords] : [],
    description: options?.description?.trim() || "",
    examples: [],
    embedding: null,
    usageCount: 0,
    imageFileName: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return {
    taxonomy: mergeCategoryTaxonomy(taxonomy, [node]),
    categoryId: id,
  };
}

/** Prefer custom groups first, then system, then the rest (zh locale). */
export function compareCategoryGroupPriority(left: string, right: string): number {
  const rank = (group: string): number => {
    const key = normalizeCategoryLabelKey(group);
    if (key === normalizeCategoryLabelKey("自定义分类") || key.startsWith("自定义")) {
      return 0;
    }
    if (key === normalizeCategoryLabelKey("AI 候选") || key.startsWith("ai")) {
      return 2;
    }
    return 1;
  };
  const leftRank = rank(left);
  const rightRank = rank(right);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return left.localeCompare(right, "zh-CN");
}

export function upsertCustomCategoryNode(
  taxonomy: CategoryTaxonomy,
  input: {
    id?: string | null;
    name: string;
    group?: string | null;
    description?: string | null;
    parentId?: string | null;
    imageFileName?: string | null;
  },
): { taxonomy: CategoryTaxonomy; categoryId: string } {
  const name = input.name.trim();
  if (!name) {
    return { taxonomy, categoryId: UNCATEGORIZED_CATEGORY_ID };
  }

  const timestamp = new Date().toISOString();
  const existingById = input.id ? taxonomy.nodes.find((node) => node.id === input.id) : null;
  if (existingById) {
    if (existingById.type === "system") {
      return { taxonomy, categoryId: existingById.id };
    }
    const nextNode: CategoryNode = {
      ...existingById,
      name,
      group: input.group?.trim() || existingById.group || "自定义分类",
      description: input.description?.trim() ?? existingById.description,
      parentId: input.parentId === undefined ? existingById.parentId : input.parentId,
      imageFileName: input.imageFileName === undefined ? existingById.imageFileName : input.imageFileName,
      type: existingById.type === "ai" ? "custom" : existingById.type,
      updatedAt: timestamp,
    };
    return {
      taxonomy: {
        ...taxonomy,
        updatedAt: timestamp,
        nodes: taxonomy.nodes.map((node) => (node.id === existingById.id ? nextNode : node)),
      },
      categoryId: existingById.id,
    };
  }

  const byName = resolveCategoryIdFromLegacyName(taxonomy, name);
  // 只折叠进已存在的同名「自定义/AI」节点（去重）；用户显式新建的自定义分类不能被
  // 系统别名/叶子吞掉，否则「武侠」「禅意」这类常用词会静默映射到系统分类而“保存不上”。
  if (byName && !byName.startsWith("system:") && !input.parentId && !input.id) {
    return { taxonomy, categoryId: byName };
  }

  return ensureTaxonomyHasCategory(taxonomy, name, "custom", {
    group: input.group?.trim() || "自定义分类",
    description: input.description?.trim() || "",
    parentId: input.parentId ?? null,
    preferredId: input.id ?? null,
  });
}

export function removeCustomCategoryNode(
  taxonomy: CategoryTaxonomy,
  categoryId: string,
): CategoryTaxonomy {
  const target = taxonomy.nodes.find((node) => node.id === categoryId);
  if (!target || target.type === "system") {
    return taxonomy;
  }
  return removeCategoryNode(taxonomy, categoryId);
}

/** Remove a category and its descendants, including a user-disabled system category. */
export function removeCategoryNode(
  taxonomy: CategoryTaxonomy,
  categoryId: string,
): CategoryTaxonomy {
  const target = taxonomy.nodes.find((node) => node.id === categoryId);
  if (!target || target.id === UNCATEGORIZED_CATEGORY_ID) {
    return taxonomy;
  }

  const removedIds = new Set<string>([categoryId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of taxonomy.nodes) {
      if (node.parentId && removedIds.has(node.parentId) && !removedIds.has(node.id)) {
        removedIds.add(node.id);
        changed = true;
      }
    }
  }

  const disabledSystemCategoryIds = new Set(taxonomy.disabledSystemCategoryIds ?? []);
  if (target.type === "system") {
    for (const node of taxonomy.nodes) {
      if (removedIds.has(node.id) && node.type === "system") {
        disabledSystemCategoryIds.add(node.id);
      }
    }
  }

  return {
    ...taxonomy,
    updatedAt: new Date().toISOString(),
    nodes: taxonomy.nodes.filter((node) => !removedIds.has(node.id)),
    disabledSystemCategoryIds: Array.from(disabledSystemCategoryIds),
  };
}

export function incrementCategoryUsage(
  taxonomy: CategoryTaxonomy,
  categoryId: string | null | undefined,
  delta = 1,
): CategoryTaxonomy {
  if (!categoryId || delta === 0) {
    return taxonomy;
  }

  return {
    ...taxonomy,
    updatedAt: new Date().toISOString(),
    nodes: taxonomy.nodes.map((node) =>
      node.id === categoryId
        ? {
            ...node,
            usageCount: Math.max(0, node.usageCount + delta),
            updatedAt: new Date().toISOString(),
          }
        : node,
    ),
  };
}

export function recomputeCategoryUsageCounts(
  taxonomy: CategoryTaxonomy,
  categoryIds: readonly (string | null | undefined)[],
): CategoryTaxonomy {
  const counts = new Map<string, number>();
  for (const id of categoryIds) {
    if (!id) {
      continue;
    }
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return {
    ...taxonomy,
    updatedAt: new Date().toISOString(),
    nodes: taxonomy.nodes.map((node) => ({
      ...node,
      usageCount: counts.get(node.id) ?? 0,
    })),
  };
}

export function listCategoryTreeGroups(taxonomy: CategoryTaxonomy): Array<{ group: string; nodes: CategoryNode[] }> {
  const groups = new Map<string, CategoryNode[]>();
  for (const node of taxonomy.nodes) {
    if (node.id === UNCATEGORIZED_CATEGORY_ID) {
      continue;
    }
    const group = node.group || "未分组";
    const list = groups.get(group) ?? [];
    list.push(node);
    groups.set(group, list);
  }

  return Array.from(groups.entries())
    .map(([group, nodes]) => ({
      group,
      nodes: [...nodes].sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name, "zh-CN")),
    }))
    .sort((a, b) => compareCategoryGroupPriority(a.group, b.group));
}

export function matchCategoriesByText(
  taxonomy: CategoryTaxonomy,
  text: string,
  limit = 5,
): CategorySuggestion[] {
  const haystack = normalizeCategoryLabelKey(text);
  if (!haystack) {
    return [];
  }

  const scored: Array<CategorySuggestion & { score: number }> = [];
  const hasExplicitBeverage = /咖啡(?!机|壶)|拿铁|美式咖啡|浓缩咖啡|手冲|冷萃|茶饮|奶茶|抹茶|果茶|红茶|绿茶|乌龙茶|茶饮料|葡萄酒|红酒|白葡萄酒|香槟|啤酒|鸡尾酒|威士忌|白酒|烈酒|果汁|汽水|碳酸饮料|饮料|矿泉水|乳饮料|能量饮料|冰沙|饮品|coffee|latte|espresso|tea|matcha|wine|beer|cocktail|juice|soda|smoothie|beverage|drink/i.test(haystack);

  for (const node of taxonomy.nodes) {
    if (node.id === UNCATEGORIZED_CATEGORY_ID) {
      continue;
    }

    let score = 0;
    const nameKey = normalizeCategoryLabelKey(node.name);
    if (haystack.includes(nameKey) || nameKey.includes(haystack)) {
      score += 0.55;
    }
    for (const alias of node.aliases) {
      const aliasKey = normalizeCategoryLabelKey(alias);
      if (aliasKey && (haystack.includes(aliasKey) || aliasKey.includes(haystack))) {
        score += 0.25;
        break;
      }
    }
    for (const keyword of node.keywords) {
      const keywordKey = normalizeCategoryLabelKey(keyword);
      if (keywordKey.length >= 2 && haystack.includes(keywordKey)) {
        score += 0.12;
      }
    }
    if (node.description) {
      const descKey = normalizeCategoryLabelKey(node.description);
      const overlap = node.keywords.filter((keyword) => haystack.includes(normalizeCategoryLabelKey(keyword))).length;
      score += Math.min(0.15, overlap * 0.03);
      if (descKey && haystack.length > 8 && descKey.includes(haystack.slice(0, 12))) {
        score += 0.05;
      }
    }

    // A specific beverage leaf is a stronger subject signal than the legacy
    // broad Food/Product leaves whose descriptions also mention drinks.
    if (hasExplicitBeverage && (node.name === "产品摄影" || node.name === "食品摄影" || node.group === "美食摄影")) {
      score = -1;
    }

    if (score <= 0) {
      continue;
    }

    const confidence = Math.min(0.99, 0.45 + score);
    scored.push({
      categoryId: node.id,
      confidence,
      reason: `文本匹配「${node.name}」`,
      source: node.type === "system" ? "system" : node.type === "custom" ? "user" : "ai",
      score,
    });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ categoryId, confidence, reason, source }) => ({ categoryId, confidence, reason, source }));
}

export function pickAutoCategorySuggestion(
  suggestions: readonly CategorySuggestion[],
): CategorySuggestion | null {
  const top = suggestions[0];
  if (!top) {
    return null;
  }
  if (confidenceBand(top.confidence) === "high") {
    return top;
  }
  return null;
}

export function taxonomyToLexiconCategories(taxonomy: CategoryTaxonomy): PromptImageLexiconEntry[] {
  return taxonomy.nodes
    .filter((node) => node.id !== UNCATEGORIZED_CATEGORY_ID)
    .map((node) => ({
      id: node.id,
      group: node.group,
      label: node.name,
      description: node.description,
      parentId: node.parentId ?? null,
      imageFileName: node.imageFileName ?? null,
    }));
}

export function syncLexiconCategoriesFromTaxonomy(
  promptLexicons: PromptLexiconSettings | null,
  taxonomy: CategoryTaxonomy,
): PromptLexiconSettings {
  const base = promptLexicons ?? { categories: [], tags: [] };
  return {
    ...base,
    categories: taxonomyToLexiconCategories(taxonomy),
  };
}

function uniqueStrings(values: readonly string[]): string[] {
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
