import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../..");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

describe("external library watcher performance contracts", () => {
  it("reuses watcher lstat results when creating imported external items", () => {
    const source = readSource("electron/main/library/externalLibrarySync.ts");
    const functionBody = source.slice(source.indexOf("const importedItems"));

    expect(functionBody).toContain("createExternalLibraryItem(root, file.absolutePath, now, file)");
    expect(functionBody).not.toContain("createExternalLibraryItem(root, file.absolutePath, now).catch");
  });

  it("uses the shared bounded-concurrency helper for watcher imports", () => {
    const source = readSource("electron/main/library/externalLibrarySync.ts");

    expect(source).toContain('import { mapWithConcurrency } from "./asyncMap";');
    expect(source).not.toContain("async function mapWithConcurrency");
  });

  it("coalesces opposite watcher events for the same path", () => {
    const source = readSource("electron/main/library/externalLibraryWatcher.ts");
    const functionBody = source.slice(source.indexOf("function queueWatcherPath"), source.indexOf("async function flushWatcherEvents"));

    expect(functionBody).toContain("state.pendingRemoved.delete(filePath)");
    expect(functionBody).toContain("state.pendingAdded.delete(filePath)");
  });

  it("reuses the validated root snapshot for watcher notifications", () => {
    const source = readSource("electron/main/library/externalLibraryWatcher.ts");
    const functionBody = source.slice(source.indexOf("async function flushWatcherEvents"));

    expect(functionBody.match(/await readLibraryRoots\(\)/g)?.length).toBe(1);
    expect(functionBody).toMatch(/roots,\s+rootId/);
  });
});
