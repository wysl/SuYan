import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../..");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

describe("file import performance contract", () => {
  it("copies passthrough image formats without reading and decoding the full file", () => {
    const source = readSource("electron/main/library/importedImageWriter.ts");
    const functionBody = source.slice(source.indexOf("export async function writeImportMediaFile"));

    expect(functionBody).toContain("isPassthroughImportImageExtension(extension)");
    expect(functionBody).toContain("await copyMediaFile(sourcePath, mediaPath)");
    expect(source).toContain("await fs.copyFile(sourcePath, mediaPath)");
    expect(functionBody).not.toContain("copyFileWithGoFallback");
    expect(functionBody.indexOf("isPassthroughImportImageExtension(extension)")).toBeLessThan(
      functionBody.indexOf("await fs.readFile(sourcePath)"),
    );
  });

  it("keeps compressible image formats on the existing compression path", () => {
    const source = readSource("electron/main/library/importedImageWriter.ts");
    const functionBody = source.slice(source.indexOf("export async function writeImportMediaFile"));

    expect(functionBody).toContain("return writeImportImageBuffer(imageId, await fs.readFile(sourcePath), extension)");
  });
});
