import { describe, expect, it } from "vitest";
import {
  existingEntryFitPrior,
  maxAnalysisResultCount,
  mergeAnalysisLabelsWithFitCap,
} from "../../src/features/library/utils/analysisMergeCap";

const range = (count: number, prefix: string) =>
  Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);

describe("mergeAnalysisLabelsWithFitCap", () => {
  it("appends without touching existing content while under the cap", () => {
    expect(
      mergeAnalysisLabelsWithFitCap({
        existing: ["肖像摄影", "少女写真"],
        incoming: ["汉服造型", "宁静平和"],
      }),
    ).toEqual(["肖像摄影", "少女写真", "汉服造型", "宁静平和"]);
  });

  it("never duplicates a label the item already has", () => {
    expect(
      mergeAnalysisLabelsWithFitCap({
        existing: ["肖像摄影", "少女写真"],
        incoming: ["少女写真", "汉服造型"],
      }),
    ).toEqual(["肖像摄影", "少女写真", "汉服造型"]);
  });

  it("caps the total at 15", () => {
    const merged = mergeAnalysisLabelsWithFitCap({
      existing: range(15, "旧"),
      incoming: range(10, "新"),
    });

    expect(merged).toHaveLength(maxAnalysisResultCount);
  });

  it("replaces the weakest entries with better-matching new results once full", () => {
    const merged = mergeAnalysisLabelsWithFitCap({
      existing: range(15, "旧"),
      incoming: ["最匹配", "次匹配"],
    });

    expect(merged).toHaveLength(15);
    // 高匹配度的新结果挤进来
    expect(merged).toContain("最匹配");
    expect(merged).toContain("次匹配");
    // 被顶掉的是既有队列里最靠后的两个
    expect(merged).not.toContain("旧14");
    expect(merged).not.toContain("旧15");
    // 靠前的既有内容原样保留，顺序不变
    expect(merged.slice(0, 13)).toEqual(range(13, "旧"));
  });

  it("keeps low-ranked padding out instead of evicting existing content", () => {
    // AI 排名靠后的结果匹配度低于既有先验，顶不掉旧内容。
    const incoming = range(12, "凑数");
    const merged = mergeAnalysisLabelsWithFitCap({
      existing: range(15, "旧"),
      incoming,
    });

    // 只有排名最靠前、分值高于先验的几个才挤得进来
    expect(merged).toContain("凑数1");
    expect(merged).not.toContain("凑数12");
    expect(merged).toHaveLength(15);
  });

  it("protects the primary category from being replaced", () => {
    const merged = mergeAnalysisLabelsWithFitCap({
      existing: ["肖像摄影", ...range(14, "旧")],
      incoming: ["最匹配"],
      protectedCount: 1,
    });

    expect(merged[0]).toBe("肖像摄影");
    expect(merged).toContain("最匹配");
    expect(merged).toHaveLength(15);
  });

  it("treats an explicit existing prior as the replacement threshold", () => {
    // 先验拉满时，任何新结果都顶不掉既有内容。
    const merged = mergeAnalysisLabelsWithFitCap({
      existing: range(15, "旧"),
      incoming: ["最匹配"],
      existingFit: 1,
    });

    expect(merged).toEqual(range(15, "旧"));
    expect(existingEntryFitPrior).toBeLessThan(1);
  });

  it("drops blank labels and respects a zero cap", () => {
    expect(mergeAnalysisLabelsWithFitCap({ existing: ["  ", ""], incoming: ["肖像摄影"] })).toEqual([
      "肖像摄影",
    ]);
    expect(mergeAnalysisLabelsWithFitCap({ existing: ["肖像摄影"], incoming: [], maxCount: 0 })).toEqual([]);
  });
});
