import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAPSULE_TONES, getCapsuleToneClassName, type CapsuleTone } from "../../src/components/ui/capsuleTones";

const srcDir = path.resolve("src");

function readSrc(relativePath: string): string {
  return readFileSync(path.join(srcDir, relativePath), "utf8");
}

const EXPECTED_TONES: CapsuleTone[] = [
  "sage",
  "mist",
  "clay",
  "lavender",
  "fog",
  "rose",
  "sand",
  "stone",
  "primary",
];

const EXPECTED_FIELDS = [
  "solid",
  "outline",
  "selected",
  "indicatorBg",
  "borderHover",
  "buttonOutline",
  "iconTone",
] as const;

describe("capsule tone map (single source of truth)", () => {
  it("covers all 9 tones with every variant field", () => {
    for (const tone of EXPECTED_TONES) {
      expect(CAPSULE_TONES[tone], `tone ${tone} missing`).toBeDefined();
      for (const field of EXPECTED_FIELDS) {
        expect(
          CAPSULE_TONES[tone][field],
          `tone ${tone} field ${field} missing`,
        ).toBeTruthy();
      }
    }
  });

  it("solid field follows the border/bg/text triplet pattern for capsule tones", () => {
    const capsuleTones = EXPECTED_TONES.filter((tone) => tone !== "primary");
    for (const tone of capsuleTones) {
      const solid = CAPSULE_TONES[tone].solid;
      expect(solid, `tone ${tone}`).toContain(`border-capsule-${tone}-border`);
      expect(solid, `tone ${tone}`).toContain(`bg-capsule-${tone} `);
      expect(solid, `tone ${tone}`).toContain(`text-capsule-${tone}-foreground`);
    }
  });

  it("selected field uses the capsule→panel gradient with elevated shadow", () => {
    for (const tone of EXPECTED_TONES.filter((t) => t !== "primary")) {
      const selected = CAPSULE_TONES[tone].selected;
      expect(selected).toContain(`var(--color-capsule-${tone})`);
      expect(selected).toContain("var(--color-panel)");
      expect(selected).toContain("shadow-elevated");
    }
  });

  it("getCapsuleToneClassName falls back to solid for unknown variants", () => {
    expect(getCapsuleToneClassName("sage")).toBe(CAPSULE_TONES.sage.solid);
    expect(getCapsuleToneClassName("mist", "selected")).toBe(CAPSULE_TONES.mist.selected);
  });
});

describe("Capsule component contract", () => {
  it("defaults to pill shape, sm size, and interactive feedback", () => {
    const source = readSrc("components/ui/Capsule.tsx");

    // Shape default is pill (rounded-full).
    expect(source).toMatch(/shape\s*=\s*"pill"/);
    expect(source).toContain('"rounded-full"');
    // Size default is sm with the canonical prompt-capsule typography.
    expect(source).toMatch(/size\s*=\s*"sm"/);
    expect(source).toContain("px-2 py-0.5 text-[11px] font-semibold leading-5");
    // Interactive buttons get elevated shadow + focus ring + disabled state.
    expect(source).toContain("shadow-elevated");
    expect(source).toContain("focus-visible:ring-2 focus-visible:ring-primary/30");
    expect(source).toContain("disabled:cursor-not-allowed disabled:opacity-60");
    // Truncation: max-w-full on the capsule, min-w-0 truncate on the label.
    expect(source).toContain("max-w-full");
    expect(source).toContain("min-w-0 truncate");
    // Consumes the single-source tone map.
    expect(source).toContain("CAPSULE_TONES");
  });
});

describe("capsule color maps derive from CAPSULE_TONES (no literal triplets)", () => {
  it("PromptDetailDialog tone-by-variable uses CAPSULE_TONES[tone].solid", () => {
    const source = readSrc("features/library/components/PromptDetailDialog.tsx");
    const functionBlock = source.match(
      /function getPromptCapsuleToneClassName[\s\S]*?\n}/,
    )?.[0] ?? "";

    expect(functionBlock).not.toBe("");
    expect(functionBlock).toContain("CAPSULE_TONES[tone].solid");
    // No hand-written capsule triplet should remain inside the function body.
    expect(functionBlock).not.toMatch(/border-capsule-\w+-border bg-capsule-\w+ text-capsule-\w+-foreground/);
  });

  it("PromptSiteRecommendations palette is derived from CAPSULE_TONES", () => {
    const source = readSrc(
      "features/library/components/recommendations/PromptSiteRecommendations.tsx",
    );
    const paletteBlock = source.match(
      /export const promptSiteCardToneClassNames[\s\S]*?\n\);/,
    )?.[0] ?? "";

    expect(paletteBlock).not.toBe("");
    expect(paletteBlock).toContain("PROMPT_SITE_CARD_TONES.map");
    expect(paletteBlock).toContain("CAPSULE_TONES[tone]");
    // The derived block must not contain literal capsule triplets.
    expect(paletteBlock).not.toMatch(/border-capsule-\w+-border bg-capsule-\w+ text-capsule-\w+-foreground/);
  });

  it("LibraryView radialSortOptions consumes CAPSULE_TONES", () => {
    const source = readSrc("features/library/components/LibraryView.tsx");
    const radialBlock = source.match(
      /const radialSortOptions[\s\S]*?\n\];/,
    )?.[0] ?? "";

    expect(radialBlock).not.toBe("");
    expect(radialBlock).toContain("CAPSULE_TONES.");
    expect(radialBlock).not.toMatch(/border-capsule-\w+-border bg-capsule-\w+ text-capsule-\w+-foreground/);
  });
});
