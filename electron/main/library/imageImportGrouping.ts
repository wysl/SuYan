import type { PromptImportDraft } from "../../shared/promptImportParser";

export type PreparedImportImage = {
  name: string;
  data: Uint8Array;
  draft: PromptImportDraft;
};

export type ImportPromptGroupPlan = {
  groupKey: string;
  /** Canonical draft applied to every image in the group (identical content → one prompt group). */
  draft: PromptImportDraft;
  images: Array<{ name: string; data: Uint8Array }>;
  hasPromptContent: boolean;
};

export type ImportPromptGroupSummary = {
  groupKey: string;
  title: string;
  promptPreview: string;
  imageCount: number;
  hasPromptContent: boolean;
};

/**
 * Group dropped / buffered images by embedded prompt content.
 * - Each image keeps its own parsed draft as input
 * - Identical prompt+negative (normalized) share one group and one canonical draft
 * - Images without prompt text form a single blank multi-image group
 */
export function planImportImageGroups(images: readonly PreparedImportImage[]): ImportPromptGroupPlan[] {
  const order: string[] = [];
  const buckets = new Map<string, PreparedImportImage[]>();

  for (const image of images) {
    const groupKey = createImportPromptContentKey(image.draft);
    if (!buckets.has(groupKey)) {
      order.push(groupKey);
      buckets.set(groupKey, []);
    }
    buckets.get(groupKey)!.push(image);
  }

  return order.map((groupKey) => {
    const members = buckets.get(groupKey) ?? [];
    const draft = pickCanonicalImportDraft(members.map((member) => member.draft));
    return {
      groupKey,
      draft,
      images: members.map((member) => ({ name: member.name, data: member.data })),
      hasPromptContent: hasImportDraftPromptContent(draft),
    };
  });
}

export function summarizeImportPromptGroups(plans: readonly ImportPromptGroupPlan[]): ImportPromptGroupSummary[] {
  return plans.map((plan) => ({
    groupKey: plan.groupKey,
    title: plan.draft.title.trim() || (plan.hasPromptContent ? "未命名提示词" : "空白提示词"),
    promptPreview: buildPromptPreview(plan.draft),
    imageCount: plan.images.length,
    hasPromptContent: plan.hasPromptContent,
  }));
}

export function createImportPromptContentKey(draft: PromptImportDraft): string {
  const prompt = normalizeImportGroupText(draft.prompt);
  const negativePrompt = normalizeImportGroupText(draft.negativePrompt);

  if (!prompt && !negativePrompt) {
    return "__blank__";
  }

  // Group by prompt body only so identical prompts land together even if titles differ.
  return `prompt:${prompt}\nnegative:${negativePrompt}`;
}

export function hasImportDraftPromptContent(draft: PromptImportDraft): boolean {
  return Boolean(draft.prompt.trim() || draft.negativePrompt.trim() || draft.title.trim());
}

function pickCanonicalImportDraft(drafts: readonly PromptImportDraft[]): PromptImportDraft {
  if (drafts.length === 0) {
    return {
      title: "",
      prompt: "",
      negativePrompt: "",
      tags: [],
      generationMethod: null,
      sourceUrl: null,
      sourceImageUrl: null,
      authorName: null,
      authorUrl: null,
      authorAvatarUrl: null,
    };
  }

  const withPrompt = drafts
    .filter((draft) => draft.prompt.trim() || draft.negativePrompt.trim())
    .sort((left, right) => scoreDraft(right) - scoreDraft(left));

  const chosen = withPrompt[0] ?? drafts.slice().sort((left, right) => scoreDraft(right) - scoreDraft(left))[0];

  // Merge tags from siblings so multi-image groups keep useful labels.
  const tags = uniquePreserveOrder(drafts.flatMap((draft) => draft.tags));
  const generationMethod =
    chosen.generationMethod ?? drafts.find((draft) => draft.generationMethod)?.generationMethod ?? null;

  return {
    ...chosen,
    tags,
    generationMethod,
  };
}

function scoreDraft(draft: PromptImportDraft): number {
  return (
    draft.prompt.trim().length * 4 +
    draft.negativePrompt.trim().length * 2 +
    draft.title.trim().length +
    draft.tags.length
  );
}

function buildPromptPreview(draft: PromptImportDraft): string {
  const prompt = draft.prompt.trim().replace(/\s+/g, " ");
  if (prompt) {
    return prompt.length > 120 ? `${prompt.slice(0, 117)}…` : prompt;
  }

  const negative = draft.negativePrompt.trim().replace(/\s+/g, " ");
  if (negative) {
    const text = `反向：${negative}`;
    return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  }

  return "（无嵌入提示词，将创建空白卡片）";
}

function normalizeImportGroupText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function uniquePreserveOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
