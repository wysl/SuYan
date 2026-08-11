import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../..");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

describe("canvas generation preview session", () => {
  it("keeps preview images and model in the library store across CanvasView remounts", () => {
    const storeSource = readSource("src/features/library/store/useLibraryStore.ts");
    const libraryViewSource = readSource("src/features/library/components/LibraryView.tsx");
    const canvasSource = readSource("src/features/library/components/CanvasView.tsx");

    expect(storeSource).toContain("canvasGenerationResults: []");
    expect(storeSource).toContain('canvasLastModel: ""');
    expect(storeSource).toContain("setCanvasGenerationResults: (results)");
    expect(libraryViewSource).toContain("generationResults={canvasGenerationResults}");
    expect(libraryViewSource).toContain("lastGenerationModel={canvasLastModel}");
    expect(canvasSource).not.toMatch(/useState<CanvasGenerationResult\[\]>/);
    expect(canvasSource).not.toContain("const [results, setResults]");
    expect(canvasSource).not.toContain("const [lastModel, setLastModel]");
  });

  it("no longer serializes a 1600ms thinking delay before the real request", () => {
    const canvasSource = readSource("src/features/library/components/CanvasView.tsx");
    // 旧实现：setTimeout(() => runGeneration, thinkingPhaseMs) 串行延迟真实请求。
    // 新实现：请求与 thinking 并行，thinkingPhaseMs 与 thinkingTimerRef 已移除。
    expect(canvasSource).not.toContain("thinkingPhaseMs");
    expect(canvasSource).not.toContain("thinkingTimerRef");
    expect(canvasSource).not.toContain("setTimeout(() => {\n      void runGeneration");
    // 真实请求改为立即发起。
    expect(canvasSource).toContain("void runGeneration(cleanPrompt);");
  });

  it("preserves the previous batch when a new generation fails", () => {
    const canvasSource = readSource("src/features/library/components/CanvasView.tsx");
    // 旧实现：点击生成立即 onGenerationResultsChange([]) 清空旧预览，失败后清成空态。
    // 新实现：不再立即清空；失败时按是否有旧预览回退到 created/empty，而非无条件 empty。
    expect(canvasSource).not.toContain("onGenerationResultsChange([]);");
    expect(canvasSource).toContain("setPhase(results.length > 0 ? \"created\" : \"empty\");");
  });
});
