import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../..");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

describe("image file import performance contract", () => {
  it("routes export copies through Node fs.copyFile without a Go helper", () => {
    const source = readSource("electron/main/library/imageFiles.ts");
    const functionBody = source.slice(source.indexOf("export async function exportImageToLocal"));

    expect(functionBody).toContain("await fs.copyFile(sourcePath, result.filePath)");
    expect(functionBody).not.toContain("copyFileWithGoFallback");
    expect(functionBody).not.toContain("go-file-helper");
  });

  it("reads dropped image files with bounded concurrency", () => {
    const source = readSource("electron/main/library/imageFiles.ts");
    const functionBody = source.slice(source.indexOf("export async function importImageFilePaths"));

    expect(functionBody).toContain("mapWithConcurrency(filePaths, 4");
    expect(functionBody).toContain("await fs.readFile(filePath)");
    expect(functionBody).toContain("return importImageBuffers(loadedImages.filter");
    expect(functionBody).not.toContain("for (const filePath of imagePaths)");
  });
});
