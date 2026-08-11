import { describe, expect, it } from "vitest";
import {
  isNsfwItem,
  normalizeNsfwRating,
  resolveNsfwRatingFromRemoteAnalysis,
  resolveNsfwRatingFromRemoteAnalysisV2,
  shouldGradeNsfwItem,
} from "@/features/library/utils/nsfwRating";
import { remoteAnalysisV2FromLegacy } from "@/features/library/utils/remoteAnalysisV2";
import type { RemoteAnalysisSafetyRating, RemotePromptAnalysisV2 } from "@/features/library/types/ai";

function safetyV2(rating: RemoteAnalysisSafetyRating, confidence: number, summary = ""): RemotePromptAnalysisV2 {
  return {
    schemaVersion: 2,
    title: "",
    summary,
    categories: [],
    tags: [],
    safety: { rating, confidence, evidence: [] },
    warnings: [],
  };
}

describe("nsfwRating", () => {
  it("normalizes unknown or invalid ratings", () => {
    expect(normalizeNsfwRating("safe")).toBe("safe");
    expect(normalizeNsfwRating("nsfw")).toBe("nsfw");
    expect(normalizeNsfwRating("anything")).toBe("unknown");
    expect(normalizeNsfwRating(undefined)).toBe("unknown");
  });

  it("detects NSFW library items", () => {
    expect(isNsfwItem({ nsfwRating: "nsfw" })).toBe(true);
    expect(isNsfwItem({ nsfwRating: "safe" })).toBe(false);
  });

  it("only grades unclassified images unless forced", () => {
    expect(shouldGradeNsfwItem({ imageFileName: "image.png", nsfwRating: "unknown" })).toBe(true);
    expect(shouldGradeNsfwItem({ imageFileName: "image.png", nsfwRating: "safe" })).toBe(false);
    expect(shouldGradeNsfwItem({ imageFileName: "image.png", nsfwRating: "safe" }, { force: true })).toBe(true);
    expect(shouldGradeNsfwItem({ imageFileName: "clip.mp4", nsfwRating: "unknown" }, { force: true })).toBe(false);
    expect(shouldGradeNsfwItem({ imageFileName: "", nsfwRating: "unknown" })).toBe(false);
    expect(
      shouldGradeNsfwItem({
        imageFileName: "missing.png",
        mediaStorage: { kind: "external", rootId: "root-1", relativePath: "missing.png", status: "missing" },
        nsfwRating: "unknown",
      }),
    ).toBe(false);
  });

  it("resolves remote NSFW and SFW labels", () => {
    expect(
      resolveNsfwRatingFromRemoteAnalysis({
        title: "",
        category: "NSFW",
        tags: ["NSFW"],
        summary: "成人内容",
      }),
    ).toBe("nsfw");
    expect(
      resolveNsfwRatingFromRemoteAnalysis({
        title: "",
        category: "SFW",
        tags: ["SFW"],
        summary: "普通时尚人像",
      }),
    ).toBe("safe");
  });

  it("does not treat safe explanations that mention NSFW words as NSFW", () => {
    expect(
      resolveNsfwRatingFromRemoteAnalysis({
        title: "",
        category: "SFW",
        tags: ["SFW"],
        summary: "普通人像，无明显成人色情或裸露，不属于 NSFW。",
      }),
    ).toBe("safe");
    expect(
      resolveNsfwRatingFromRemoteAnalysis({
        title: "",
        category: "",
        tags: [],
        summary: "泳装日常照，但没有明显成人露骨内容，非 NSFW。",
      }),
    ).toBe("safe");
  });

  it("still resolves explicit unsafe explanations as NSFW", () => {
    expect(
      resolveNsfwRatingFromRemoteAnalysis({
        title: "",
        category: "",
        tags: [],
        summary: "存在明显裸露和成人色情内容。",
      }),
    ).toBe("nsfw");
  });
});

describe("resolveNsfwRatingFromRemoteAnalysisV2", () => {
  it("honors a confident structured nsfw verdict", () => {
    expect(resolveNsfwRatingFromRemoteAnalysisV2(safetyV2("nsfw", 0.9))).toBe("nsfw");
  });

  it("honors a confident structured safe verdict", () => {
    expect(resolveNsfwRatingFromRemoteAnalysisV2(safetyV2("safe", 0.9))).toBe("safe");
  });

  it("does not force-flag a suggestive verdict as nsfw", () => {
    // suggestive 低于 NSFW 门槛：不直接判 nsfw，回退启发式（无文本证据 → unknown）
    expect(resolveNsfwRatingFromRemoteAnalysisV2(safetyV2("suggestive", 0.95))).toBe("unknown");
  });

  it("ignores a sub-confidence structured verdict and falls back to the heuristic", () => {
    // 置信度低于门槛：结构化信号不采信，回退到（此处为空的）文本启发式
    expect(resolveNsfwRatingFromRemoteAnalysisV2(safetyV2("nsfw", 0.3))).toBe("unknown");
  });

  it("still catches an explicit summary when the structured verdict is weak", () => {
    // 低置信 + summary 明确露骨 → 回退启发式仍判 nsfw
    expect(
      resolveNsfwRatingFromRemoteAnalysisV2(safetyV2("nsfw", 0.2, "存在明显裸露和成人色情内容。")),
    ).toBe("nsfw");
  });

  it("preserves legacy-lifted safety behavior via the collapsed category label", () => {
    // 旧扁平安全响应被 lift 后 safety.confidence=0，判定仍从 categories[0].label 取
    expect(
      resolveNsfwRatingFromRemoteAnalysisV2(
        remoteAnalysisV2FromLegacy({ title: "", category: "NSFW", tags: ["NSFW"], summary: "" }),
      ),
    ).toBe("nsfw");
    expect(
      resolveNsfwRatingFromRemoteAnalysisV2(
        remoteAnalysisV2FromLegacy({ title: "", category: "SFW", tags: ["SFW"], summary: "" }),
      ),
    ).toBe("safe");
  });
});
