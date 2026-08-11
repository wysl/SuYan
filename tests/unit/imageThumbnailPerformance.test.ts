import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../..");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

describe("thumbnail scheduling performance contract", () => {
  it("lets explicit thumbnail requests remove queued background work", () => {
    const source = readSource("electron/main/library/imageThumbnails.ts");

    expect(source.match(/queuedThumbnailFileNames\.delete\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source).toContain("queuedThumbnailFileNames.delete(item.imageFileName)");
  });


  it("returns audio sources before thumbnail filesystem work", () => {
    const source = readSource("electron/main/library/imageThumbnails.ts");
    const functionStart = source.indexOf("async function createImageThumbnailPathFromSource");
    const functionBody = source.slice(functionStart);
    const audioCheckIndex = functionBody.indexOf("if (isAudioMediaFile(imageFileName))");
    const thumbnailPathIndex = functionBody.indexOf("const thumbnailPath = getImageThumbnailPath(imageFileName)");
    const freshnessCheckIndex = functionBody.indexOf("isFreshThumbnail(imagePath, thumbnailPath)");
    const mkdirIndex = functionBody.indexOf("fs.mkdir(getImageThumbnailsDir()");

    expect(audioCheckIndex).toBeGreaterThanOrEqual(0);
    expect(audioCheckIndex).toBeLessThan(thumbnailPathIndex);
    expect(audioCheckIndex).toBeLessThan(freshnessCheckIndex);
    expect(audioCheckIndex).toBeLessThan(mkdirIndex);
  });


  it("avoids rewriting the startup gallery manifest when reconciliation is unchanged", () => {
    const source = readSource("electron/main/library/startupGalleryStore.ts");
    const reconcileBody = source.slice(source.indexOf("async function reconcileImages"));
    const equalityIndex = reconcileBody.indexOf("areStartupGalleryImagesEqual(manifest.images, images)");
    const writeIndex = reconcileBody.indexOf("await writeManifest(images)");

    expect(equalityIndex).toBeGreaterThanOrEqual(0);
    expect(writeIndex).toBeGreaterThan(equalityIndex);
  });

  it("short-circuits startup thumbnail freshness when the thumbnail is missing or empty", () => {
    const source = readSource("electron/main/library/startupGalleryStore.ts");
    const functionBody = source.slice(source.indexOf("async function isFreshStartupThumbnail"));

    expect(functionBody).toContain("thumbnailStats = await fs.stat(thumbnailPath)");
    expect(functionBody).toContain("if (thumbnailStats.size <= 0)");
    expect(functionBody).not.toContain("Promise.all([fs.stat(imagePath), fs.stat(thumbnailPath)])");
  });

  it("short-circuits freshness checks when the thumbnail is missing or empty", () => {
    const source = readSource("electron/main/library/imageThumbnails.ts");
    const functionBody = source.slice(source.indexOf("async function isFreshThumbnail"));

    expect(functionBody).toContain("thumbnailStats = await fs.stat(thumbnailPath)");
    expect(functionBody).toContain("if (thumbnailStats.size <= 0)");
    expect(functionBody).not.toContain("Promise.all([fs.stat(imagePath), fs.stat(thumbnailPath)])");
  });
});
