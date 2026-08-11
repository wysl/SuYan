import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const componentsRoot = path.resolve("src");

function collectTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectTsxFiles(absolutePath);
    }
    return entry.isFile() && absolutePath.endsWith(".tsx") ? [absolutePath] : [];
  });
}

describe("interactive control completeness", () => {
  it("does not contain hard-disabled controls or empty event handlers", () => {
    const sources = collectTsxFiles(componentsRoot).map((filePath) => readFileSync(filePath, "utf8"));
    const hardDisabledControl = /<(?:button|select|input)\b[^>]*\sdisabled(?:\s|\/?>)/s;
    const emptyEventHandler = /on(?:Click|Change|PointerDown)=\{\s*\(?.*?\)?\s*=>\s*\{\s*\}\s*\}/s;

    expect(sources.some((source) => hardDisabledControl.test(source))).toBe(false);
    expect(sources.some((source) => emptyEventHandler.test(source))).toBe(false);
  });
});
