import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../..");

function readLibraryViewSource(): string {
  return fs.readFileSync(
    path.join(projectRoot, "src", "features", "library", "components", "LibraryView.tsx"),
    "utf8",
  );
}

describe("LibraryView AI tag action", () => {
  it("keeps the AI tag action enabled for the full prompt library and forces a full analysis", () => {
    const source = readLibraryViewSource();

    expect(source).toContain("const tagAnalysisPromptGroupCount = useMemo(");
    expect(source).toContain("() => (isTagWorkspace ? categoryPromptGroups.length : 0)");
    expect(source).toContain("const groupsToAnalyze = force ? categoryPromptGroups : visibleTagPromptGroups;");
    expect(source).toContain("onClick={() => void handleAnalyzeVisibleTagPromptGroups({ force: true })}");
    expect(source).not.toContain("analyzableTagPromptGroupCount === 0");
  });

  it("uses text analysis for video media and skips videos without prompts", () => {
    const source = readLibraryViewSource();

    expect(source).toContain("import { isVideoMediaFile } from \"../utils/mediaFileTypes\";");
    expect(source).toContain('target: usePromptAnalysis ? "prompt-tags" : "image-tags"');
    expect(source).toContain('target: usePromptAnalysis ? "prompt-category" : "image-category"');
    expect(source).toContain("prompt: usePromptAnalysis ? item.prompt : \"\"");
    expect(source).toContain("isVideoMediaFile(group.primaryItem.imageFileName) && !group.primaryItem.prompt.trim()");
  });
});
