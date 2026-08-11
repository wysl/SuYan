import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../..");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

describe("external media health performance contracts", () => {
  it("builds one root index for batch health refreshes", () => {
    const source = readSource("electron/main/library/externalMediaHealth.ts");
    const refreshBody = source.slice(source.indexOf("export async function refreshExternalMediaHealth"));

    expect(refreshBody).toContain("const rootsById = new Map(roots.map");
    expect(refreshBody).toContain("inspectExternalMediaWithRootIndex(item, rootsById)");
    expect(refreshBody).not.toContain("inspectExternalMedia(item, roots)");
  });

  it("uses the shared bounded-concurrency helper", () => {
    const source = readSource("electron/main/library/externalMediaHealth.ts");

    expect(source).toContain('import { mapWithConcurrency } from "./asyncMap";');
    expect(source).not.toContain("async function mapWithConcurrency");
  });
});
