import { describe, expect, it } from "vitest";
import {
  selectRandomStartupGalleryImages,
  startupGalleryDisplayCount,
} from "../../src/features/library/utils/startupGallerySelection";

describe("startup gallery selection", () => {
  it("selects six unique images when the gallery has enough entries", () => {
    const images = ["a", "b", "c", "d", "e", "f", "g"];
    const selected = selectRandomStartupGalleryImages(images, startupGalleryDisplayCount, () => 0);

    expect(selected).toHaveLength(6);
    expect(new Set(selected)).toHaveLength(6);
    expect(selected.every((image) => images.includes(image))).toBe(true);
  });

  it("fills all six positions when the gallery has fewer images", () => {
    const selected = selectRandomStartupGalleryImages(["a", "b", "c"], 6, () => 0.5);

    expect(selected).toHaveLength(6);
    expect(new Set(selected)).toEqual(new Set(["a", "b", "c"]));
  });

  it("uses the random source to change image placement", () => {
    const images = ["a", "b", "c", "d", "e", "f"];
    const lowRandom = selectRandomStartupGalleryImages(images, 6, () => 0);
    const highRandom = selectRandomStartupGalleryImages(images, 6, () => 0.999999);

    expect(lowRandom).not.toEqual(highRandom);
  });

  it("returns an empty selection for an empty gallery", () => {
    expect(selectRandomStartupGalleryImages([], 6)).toEqual([]);
  });
});

/**
 * Keep this helper in sync with LibraryView's carousel offset math.
 * Extracted here so remount / wrap behavior can be unit-tested without mounting React.
 */
function getStartupCarouselOffset(index: number, activeIndex: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  let offset = index - activeIndex;
  const half = total / 2;

  if (offset > half) {
    offset -= total;
  } else if (offset < -half) {
    offset += total;
  }

  return offset;
}

describe("startup carousel offset", () => {
  it("advances forward with the shortest circular distance", () => {
    expect(getStartupCarouselOffset(0, 0, 6)).toBe(0);
    expect(getStartupCarouselOffset(1, 0, 6)).toBe(1);
    expect(getStartupCarouselOffset(2, 0, 6)).toBe(2);
    expect(getStartupCarouselOffset(5, 0, 6)).toBe(-1);
  });

  it("keeps neighboring slides adjacent after wrapping past the last image", () => {
    // Active is the last slide (index 5); next slide (0) should sit to the right (+1),
    // not leap across the whole deck with a linear offset of -5.
    expect(getStartupCarouselOffset(0, 5, 6)).toBe(1);
    expect(getStartupCarouselOffset(4, 5, 6)).toBe(-1);
    expect(getStartupCarouselOffset(5, 5, 6)).toBe(0);
  });
});
