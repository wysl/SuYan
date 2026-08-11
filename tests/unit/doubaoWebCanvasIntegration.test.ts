import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("embedded Doubao web canvas integration", () => {
  it("keeps the backend infra as dormant code (sandboxed WebContentsView, no separate BrowserWindow)", () => {
    // 豆包网页画布已从 UI 下线、回归默认 API 生图，但后端实现保留为休眠代码，便于将来重新启用。
    // 仍须满足沙箱化隔离约束，不能退回独立 BrowserWindow 或 renderer 直连。
    const source = read("electron/main/ai/doubaoWebCanvas.ts");

    expect(source).toContain("new WebContentsView");
    expect(source).toContain('partition: doubaoPartition');
    expect(source).toContain('const doubaoPartition = "persist:suyan-doubao"');
    expect(source).toContain("ownerWindow.contentView.addChildView(view)");
    expect(source).toContain("contextIsolation: true");
    expect(source).toContain("nodeIntegration: false");
    expect(source).toContain("sandbox: true");
    expect(source).toContain("不要出现文字、Logo、签名、平台标识或任何水印");
    expect(source).not.toContain("capturePage");
    expect(source).not.toContain("new BrowserWindow");
  });

  it("hides the Doubao web canvas option from the UI and forces provider back to api", () => {
    // 豆包网页画布已下线：画布「当前配置」下拉不再出现「豆包网页画布（免费）」选项，
    // 草稿归一化强制 generationProvider 为 "api"，旧草稿里残留的 "doubao-web" 不会触发豆包后台逻辑。
    const utilsSource = read("src/features/library/utils/canvasGeneration.ts");
    const canvasSource = read("src/features/library/components/CanvasView.tsx");

    // 归一化强制 api：旧 doubao-web 草稿加载后回到 API 生图。
    expect(utilsSource).toContain('generationProvider: "api",');
    expect(utilsSource).not.toContain('input.generationProvider === "doubao-web" ? "doubao-web"');

    // 画布「当前配置」下拉里移除了豆包选项按钮。
    expect(canvasSource).not.toContain('generationProvider: "doubao-web"');
    expect(canvasSource).not.toContain("豆包网页画布（免费）");
    // 「当前配置」按钮文案不再有 isDoubaoWeb 分支，回归纯 API 状态显示。
    expect(canvasSource).not.toContain('isDoubaoWeb ? "网页画布"');
  });

  it("backend infra, when dormant, still follows the robust submit / scrape design", () => {
    // 保留的后端代码仍遵循既有的可靠性设计：文本用 sendInputEvent 真实键入、
    // 抓图限定结果区并按文件签名校验、下拉 miss 不 body.click。休眠状态下不被调用，但约束保持。
    const source = read("electron/main/ai/doubaoWebCanvas.ts");

    // 文本输入用 sendInputEvent 模拟真实键盘。
    expect(source).toContain("wc.sendInputEvent({ type: \"keyDown\", keyCode: ch });");
    // 抓图限定结果区 + 大图，按文件签名校验真实格式。
    expect(source).toContain("naturalWidth >= 512");
    expect(source).toContain("detectGeneratedImageExtension");
    // 下拉 miss 用 Escape 收起，绝不 body.click。
    expect(source).not.toContain("document.body.click()");
  });
});
