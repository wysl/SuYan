import { describe, expect, it } from "vitest";
import {
  createImportPromptContentKey,
  planImportImageGroups,
  summarizeImportPromptGroups,
  type PreparedImportImage,
} from "../../electron/main/library/imageImportGrouping";
import { createEmptyPromptImportDraft } from "../../electron/shared/promptImportParser";

function makeImage(name: string, draft: Partial<ReturnType<typeof createEmptyPromptImportDraft>>): PreparedImportImage {
  return {
    name,
    data: new Uint8Array([1, 2, 3]),
    draft: {
      ...createEmptyPromptImportDraft(),
      ...draft,
    },
  };
}

describe("image import grouping", () => {
  it("puts identical prompts into one group and different prompts into separate groups", () => {
    const plans = planImportImageGroups([
      makeImage("a.png", { prompt: "cinematic portrait, soft light", title: "A" }),
      makeImage("b.png", { prompt: "cinematic portrait, soft light", title: "B" }),
      makeImage("c.png", { prompt: "cyberpunk street at night", title: "C" }),
    ]);

    expect(plans).toHaveLength(2);
    const portrait = plans.find((plan) => plan.draft.prompt.includes("cinematic"));
    const cyber = plans.find((plan) => plan.draft.prompt.includes("cyberpunk"));
    expect(portrait?.images).toHaveLength(2);
    expect(cyber?.images).toHaveLength(1);
    // Canonical draft unifies title for the identical-prompt group
    expect(portrait?.draft.title).toBeTruthy();
    expect(portrait?.images.map((image) => image.name).sort()).toEqual(["a.png", "b.png"]);
  });

  it("treats whitespace/case-equivalent prompts as the same group", () => {
    const left = createImportPromptContentKey({
      ...createEmptyPromptImportDraft(),
      prompt: "  Soft   Light  ",
    });
    const right = createImportPromptContentKey({
      ...createEmptyPromptImportDraft(),
      prompt: "soft light",
    });
    expect(left).toBe(right);
  });

  it("groups blank images together and marks them without prompt content", () => {
    const plans = planImportImageGroups([
      makeImage("1.jpg", {}),
      makeImage("2.jpg", {}),
      makeImage("3.png", { prompt: "only this one has text" }),
    ]);

    expect(plans).toHaveLength(2);
    const blank = plans.find((plan) => !plan.hasPromptContent);
    const withPrompt = plans.find((plan) => plan.hasPromptContent);
    expect(blank?.images).toHaveLength(2);
    expect(withPrompt?.images).toHaveLength(1);

    const summary = summarizeImportPromptGroups(plans);
    expect(summary.some((item) => item.imageCount === 2 && !item.hasPromptContent)).toBe(true);
    expect(summary.some((item) => item.promptPreview.includes("only this one"))).toBe(true);
  });

  it("keeps different negatives as different groups even if positive matches", () => {
    const plans = planImportImageGroups([
      makeImage("a.png", { prompt: "same positive", negativePrompt: "blurry" }),
      makeImage("b.png", { prompt: "same positive", negativePrompt: "low quality" }),
    ]);
    expect(plans).toHaveLength(2);
  });
});
