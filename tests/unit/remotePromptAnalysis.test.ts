import { describe, expect, it } from "vitest";
import { buildPromptAnalysisFromRemote } from "../../src/features/library/utils/remotePromptAnalysis";
import { remoteAnalysisV2FromLegacy } from "../../src/features/library/utils/remoteAnalysisV2";
import { buildSystemCategoryTaxonomy } from "../../src/features/library/utils/systemCategoryTaxonomy";
import type {
  RemoteAnalysisTagDimension,
  RemotePromptAnalysis,
  RemotePromptAnalysisV2,
} from "../../src/features/library/types/ai";

/**
 * Wrap a flat V1 payload exactly as the live parser does for a legacy response
 * (lifted to V2 at capped, synthetic confidence). These exercise the
 * order-preserving, non-gated legacy path so the historical expectations hold.
 */
function lifted(flat: RemotePromptAnalysis): RemotePromptAnalysisV2 {
  return remoteAnalysisV2FromLegacy(flat);
}

/** Build a genuine V2 payload (no legacy warning → confidence gating is active). */
function genuine(input: {
  title?: string;
  summary?: string;
  categories?: Array<{ label: string; confidence: number; primary?: boolean; evidence?: string[] }>;
  tags?: Array<{ label: string; confidence: number; dimension?: RemoteAnalysisTagDimension; evidence?: string[] }>;
}): RemotePromptAnalysisV2 {
  return {
    schemaVersion: 2,
    title: input.title ?? "",
    summary: input.summary ?? "",
    categories: (input.categories ?? []).map((candidate) => ({
      label: candidate.label,
      confidence: candidate.confidence,
      // A genuine V2 response cites evidence per candidate; default to a
      // non-empty phrase so confidence tests are not silently evidence-gated.
      evidence: candidate.evidence ?? ["依据"],
      primary: candidate.primary ?? false,
    })),
    tags: (input.tags ?? []).map((candidate) => ({
      label: candidate.label,
      dimension: candidate.dimension ?? "other",
      confidence: candidate.confidence,
      evidence: candidate.evidence ?? ["依据"],
    })),
    safety: { rating: "unknown", confidence: 0, evidence: [] },
    warnings: [],
  };
}

describe("remotePromptAnalysis genre/tag boundary", () => {
  const taxonomy = buildSystemCategoryTaxonomy("2026-01-01T00:00:00.000Z");

  it("maps image-category secondary genres without emitting feature tags", () => {
    const result = buildPromptAnalysisFromRemote(
      "luxury perfume advertisement black background soft light",
      lifted({
        title: "perfume",
        category: "产品摄影",
        tags: ["微距摄影", "高级感", "柔光", "香水"],
        summary: "perfume ad",
      }),
      "image-category",
      { taxonomy },
    );

    expect(result.primaryCategory).toBe("产品摄影");
    expect(result.suggestedCategories).toEqual(expect.arrayContaining(["产品摄影", "微距摄影"]));
    // Genre path must not leak feature tags
    expect(result.suggestedTags).toEqual([]);
    expect(result.taxonomyPrimaryCategoryId).toBeTruthy();
    expect((result.taxonomySuggestions ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("caps a model that ignores the category count limit", () => {
    // 模型拿不到有效输入时会把分类目录整片倒回来（曾给一张人像写真返回
    // 产品摄影/食品摄影/风光摄影…）；截断到提示词里承诺的 6 个上限。
    const result = buildPromptAnalysisFromRemote(
      "",
      lifted({
        title: "",
        category: "肖像摄影",
        tags: ["产品摄影", "食品摄影", "风光摄影", "时尚摄影", "街头摄影", "概念摄影", "建筑摄影", "美妆摄影"],
        summary: "",
      }),
      "image-category",
      { taxonomy },
    );

    expect(result.primaryCategory).toBe("肖像摄影");
    expect(result.suggestedCategories.length).toBeLessThanOrEqual(10);
    // 同一内容类型域内的姊妹分类仍被收敛：商业摄影域最多保留 3 个。
    // （食品摄影已拆入独立「美食摄影」域，不再与商业姊妹一起收敛。）
    const commercialSiblings = ["产品摄影", "时尚摄影", "建筑摄影", "美妆摄影"];
    expect(
      result.suggestedCategories.filter((name) => commercialSiblings.includes(name)).length,
    ).toBeLessThanOrEqual(3);
  });

  it("keeps stable retrieval dimensions and drops visual-property categories", () => {
    const result = buildPromptAnalysisFromRemote(
      "",
      lifted({
        title: "",
        category: "肖像摄影",
        tags: ["写实主义", "宁静平和", "暖色主导", "浅景深", "个人写真", "中式国风", "复古怀旧", "社交媒体图文", "汉服造型"],
        summary: "汉服女子在湖边树下的写真",
      }),
      "image-category",
      { taxonomy },
    );

    expect(result.primaryCategory).toBe("肖像摄影");
    expect(result.suggestedCategories).toEqual(
      expect.arrayContaining(["写实主义", "个人写真", "中式国风", "汉服造型"]),
    );
    expect(result.suggestedCategories).not.toEqual(expect.arrayContaining(["宁静平和", "暖色主导", "浅景深"]));
  });

  it("maps prompt-category the same way as image-category", () => {
    const image = buildPromptAnalysisFromRemote(
      "street photography rainy night neon",
      lifted({ title: "", category: "街头摄影", tags: ["城市风光摄影"], summary: "" }),
      "image-category",
      { taxonomy },
    );
    const prompt = buildPromptAnalysisFromRemote(
      "street photography rainy night neon",
      lifted({ title: "", category: "街头摄影", tags: ["城市风光摄影"], summary: "" }),
      "prompt-category",
      { taxonomy },
    );
    expect(prompt.primaryCategory).toBe(image.primaryCategory);
    expect(prompt.suggestedCategories).toEqual(image.suggestedCategories);
  });

  it("keeps image-tags as features and strips genre names", () => {
    const result = buildPromptAnalysisFromRemote(
      "",
      lifted({
        title: "",
        category: "产品摄影",
        tags: ["香水", "玻璃瓶", "自然光斑", "产品摄影", "高级感", "黑色背景"],
        summary: "",
      }),
      "image-tags",
      { taxonomy },
    );

    expect(result.primaryCategory).toBe("未分类");
    expect(result.suggestedCategories).toEqual([]);
    expect(result.suggestedTags).toEqual(expect.arrayContaining(["香水", "玻璃瓶", "自然光斑"]));
    expect(result.suggestedTags).not.toContain("高级感");
    expect(result.suggestedTags).not.toContain("产品摄影");
    // 光线条件已是分类维度，柔光这类词不再从标签通道流出
    expect(result.suggestedTags).not.toContain("柔光");
  });

  it("never promotes the remote category field into tags", () => {
    const result = buildPromptAnalysisFromRemote(
      "",
      lifted({
        title: "",
        category: "白花",
        tags: ["绿叶", "窗景", "流苏耳饰", "前景花枝", "闭眼", "柔光", "浅景深", "视觉参考"],
        summary: "",
      }),
      "image-tags",
      { taxonomy },
    );

    expect(result.suggestedTags).toEqual(
      expect.arrayContaining(["绿叶", "窗景", "流苏耳饰", "前景花枝", "闭眼"]),
    );
    expect(result.suggestedTags).not.toEqual(
      expect.arrayContaining(["白花", "柔光", "浅景深", "视觉参考"]),
    );
  });

  it("keeps prompt-tags free of pseudo genres", () => {
    const result = buildPromptAnalysisFromRemote(
      "luxury black perfume soft light macro",
      lifted({
        title: "",
        category: "",
        tags: ["咖啡摄影", "高级感摄影", "自然光斑", "香水"],
        summary: "",
      }),
      "prompt-tags",
      { taxonomy },
    );
    expect(result.suggestedTags).not.toContain("咖啡摄影");
    expect(result.suggestedTags).not.toContain("高级感摄影");
    expect(result.suggestedTags).toEqual(expect.arrayContaining(["自然光斑", "香水"]));
  });

  it("strips adjective-decorated lighting compounds but keeps optical-product tags", () => {
    // 远程模型偶尔把「柔和暖调自然光」这类给光线方向/性质加形容词的复合词当特征词吐出。
    // 光线条件是分类维度，复合修饰后仍归分类，不得从标签通道流出；而「自然光斑」「轮廓光」
    // 是标签层光学产物（不以规范光线词收尾），必须保留。本地文本分析靠模板拆分把光线短语
    // 归到参数段，远程通道没有该步，只能靠 sanitize 边界拦截。
    const result = buildPromptAnalysisFromRemote(
      "",
      lifted({
        title: "",
        category: "",
        tags: ["柔和暖调自然光", "自然光斑", "轮廓光", "香水"],
        summary: "",
      }),
      "image-tags",
      { taxonomy },
    );

    expect(result.suggestedTags).not.toContain("柔和暖调自然光");
    expect(result.suggestedTags).toEqual(expect.arrayContaining(["自然光斑", "轮廓光", "香水"]));
  });

  it("strips adjective-decorated color-dominance and mood compounds but keeps concrete features", () => {
    // 光线之外的其它分类维度也会被远程模型加形容词拼成复合标签：色彩体系（「低饱和暖色主导」）
    // 与情绪氛围（「宁静温柔氛围」）是两个收尾无歧义的维度，必须拦回分类；而「香水」「玻璃瓶」是
    // 具体可指事物，须保留。收尾标记只认「色主导」「氛围」——不波及以「色调/色系」收尾的
    // 「青绿色调」这类保留标签（见 promptFilters 用例）。
    const result = buildPromptAnalysisFromRemote(
      "",
      lifted({
        title: "",
        category: "",
        tags: ["低饱和暖色主导", "宁静温柔氛围", "香水", "玻璃瓶"],
        summary: "",
      }),
      "image-tags",
      { taxonomy },
    );

    expect(result.suggestedTags).not.toContain("低饱和暖色主导");
    expect(result.suggestedTags).not.toContain("宁静温柔氛围");
    expect(result.suggestedTags).toEqual(expect.arrayContaining(["香水", "玻璃瓶"]));
  });
});

describe("remotePromptAnalysis V2 confidence adjudication", () => {
  const taxonomy = buildSystemCategoryTaxonomy("2026-01-01T00:00:00.000Z");

  it("drops below-floor padding categories from a genuine V2 result", () => {
    const result = buildPromptAnalysisFromRemote(
      "",
      genuine({
        summary: "汉服女子在湖边写真",
        categories: [
          { label: "肖像摄影", confidence: 0.92, primary: true },
          { label: "汉服造型", confidence: 0.55 },
          { label: "个人写真", confidence: 0.5 },
          // Low-signal padding the order-based cap used to let ride along.
          { label: "产品摄影", confidence: 0.15 },
        ],
      }),
      "image-category",
      { taxonomy },
    );

    expect(result.primaryCategory).toBe("肖像摄影");
    expect(result.suggestedCategories).toEqual(expect.arrayContaining(["汉服造型", "个人写真"]));
    expect(result.suggestedCategories).not.toContain("产品摄影");
  });

  it("elects the flagged primary and keeps it even below the confidence floor", () => {
    const result = buildPromptAnalysisFromRemote(
      "",
      genuine({
        categories: [
          // Higher confidence but not the primary.
          { label: "产品摄影", confidence: 0.9, primary: false },
          // Flagged primary sits below the floor yet must survive and lead.
          { label: "肖像摄影", confidence: 0.3, primary: true },
        ],
      }),
      "image-category",
      { taxonomy },
    );

    expect(result.primaryCategory).toBe("肖像摄影");
    expect(result.suggestedCategories).toEqual(expect.arrayContaining(["肖像摄影", "产品摄影"]));
  });

  it("ranks feature tags by confidence and drops weak ones for genuine V2", () => {
    const result = buildPromptAnalysisFromRemote(
      "",
      genuine({
        // Deliberately supplied ascending so a pass-through would keep this order.
        tags: [
          { label: "玻璃瓶", confidence: 0.4 },
          { label: "自然光斑", confidence: 0.6 },
          { label: "香水", confidence: 0.9 },
          { label: "弱标签", confidence: 0.2 },
        ],
      }),
      "image-tags",
      { taxonomy },
    );

    // Confidence-sorted, not input order; the sub-floor tag is gone.
    expect(result.suggestedTags).toEqual(["香水", "自然光斑", "玻璃瓶"]);
    expect(result.suggestedTags).not.toContain("弱标签");
  });

  it("orders genuine V2 feature tags by dimension, not raw confidence", () => {
    // Concrete dimensions (subject/scene) must lead; an aesthetic lighting tag
    // sorts last even at the highest confidence, proving dimension grouping
    // overrides raw score. 自然光斑 is a curated tag-layer lighting word, so it
    // survives the boundary and simply ranks behind the concrete features.
    const result = buildPromptAnalysisFromRemote(
      "",
      genuine({
        tags: [
          { label: "流苏耳饰", confidence: 0.9, dimension: "subject" },
          { label: "香水", confidence: 0.6, dimension: "subject" },
          { label: "窗景", confidence: 0.5, dimension: "scene" },
          { label: "自然光斑", confidence: 0.95, dimension: "lighting" },
        ],
      }),
      "image-tags",
      { taxonomy },
    );

    expect(result.suggestedTags).toEqual(["流苏耳饰", "香水", "窗景", "自然光斑"]);
  });

  it("does not floor-gate a legacy-lifted result even at low synthetic confidence", () => {
    // Same shape as the genuine tag test, but lifted from V1: the synthetic
    // gradient must not trigger gating, so every label survives (order kept).
    const result = buildPromptAnalysisFromRemote(
      "",
      lifted({
        title: "",
        category: "",
        tags: ["玻璃瓶", "自然光斑", "香水", "银色喷头"],
        summary: "",
      }),
      "image-tags",
      { taxonomy },
    );

    expect(result.suggestedTags).toEqual(
      expect.arrayContaining(["玻璃瓶", "自然光斑", "香水", "银色喷头"]),
    );
  });
});

describe("remotePromptAnalysis V2 evidence adjudication", () => {
  const taxonomy = buildSystemCategoryTaxonomy("2026-01-01T00:00:00.000Z");

  it("drops a genuine V2 category the model scored but left unjustified (empty evidence)", () => {
    const result = buildPromptAnalysisFromRemote(
      "",
      genuine({
        summary: "汉服女子在湖边写真",
        categories: [
          { label: "肖像摄影", confidence: 0.92, primary: true, evidence: ["湖边写真"] },
          { label: "汉服造型", confidence: 0.6, evidence: ["汉服"] },
          // Clears the confidence floor, but no evidence → unjustified padding.
          { label: "产品摄影", confidence: 0.8, evidence: [] },
        ],
      }),
      "image-category",
      { taxonomy },
    );

    expect(result.primaryCategory).toBe("肖像摄影");
    expect(result.suggestedCategories).toEqual(expect.arrayContaining(["汉服造型"]));
    expect(result.suggestedCategories).not.toContain("产品摄影");
  });

  it("keeps the elected primary category even when its evidence is empty", () => {
    const result = buildPromptAnalysisFromRemote(
      "",
      genuine({
        categories: [
          // Primary carries neither high confidence nor evidence, yet must land.
          { label: "肖像摄影", confidence: 0.3, primary: true, evidence: [] },
          { label: "产品摄影", confidence: 0.9, evidence: ["产品"] },
        ],
      }),
      "image-category",
      { taxonomy },
    );

    expect(result.primaryCategory).toBe("肖像摄影");
    expect(result.suggestedCategories).toEqual(expect.arrayContaining(["肖像摄影", "产品摄影"]));
  });

  it("drops a genuine V2 feature tag with no supporting evidence", () => {
    const result = buildPromptAnalysisFromRemote(
      "",
      genuine({
        tags: [
          { label: "香水", confidence: 0.9, dimension: "subject", evidence: ["瓶身"] },
          // 玻璃瓶 is normally a kept feature tag; here it is pruned purely for
          // lacking evidence, not by sanitization.
          { label: "玻璃瓶", confidence: 0.8, dimension: "subject", evidence: [] },
        ],
      }),
      "image-tags",
      { taxonomy },
    );

    expect(result.suggestedTags).toContain("香水");
    expect(result.suggestedTags).not.toContain("玻璃瓶");
  });
});
