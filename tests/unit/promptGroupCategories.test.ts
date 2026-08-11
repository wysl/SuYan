import { describe, expect, it } from "vitest";
import { createEmptyCategoryTaxonomy } from "@/features/library/utils/categoryTaxonomy";
import {
  getPromptGroupCategoryLabels,
  getPromptGroupCategoryMembershipKeys,
} from "@/features/library/utils/promptGroupCategories";
import type { PromptCardData } from "@/features/library/utils/promptFilters";
import type { PromptImageGroup } from "@/features/library/utils/promptImageGroups";

describe("promptGroupCategories", () => {
  it("keeps secondary genreIds visible to the category browser", () => {
    const group = makeGroup(
      makeCard({
        category: "黄昏",
        categoryId: "system:季节时令:黄昏",
        genreIds: [
          "system:季节时令:黄昏",
          "system:插画绘画:数字插画",
          "system:插画绘画:奇幻插画",
          "system:主题领域:历史文化",
          "system:场景类型:户外自然",
        ],
      }),
    );
    const taxonomy = createEmptyCategoryTaxonomy("2026-07-28T00:00:00.000Z");

    expect(getPromptGroupCategoryLabels(group, taxonomy)).toEqual([
      "黄昏",
      "数字插画",
      "奇幻插画",
      "历史文化",
      "户外自然",
    ]);
    expect(getPromptGroupCategoryMembershipKeys(group).categoryIds).toEqual([
      "system:季节时令:黄昏",
      "system:插画绘画:数字插画",
      "system:插画绘画:奇幻插画",
      "system:主题领域:历史文化",
      "system:场景类型:户外自然",
    ]);
  });
});

function makeGroup(primaryItem: PromptCardData): PromptImageGroup {
  return {
    id: "group-1",
    items: [primaryItem],
    previewItems: [primaryItem],
    primaryItem,
  };
}

function makeCard(patch: Partial<PromptCardData>): PromptCardData {
  return {
    id: "item-1",
    title: "长发侠客剪影",
    prompt: "",
    category: "",
    categoryId: null,
    genreIds: [],
    categoryConfidence: null,
    categorySource: null,
    tags: [],
    hot: 0,
    createdAt: 0,
    updatedAt: 0,
    imageFileName: "item-1.jpg",
    negativePrompt: "",
    author: null,
    authorUrl: null,
    authorAvatarUrl: null,
    sourceUrl: null,
    generationMethod: "",
    promptType: "image",
    sourceKind: "local",
    nsfwRating: "unknown",
    mediaStatus: null,
    videoDurationSec: null,
    videoPosterFileName: null,
    videoKeyframes: [],
    videoReferenceImages: [],
    searchText: "",
    ...patch,
  };
}
