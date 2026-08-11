import { describe, expect, it } from "vitest";
import type { LibraryItem } from "@/features/library/types/library";
import {
  groupPromptImages,
  resolvePromptGroupPatchItemIds,
  spreadPromptGroupImages,
} from "@/features/library/utils/promptImageGroups";
import { toPromptCardData } from "@/features/library/utils/promptFilters";

function makeItem(patch: Partial<LibraryItem>): LibraryItem {
  return {
    id: "image-1",
    title: "结构化文本生成器",
    imageFileName: "image-1.png",
    prompt: "整理中文文档并输出行动清单。",
    negativePrompt: "",
    tags: ["文本生成器", "写作指南"],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...patch,
  };
}

describe("promptImageGroups", () => {
  it("groups multiple images that share the same prompt identity", () => {
    const cards = [
      makeItem({ id: "image-a", imageFileName: "a.png" }),
      makeItem({ id: "image-b", imageFileName: "b.png", createdAt: "2026-07-02T00:00:00.000Z" }),
      makeItem({ id: "career", title: "职业发展路线规划", prompt: "规划职业路线。", imageFileName: "career.png" }),
    ].map(toPromptCardData);

    const groups = groupPromptImages(cards, []);
    const multiImageGroup = groups.find((group) => group.items.some((item) => item.id === "image-a"));
    const singleImageGroup = groups.find((group) => group.items.some((item) => item.id === "career"));

    expect(groups).toHaveLength(2);
    expect(singleImageGroup?.items.map((item) => item.id)).toEqual(["career"]);
    expect(multiImageGroup?.items.map((item) => item.id)).toEqual(["image-a", "image-b"]);
  });

  it("keeps repeated generations with unchanged prompt text in one group and appends later effects", () => {
    const cards = [
      makeItem({
        id: "generated-original",
        imageFileName: "generated-original.png",
        title: "AI generated image",
        prompt: "A quiet lake at sunrise",
        negativePrompt: "text, watermark",
        generationMethod: "model-a",
        tags: [],
        createdAt: "2026-07-30T01:00:00.000Z",
      }),
      makeItem({
        id: "generated-later",
        imageFileName: "generated-later.webp",
        title: "AI generated image",
        prompt: "A quiet lake at sunrise",
        negativePrompt: "text, watermark",
        generationMethod: "model-b",
        tags: [],
        createdAt: "2026-07-31T01:00:00.000Z",
      }),
    ].map(toPromptCardData);

    const [group] = groupPromptImages(cards, []);

    expect(group.items.map((item) => item.id)).toEqual(["generated-original", "generated-later"]);
    expect(group.primaryItem.id).toBe("generated-original");
  });

  it("appends canvas generations that inherit the origin group identity, and splits when the prompt changed", () => {
    // 「传送到画布」血缘继承：提示词未改时新图带上来源组的 title/tags/category，
    // 分组键与原组一致 → 追加为原组效果图；改过提示词 → 键不同 → 另立新组。
    const originGroup = {
      title: "新中式茶室",
      prompt: "一间临水而建的新中式茶室",
      negativePrompt: "低清晰度",
      tags: ["茶室", "新中式"],
      category: "室内设计",
    };
    const cards = [
      makeItem({
        id: "origin-image",
        imageFileName: "origin.png",
        ...originGroup,
        createdAt: "2026-08-01T00:00:00.000Z",
      }),
      // 继承身份的画布生成图（提示词未改）。
      makeItem({
        id: "canvas-inherited",
        imageFileName: "canvas-1.png",
        ...originGroup,
        generationMethod: "gpt-image-2",
        createdAt: "2026-08-02T00:00:00.000Z",
      }),
      // 改过提示词的画布生成图：AI 另起标题、无标签分类。
      makeItem({
        id: "canvas-edited",
        imageFileName: "canvas-2.png",
        title: "黄昏茶室",
        prompt: "一间临水而建的新中式茶室，黄昏光线",
        negativePrompt: "低清晰度",
        tags: [],
        category: undefined,
        generationMethod: "gpt-image-2",
        createdAt: "2026-08-02T01:00:00.000Z",
      }),
    ].map(toPromptCardData);

    const groups = groupPromptImages(cards, []);
    const originGroupResult = groups.find((group) => group.items.some((item) => item.id === "origin-image"));

    expect(groups).toHaveLength(2);
    expect(originGroupResult?.items.map((item) => item.id)).toEqual(["origin-image", "canvas-inherited"]);
    // 原图仍是第一张，继承图按时间追加在后（AGENTS.md 提示词组顺序铁律）。
    expect(originGroupResult?.primaryItem.id).toBe("origin-image");
  });

  it("keeps the original image first even when a later image is liked", () => {
    const cards = [
      makeItem({ id: "old", createdAt: "2026-07-01T00:00:00.000Z" }),
      makeItem({ id: "new", createdAt: "2026-07-03T00:00:00.000Z" }),
    ].map(toPromptCardData);

    const [group] = groupPromptImages(cards, ["old"]);

    expect(group.items.map((item) => item.id)).toEqual(["old", "new"]);
    expect(group.primaryItem.id).toBe("old");
  });

  it("keeps the earliest original image first even when it is missing", () => {
    const cards = [
      makeItem({ id: "available", createdAt: "2026-07-03T00:00:00.000Z" }),
      makeItem({
        id: "missing",
        createdAt: "2026-07-01T00:00:00.000Z",
        mediaStorage: {
          kind: "external",
          rootId: "root-1",
          relativePath: "missing.png",
          status: "missing",
        },
      }),
    ].map(toPromptCardData);

    const [group] = groupPromptImages(cards, []);

    expect(group.primaryItem.id).toBe("missing");
    expect(group.items.map((item) => item.id)).toEqual(["missing", "available"]);
  });

  it("uses the actual video file as the primary item in video prompt groups", () => {
    const cards = [
      makeItem({
        id: "cover",
        imageFileName: "cover.jpg",
        prompt: "Seedance 2.0 video prompt with cinematic camera motion.",
        promptType: "video",
        tags: ["视频提示词"],
      }),
      makeItem({
        id: "clip",
        imageFileName: "clip.mp4",
        prompt: "Seedance 2.0 video prompt with cinematic camera motion.",
        promptType: "video",
        tags: ["视频提示词"],
      }),
    ].map(toPromptCardData);

    const [group] = groupPromptImages(cards, []);

    expect(group.primaryItem.id).toBe("clip");
    expect(group.items.map((item) => item.id)).toEqual(["clip", "cover"]);
  });

  it("spreads images from the same group across the masonry sequence", () => {
    const cards = [
      makeItem({ id: "a-1", title: "A", prompt: "同组 A", createdAt: "2026-07-03T00:00:00.000Z" }),
      makeItem({ id: "a-2", title: "A", prompt: "同组 A", createdAt: "2026-07-02T00:00:00.000Z" }),
      makeItem({ id: "b-1", title: "B", prompt: "同组 B", createdAt: "2026-07-03T00:00:00.000Z" }),
      makeItem({ id: "b-2", title: "B", prompt: "同组 B", createdAt: "2026-07-02T00:00:00.000Z" }),
    ].map(toPromptCardData);

    const groups = groupPromptImages(cards, []);

    expect(spreadPromptGroupImages(groups).map((item) => item.id)).toEqual(["a-2", "b-2", "a-1", "b-1"]);
  });

  it("groups blank media imported in the same batch without mixing different blank batches", () => {
    const cards = [
      makeItem({
        id: "blank-a",
        title: "",
        imageFileName: "blank-a.png",
        prompt: "",
        negativePrompt: "",
        tags: [],
        createdAt: "2026-07-08T00:00:00.000Z",
      }),
      makeItem({
        id: "blank-b",
        title: "",
        imageFileName: "blank-b.mp4",
        prompt: "",
        negativePrompt: "",
        tags: [],
        createdAt: "2026-07-08T00:00:00.000Z",
      }),
      makeItem({
        id: "blank-c",
        title: "",
        imageFileName: "blank-c.png",
        prompt: "",
        negativePrompt: "",
        tags: [],
        createdAt: "2026-07-09T00:00:00.000Z",
      }),
    ].map(toPromptCardData);

    const groups = groupPromptImages(cards, []);
    const importedBatchGroup = groups.find((group) => group.items.some((item) => item.id === "blank-a"));
    const otherBlankGroup = groups.find((group) => group.items.some((item) => item.id === "blank-c"));

    expect(groups).toHaveLength(2);
    expect(importedBatchGroup?.items.map((item) => item.id)).toEqual(["blank-a", "blank-b"]);
    expect(otherBlankGroup?.items.map((item) => item.id)).toEqual(["blank-c"]);
  });

  it("syncs shared prompt edits to every image in the current prompt group", () => {
    const items = [
      makeItem({ id: "a-1", title: "A", prompt: "同组 A", imageFileName: "a-1.png" }),
      makeItem({ id: "a-2", title: "A", prompt: "同组 A", imageFileName: "a-2.png" }),
      makeItem({ id: "b-1", title: "B", prompt: "同组 B", imageFileName: "b-1.png" }),
    ];
    const targetIds = resolvePromptGroupPatchItemIds(items, "a-1", { prompt: "同组 A 修改后" });
    const targetIdSet = new Set(targetIds);
    const nextItems = items.map((item) => (targetIdSet.has(item.id) ? { ...item, prompt: "同组 A 修改后" } : item));

    expect(targetIds).toEqual(["a-1", "a-2"]);
    expect(groupPromptImages(nextItems.map(toPromptCardData), [])).toHaveLength(2);
    expect(
      groupPromptImages(nextItems.map(toPromptCardData), [])
        .find((group) => group.items.some((item) => item.id === "a-1"))
        ?.items.map((item) => item.id),
    ).toEqual(["a-1", "a-2"]);
  });

  it("keeps image-only edits scoped to the current effect image", () => {
    const items = [
      makeItem({ id: "a-1", title: "A", prompt: "同组 A", imageFileName: "a-1.png" }),
      makeItem({ id: "a-2", title: "A", prompt: "同组 A", imageFileName: "a-2.png" }),
    ];

    expect(resolvePromptGroupPatchItemIds(items, "a-1", { imageFileName: "a-1-new.png" })).toEqual(["a-1"]);
  });

  it("syncs prompt type edits to every image in the current prompt group", () => {
    const items = [
      makeItem({ id: "a-1", title: "A", prompt: "同组 A", imageFileName: "a-1.png" }),
      makeItem({ id: "a-2", title: "A", prompt: "同组 A", imageFileName: "a-2.png" }),
    ];

    expect(resolvePromptGroupPatchItemIds(items, "a-1", { promptType: "video" })).toEqual(["a-1", "a-2"]);
  });
});
