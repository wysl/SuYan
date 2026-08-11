import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../../electron/main/library/asyncMap";

describe("mapWithConcurrency", () => {
  it("limits active work and keeps results in input order", async () => {
    let active = 0;
    let peak = 0;

    const result = await mapWithConcurrency([40, 5, 20, 1, 10], 2, async (delay, index) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      active -= 1;
      return `${index}:${delay}`;
    });

    expect(peak).toBeLessThanOrEqual(2);
    expect(result).toEqual(["0:40", "1:5", "2:20", "3:1", "4:10"]);
  });

  it("returns an empty result without starting workers", async () => {
    expect(await mapWithConcurrency([], 4, async () => "unused")).toEqual([]);
  });
});
