/**
 * AI 分析结果的合并与封顶策略（分类 / 标签 / 参数共用）。
 *
 * 规则：
 * 1. 未到上限时纯新增——既有内容原样保留，顺序不变。
 * 2. 到达上限后不再直接丢弃新结果，而是按匹配度淘汰：
 *    匹配度更高的新结果会顶掉匹配度更低的既有条目。
 * 3. 淘汰只决定「谁留下」，不改变留下来的条目的相对顺序，
 *    因此分类的主分类不会因为一次识别就换位。
 *
 * 匹配度来源：
 * - 新结果：AI 已按匹配度从高到低排序，用名次换算成分值。
 * - 既有条目：无从得知当初的置信度，统一给一个中位先验
 *   （existingEntryFitPrior）。效果是只有明显更匹配的新结果才顶得掉旧的，
 *   AI 排在后面的凑数结果顶不掉。
 */

/** 分类 / 标签 / 参数分析结果的统一上限。 */
export const maxAnalysisResultCount = 15;

/** 既有条目的匹配度先验：新结果要高于它才能触发替换。 */
export const existingEntryFitPrior = 0.75;

export type MergeAnalysisLabelsOptions = {
  /** 既有内容，顺序即当前展示顺序。 */
  existing: readonly string[];
  /** 本次 AI 结果，必须已按匹配度从高到低排列。 */
  incoming: readonly string[];
  /** 总数上限，默认 maxAnalysisResultCount。 */
  maxCount?: number;
  /**
   * 前 N 个既有条目永不淘汰。分类传 1 用来保住主分类；标签传 0。
   */
  protectedCount?: number;
  /** 既有条目的匹配度先验，默认 existingEntryFitPrior。 */
  existingFit?: number;
};

type MergeEntry = {
  label: string;
  fit: number;
  order: number;
};

/**
 * 把 AI 结果并入既有内容，超出上限时用高匹配度的新结果替换低匹配度的条目。
 *
 * 返回值保持「既有在前、新增在后」的顺序，只是其中匹配度最低的若干条会被剔除。
 */
export function mergeAnalysisLabelsWithFitCap({
  existing,
  incoming,
  maxCount = maxAnalysisResultCount,
  protectedCount = 0,
  existingFit = existingEntryFitPrior,
}: MergeAnalysisLabelsOptions): string[] {
  const limit = Math.max(0, maxCount);

  if (limit === 0) {
    return [];
  }

  const entries: MergeEntry[] = [];
  const seenKeys = new Set<string>();

  const push = (rawLabel: string, fit: number) => {
    const label = rawLabel.trim();
    const key = normalizeMergeKey(label);

    if (!label || !key || seenKeys.has(key)) {
      return;
    }

    seenKeys.add(key);
    entries.push({ label, fit, order: entries.length });
  };

  // 既有条目优先占位：同名时保留既有写法，不被新结果改写。
  for (const label of existing) {
    push(label, existingFit);
  }
  for (const [index, label] of incoming.entries()) {
    push(label, resolveIncomingFit(index));
  }

  if (entries.length <= limit) {
    return entries.map((entry) => entry.label);
  }

  const protectedEntries = entries.slice(0, Math.min(protectedCount, limit));
  const contested = entries.slice(protectedEntries.length);
  const remainingSlots = limit - protectedEntries.length;

  // 匹配度高的胜出；同分时靠前的（既有条目、以及 AI 排名更高的）胜出。
  const survivors = [...contested]
    .sort((left, right) => right.fit - left.fit || left.order - right.order)
    .slice(0, remainingSlots);
  const survivorOrders = new Set(survivors.map((entry) => entry.order));

  return entries
    .filter((entry) => entry.order < protectedEntries.length || survivorOrders.has(entry.order))
    .map((entry) => entry.label);
}

/**
 * 名次 → 匹配度。AI 已按匹配度排序，越靠前分值越高。
 *
 * 首位 0.95 高于既有先验 0.75，末位 0.60 低于先验：
 * 也就是 AI 最有把握的前几个能顶掉旧内容，排在后面的凑数结果顶不掉。
 */
function resolveIncomingFit(index: number): number {
  return Math.max(0.6, 0.95 - index * 0.03);
}

function normalizeMergeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}
