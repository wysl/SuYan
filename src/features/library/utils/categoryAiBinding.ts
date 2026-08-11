import type { AiAnalyzePromptPayload, AiAnalyzeTarget } from "../types/ai";
import type { CategoryIntentDraft, CategorySuggestion, CategoryTaxonomy } from "../types/category";
import { confidenceBand } from "../types/category";
import {
  ensureTaxonomyHasCategory,
  matchCategoriesByText,
  resolveCategoryIdFromLegacyName,
  resolveCategoryName,
} from "./categoryTaxonomy";
import { normalizeCategoryLabelKey } from "./categoryId";
import {
  dedupeExclusiveGenreLabels,
  evaluateGenreAdmission,
  isHiddenAiCategoryLabel,
  isPseudoPhotographyGenreLabel,
  normalizeAiCategorySuggestions,
} from "./photographyCategories";

export type TaxonomyCategoryAiResult = {
  intent: CategoryIntentDraft | null;
  suggestions: CategorySuggestion[];
  primary: CategorySuggestion | null;
  /** high → auto apply; mid → confirm; low → inbox */
  band: "high" | "mid" | "low" | "none";
  /** Taxonomy may grow when AI proposes unknown labels (auto-create custom). */
  taxonomy: CategoryTaxonomy;
  createdCategoryIds: string[];
  /** Audit trail for auto-create decisions (pass/fail reasons). */
  admissionLog?: Array<{ label: string; admitted: boolean; reason: string }>;
};

/**
 * Map freeform AI category labels onto the fixed photography Genre ontology.
 *
 * Auto-create policy (strict):
 * - Prefer mapping onto existing system leaves/aliases
 * - Only create custom Genre when evaluateGenreAdmission() passes
 * - Pseudo labels / tag vocabulary are never promoted to Genre
 */
export function bindAiCategoriesToTaxonomy(
  taxonomy: CategoryTaxonomy,
  labels: readonly string[],
  options?: {
    baseConfidence?: number;
    reasonPrefix?: string;
    /**
     * When true, allow creating custom Genre nodes for unmatched labels that pass admission.
     * Default false.
     */
    autoCreateMissing?: boolean;
  },
): {
  suggestions: CategorySuggestion[];
  taxonomy: CategoryTaxonomy;
  createdCategoryIds: string[];
  admissionLog: Array<{ label: string; admitted: boolean; reason: string }>;
} {
  const baseConfidence = options?.baseConfidence ?? 0.82;
  const reasonPrefix = options?.reasonPrefix ?? "Genre 匹配";
  const autoCreateMissing = options?.autoCreateMissing === true;
  const suggestions: CategorySuggestion[] = [];
  const seen = new Set<string>();
  const createdCategoryIds: string[] = [];
  const admissionLog: Array<{ label: string; admitted: boolean; reason: string }> = [];
  let nextTaxonomy = taxonomy;

  const customNodes = nextTaxonomy.nodes.filter((node) => node.type === "custom" || node.type === "ai");

  const rawLabels = labels
    .map((label) => label.trim())
    .filter((label) => label && label !== "未分类" && !isPseudoPhotographyGenreLabel(label));
  // AI 只写入稳定的题材/场景分类；光线、色彩、景深和情绪留在视觉属性层，
  // 不进入素材详情分类，也不参与 taxonomy 绑定。
  const normalizedLabels = normalizeAiCategorySuggestions(rawLabels);
  // Always include freeform labels so existing custom categories can be matched.
  const labelsToBind = uniquePreserveOrder([
    ...normalizedLabels,
    ...rawLabels.filter((label) => !isHiddenAiCategoryLabel(label)),
  ]);

  for (const [index, label] of labelsToBind.entries()) {
    const trimmed = label.trim();
    if (!trimmed || trimmed === "未分类") {
      continue;
    }

    // 1) Existing taxonomy node by name/alias (system + custom + ai).
    let categoryId = resolveCategoryIdFromLegacyName(nextTaxonomy, trimmed);
    let created = false;
    let matchKind: "system" | "custom" | "ai" | "created" | "mapped" = "system";

    // 2) Soft match against custom/ai names.
    if (!categoryId) {
      const customHit = matchCustomCategoryLabel(customNodes, trimmed);
      if (customHit) {
        categoryId = customHit.id;
        matchKind = customHit.type === "custom" ? "custom" : "ai";
        admissionLog.push({
          label: trimmed,
          admitted: true,
          reason: `命中${matchKind === "custom" ? "自定义" : "AI"}分类「${customHit.name}」`,
        });
      }
    }

    // 3) Optional auto-create only after strict admission.
    if (!categoryId && autoCreateMissing) {
      const decision = evaluateGenreAdmission(trimmed);
      admissionLog.push({ label: trimmed, admitted: decision.admitted, reason: decision.reason });

      if (decision.mappedLeaf) {
        categoryId = resolveCategoryIdFromLegacyName(nextTaxonomy, decision.mappedLeaf);
        matchKind = "mapped";
      } else if (decision.admitted) {
        const ensured = ensureTaxonomyHasCategory(nextTaxonomy, trimmed, "ai", {
          group: decision.parentGroup || "自定义分类",
          description: `AI 合规新增 Genre：${decision.reason}`,
          keywords: trimmed.split(/[、，,/\s]+/).filter((part) => part.length >= 2).slice(0, 8),
        });
        nextTaxonomy = ensured.taxonomy;
        categoryId = ensured.categoryId;
        created = true;
        matchKind = "created";
        if (categoryId && categoryId !== "system:uncategorized") {
          createdCategoryIds.push(categoryId);
        }
      }
      if (!categoryId) {
        continue;
      }
    } else if (!categoryId) {
      if (!admissionLog.some((entry) => entry.label === trimmed)) {
        admissionLog.push({
          label: trimmed,
          admitted: false,
          reason: "未命中系统/自定义分类，且未开启自动新增",
        });
      }
      continue;
    } else if (!admissionLog.some((entry) => entry.label === trimmed)) {
      const node = nextTaxonomy.nodes.find((item) => item.id === categoryId);
      const kind = node?.type === "custom" ? "自定义" : node?.type === "ai" ? "AI" : "系统";
      admissionLog.push({
        label: trimmed,
        admitted: true,
        reason: `命中${kind}分类「${node?.name ?? trimmed}」`,
      });
      matchKind = node?.type === "custom" ? "custom" : node?.type === "ai" ? "ai" : "system";
    }

    if (!categoryId || seen.has(categoryId) || categoryId === "system:uncategorized") {
      continue;
    }
    seen.add(categoryId);

    const confidence = Math.max(0.55, baseConfidence - index * 0.08);
    const adjusted =
      matchKind === "custom"
        ? Math.min(0.97, confidence + 0.06)
        : created
          ? Math.min(confidence, 0.78)
          : confidence;

    const displayName = nextTaxonomy.nodes.find((node) => node.id === categoryId)?.name ?? trimmed;
    suggestions.push({
      categoryId,
      confidence: adjusted,
      reason:
        matchKind === "custom"
          ? `归纳到自定义分类「${displayName}」`
          : matchKind === "created"
            ? `AI 合规新增 Genre「${trimmed}」`
            : `${reasonPrefix}「${trimmed}」`,
      source: matchKind === "custom" ? "user" : "ai",
    });
  }

  suggestions.sort((left, right) => {
    const leftBoost = left.source === "user" ? 0.02 : 0;
    const rightBoost = right.source === "user" ? 0.02 : 0;
    return right.confidence + rightBoost - (left.confidence + leftBoost);
  });

  // Drop exclusive sibling genres after ranking (keep highest-confidence primary).
  const rankedNames = suggestions
    .map((suggestion) => resolveCategoryName(nextTaxonomy, suggestion.categoryId, ""))
    .filter(Boolean);
  const keptNames = new Set(dedupeExclusiveGenreLabels(rankedNames).map((name) => name));
  const dedupedSuggestions = suggestions.filter((suggestion) => {
    const name = resolveCategoryName(nextTaxonomy, suggestion.categoryId, "");
    return !name || keptNames.has(name);
  });

  return { suggestions: dedupedSuggestions, taxonomy: nextTaxonomy, createdCategoryIds, admissionLog };
}

function matchCustomCategoryLabel(
  customNodes: readonly import("../types/category").CategoryNode[],
  label: string,
): import("../types/category").CategoryNode | null {
  const key = normalizeCategoryLabelKey(label);
  if (!key) {
    return null;
  }

  for (const node of customNodes) {
    if (normalizeCategoryLabelKey(node.name) === key) {
      return node;
    }
    if (node.aliases.some((alias) => normalizeCategoryLabelKey(alias) === key)) {
      return node;
    }
  }

  if (key.length < 2) {
    return null;
  }

  let best: { node: import("../types/category").CategoryNode; score: number } | null = null;
  for (const node of customNodes) {
    const nameKey = normalizeCategoryLabelKey(node.name);
    if (!nameKey || nameKey.length < 2) {
      continue;
    }
    let score = 0;
    if (key.includes(nameKey) || nameKey.includes(key)) {
      score = Math.min(nameKey.length, key.length) / Math.max(nameKey.length, key.length);
    }
    for (const alias of node.aliases) {
      const aliasKey = normalizeCategoryLabelKey(alias);
      if (aliasKey.length >= 2 && (key.includes(aliasKey) || aliasKey.includes(key))) {
        score = Math.max(
          score,
          Math.min(aliasKey.length, key.length) / Math.max(aliasKey.length, key.length),
        );
      }
    }
    if (score >= 0.6 && (!best || score > best.score)) {
      best = { node, score };
    }
  }
  return best?.node ?? null;
}

function uniquePreserveOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value.trim());
  }
  return result;
}

export function buildTaxonomyCategoryAiResult(
  taxonomy: CategoryTaxonomy,
  analysis: {
    primaryCategory?: string;
    suggestedCategories?: string[];
    summary?: string;
  },
  contextText = "",
  options?: { autoCreateMissing?: boolean },
): TaxonomyCategoryAiResult {
  const labels = [
    analysis.primaryCategory ?? "",
    ...(analysis.suggestedCategories ?? []),
  ].filter(Boolean);

  let bound = bindAiCategoriesToTaxonomy(taxonomy, labels, {
    autoCreateMissing: options?.autoCreateMissing,
  });
  let suggestions = bound.suggestions;
  let nextTaxonomy = bound.taxonomy;
  const createdCategoryIds = [...bound.createdCategoryIds];
  const admissionLog = [...bound.admissionLog];

  // Fallback: local keyword match when AI returns nothing mappable
  if (suggestions.length === 0 && contextText.trim()) {
    suggestions = matchCategoriesByText(nextTaxonomy, contextText, 3).map((item) => ({
      ...item,
      source: "ai" as const,
      reason: item.reason || "本地语义回退匹配",
    }));
  }

  const primary = suggestions[0] ?? null;
  const band = primary ? confidenceBand(primary.confidence) : "none";

  const intent = analysis.summary?.trim()
    ? {
        subject: "",
        purpose: "",
        visual: "",
        summary: analysis.summary.trim(),
      }
    : null;

  return {
    intent,
    suggestions,
    primary,
    band,
    taxonomy: nextTaxonomy,
    createdCategoryIds,
    admissionLog,
  };
}

export function resolveSuggestionDisplayNames(
  taxonomy: CategoryTaxonomy,
  suggestions: readonly CategorySuggestion[],
): string[] {
  return suggestions
    .map((suggestion) => resolveCategoryName(taxonomy, suggestion.categoryId, suggestion.categoryId))
    .filter(Boolean);
}

export function shouldAutoApplyCategory(result: TaxonomyCategoryAiResult): boolean {
  return result.band === "high" && Boolean(result.primary);
}

export function shouldConfirmCategory(result: TaxonomyCategoryAiResult): boolean {
  return result.band === "mid" && Boolean(result.primary);
}

export function shouldInboxCategory(result: TaxonomyCategoryAiResult): boolean {
  return result.band === "low" || result.band === "none";
}

/** Closed catalog for AI prompts: id + name only, no free creation. */
export function buildTaxonomyCatalogForAi(taxonomy: CategoryTaxonomy, limit = 120): string {
  return taxonomy.nodes
    .filter((node) => node.id !== "system:uncategorized")
    .slice(0, limit)
    .map((node) => `${node.id} | ${node.name} | ${node.group}`)
    .join("\n");
}

export function isCategoryAiTarget(target: AiAnalyzeTarget): boolean {
  return target === "prompt-category" || target === "image-category";
}

export function withKnownCategoriesFromTaxonomy(
  payload: AiAnalyzePromptPayload,
  taxonomy: CategoryTaxonomy,
): AiAnalyzePromptPayload {
  // Put custom/AI categories first so models prefer existing user labels when relevant.
  const ranked = taxonomy.nodes
    .filter((node) => node.id !== "system:uncategorized")
    .slice()
    .sort((left, right) => {
      const rank = (type: string) => (type === "custom" ? 0 : type === "ai" ? 1 : 2);
      const delta = rank(left.type) - rank(right.type);
      if (delta !== 0) return delta;
      return left.name.localeCompare(right.name, "zh-Hans-CN");
    });
  return {
    ...payload,
    knownCategories: ranked.map((node) => node.name),
  };
}
