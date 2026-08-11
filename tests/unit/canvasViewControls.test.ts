import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const canvasSource = readFileSync("src/features/library/components/CanvasView.tsx", "utf8");
const storeSource = readFileSync("src/features/library/store/useLibraryStore.ts", "utf8");
const viewSettingsSource = readFileSync("electron/main/library/viewSettingsStore.ts", "utf8");

describe("CanvasView controls", () => {
  it.each(["\u590d\u5236", "\u7c98\u8d34", "\u4f18\u5316", "\u8fd4\u56de", "\u6e05\u7a7a"])(
    "renders the %s prompt action for both prompt fields",
    (label) => {
      if (label === "\u4f18\u5316") {
        expect(canvasSource).toContain('label={isOptimizing ? "\u4f18\u5316\u4e2d" : "\u4f18\u5316"}');
      } else {
        expect(canvasSource).toContain(`label="${label}"`);
      }
    },
  );

  it("remembers the resizable positive prompt height", () => {
    expect(canvasSource).toContain("positivePromptHeight");
    expect(canvasSource).toContain("height={canvasDraft.positivePromptHeight}");
    expect(canvasSource).toContain("onPointerUp");
    expect(canvasSource).toContain("onHeightChange");
    expect(storeSource).toContain("...get().canvasDraft");
    expect(viewSettingsSource).toContain("normalizeCanvasDraftSettings(input.canvasDraft)");
  });

  it("opens the reference-image popover and收敛 the positive prompt tools into primary actions plus a more menu", () => {
    expect(canvasSource).toContain("isReferenceImagePopoverOpen");
    expect(canvasSource).toContain("setIsReferenceImagePopoverOpen(true)");
    expect(canvasSource).toContain("添加参考图");
    expect(canvasSource).toContain("PromptMoreMenuItem");
    expect(canvasSource).toContain("CanvasReferenceImagePopover");
    expect(canvasSource).toContain("onImportFromClipboard");
  });

  it("uses the preload clipboard bridge instead of direct renderer access", () => {
    expect(canvasSource).toContain("window.suyanApi.writeClipboardText");
    expect(canvasSource).toContain("window.suyanApi.readClipboardText");
    expect(canvasSource).not.toContain("navigator.clipboard");
  });

  it("supports negative prompt visibility and transparent image generation", () => {
    expect(canvasSource).toContain("negativePromptHidden");
    expect(canvasSource).toContain("iconOnlyActions");
    expect(canvasSource).toContain("aria-label={label === \"返回\" ? \"撤销最近一次更改\" : label}");
    expect(canvasSource).toContain("iconOnly ? \"sr-only\" : \"truncate\"");
    expect(canvasSource).toContain("buildCanvasImageGenerationPayload(canvasDraft");
    expect(canvasSource).toContain('disabled: canvasDraft.transparentBackground && option.value === "jpeg"');
    expect(canvasSource).toContain('value={canvasDraft.outputFormat}');
  });

  it("exposes the reference-style size modes and ratios", () => {
    expect(canvasSource).toContain('label: "\u81ea\u52a8"');
    expect(canvasSource).toContain('label: "\u6309\u6bd4\u4f8b"');
    expect(canvasSource).toContain('label: "\u81ea\u5b9a\u4e49\u5bbd\u9ad8"');
    expect(canvasSource).toContain('{ value: "1k", label: "1K" }');
    expect(canvasSource).toContain('{ value: "2k", label: "2K" }');
    expect(canvasSource).toContain('{ value: "4k", label: "4K" }');
    expect(canvasSource).toContain("onClick={() => onDraftChange({ baseResolution: option.value })}");
    expect(canvasSource).not.toContain('<ResolutionButton disabled label="2K" />');
    expect(canvasSource).toContain("getCanvasGenerationSizeLabel(resolveCanvasGenerationSize(canvasDraft))");
    expect(canvasSource).toContain("上方显示的实际请求像素");
  });

  it("persists whether advanced canvas settings are expanded", () => {
    expect(canvasSource).toContain("<CanvasAdvancedPanel");
    expect(canvasSource).toContain('aria-label={hidden ? "显示高级设置" : "隐藏高级设置"}');
    expect(canvasSource).toContain("hidden={!canvasDraft.advancedSettingsOpen}");
    expect(canvasSource).toContain("advancedSettingsOpen: !canvasDraft.advancedSettingsOpen");
    expect(canvasSource).toContain("CanvasSizePanel");
    expect(canvasSource).not.toContain("const [isAdvancedOpen, setIsAdvancedOpen] = useState");
  });

  it("uses the generation prompt as the archived image title without an AI title request", () => {
    expect(canvasSource).toContain("title: cleanPrompt");
    expect(canvasSource).not.toContain("onSummarizeTitle");
    expect(canvasSource).not.toContain("buildFallbackTitle");
  });

  it("tracks the result canvas with the creation panel's content height", () => {
    expect(canvasSource).toContain("creationPanelRef");
    expect(canvasSource).toContain("new ResizeObserver(updateHeight)");
    expect(canvasSource).toContain("self-start rounded-3xl border border-border bg-panel");
    expect(canvasSource).toContain("lockedHeight={creationPanelHeight}");
    expect(canvasSource).toContain("style={lockedHeight !== null ? { height: `${lockedHeight}px` } : undefined}");
  });

  it("keeps fullscreen details conditional and actions as circular icon buttons", () => {
    expect(canvasSource).toContain("lg:flex-row");
    expect(canvasSource).toContain('<Download size={13} />');
    expect(canvasSource).toContain('<Copy size={13} />');
    expect(canvasSource).toContain('<CanvasResultActionButton icon={<Download size={18} />}');
    expect(canvasSource).toContain('icon={<Info size={18} />}');
    expect(canvasSource).toContain('label="查看"');
    expect(canvasSource).toContain('label="复制"');
    expect(canvasSource).toContain('aria-label="展开的提示词"');
    expect(canvasSource).toContain('onCopyImage={onCopyImage}');
    expect(canvasSource).toContain('label="复制"\n            onClick={onCopy}');
    expect(canvasSource).toContain('className="inline-flex size-10 shrink-0 items-center justify-center rounded-full');
    expect(canvasSource).toContain('className="flex shrink-0 flex-col gap-1.5 rounded-2xl border border-border/70 bg-panel/65 p-1');
    expect(canvasSource).toContain('max-w-[1800px]');
    expect(canvasSource).toContain('lg:pr-4');
    expect(canvasSource).toContain("disabled={!result.saved || !result.imageFileName}");
    expect(canvasSource).not.toContain("<Info size={14} /> 查看提示词");
    expect(canvasSource).not.toContain("复用提示词");
    expect(canvasSource).not.toContain('label="复用"');
  });

  it("shows elapsed time after model and dimensions in fullscreen metadata", () => {
    expect(canvasSource).toContain("generationElapsedMs={generationElapsedMs}");
    expect(canvasSource).toContain("<dt>模型：</dt>");
    expect(canvasSource).toContain("<dt>尺寸：</dt>");
    expect(canvasSource).toContain("<dt>用时：</dt>");
    expect(canvasSource).toContain("{promptOpen ? (");
    expect(canvasSource).toContain("rounded-full bg-primary/10 px-2.5 py-1 tabular-nums text-primary");
    expect(canvasSource.indexOf('aria-label="展开的提示词"')).toBeLessThan(canvasSource.indexOf("<dt>模型：</dt>"));
  });
});

describe("canvas draft persistence", () => {
  it("keeps canvas draft in memory immediately and saves it through view settings", () => {
    expect(storeSource).toContain("updateCanvasDraft: (patch) =>");
    expect(storeSource).toContain("set({ canvasDraft: nextCanvasDraft })");
    expect(storeSource).toContain("saveLibraryViewSettingsSerialized(buildLibraryViewSettings(get()))");
    expect(viewSettingsSource).toContain("canvasDraft: normalizeCanvasDraftSettings(input.canvasDraft)");
  });
});
