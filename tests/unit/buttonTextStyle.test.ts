import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcDir = path.resolve("src");

function readSrc(relativePath: string): string {
  return readFileSync(path.join(srcDir, relativePath), "utf8");
}

describe("button text overflow handling", () => {
  it("Button caps its own width and lets the label truncate inside flex", () => {
    const source = readSrc("components/ui/Button.tsx");

    // Button itself must never overflow its parent row.
    expect(source).toContain("max-w-full");
    // Inner label span must be allowed to shrink so `truncate` can trigger.
    expect(source).toContain("min-w-0 truncate");
    // A default max-width cap is provided so a single label cannot dominate a row.
    expect(source).toContain('maxWidth = "16rem"');
    // String labels surface a native tooltip when truncated.
    expect(source).toContain("resolvedTitle");
  });

  it("Button supports a multiline fallback for small fixed-width containers", () => {
    const source = readSrc("components/ui/Button.tsx");

    expect(source).toContain("multiline");
    expect(source).toContain("whitespace-normal break-words");
  });

  it("ConfirmBubble action buttons wrap instead of overflowing their grid cell", () => {
    const source = readSrc("components/ui/ConfirmBubble.tsx");

    // Grid items need min-w-0 to shrink, and text must wrap rather than clip.
    expect(source).toContain("min-w-0");
    expect(source).toContain("break-words");
    expect(source).toContain("text-center");
  });

  it("IconTooltipButton tooltip bubble wraps long labels instead of overflowing", () => {
    const source = readSrc("styles/tokens.css");

    // There are multiple `.icon-tooltip-button__bubble` blocks (a narrow-screen
    // override reuses the same selector). Pick the main one by its unique props.
    const bubbleBlocks = [
      ...source.matchAll(/\.icon-tooltip-button__bubble\s*\{[^}]*\}/g),
    ].map((match) => match[0]);
    const bubbleBlock =
      bubbleBlocks.find((block) => block.includes("background: var(--color-primary)")) ?? "";

    expect(bubbleBlock).not.toBe("");
    // nowrap + max-width without overflow:hidden caused long labels to escape
    // the bubble. Wrapping is the correct behaviour for a tooltip.
    expect(bubbleBlock).not.toContain("white-space: nowrap");
    expect(bubbleBlock).toContain("white-space: normal");
    expect(bubbleBlock).toContain("word-break: break-word");
  });
});
