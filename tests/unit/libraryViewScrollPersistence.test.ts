import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeLibraryViewSettings } from "../../electron/main/library/viewSettingsStore";

const libraryViewSource = readFileSync("src/features/library/components/LibraryView.tsx", "utf8");
const storeSource = readFileSync("src/features/library/store/useLibraryStore.ts", "utf8");

describe("material browser scroll persistence", () => {
  it("normalizes persisted positions and resets missing or invalid cache state", () => {
    expect(normalizeLibraryViewSettings({ materialBrowserScrollTop: 735.8 }).materialBrowserScrollTop).toBe(735);
    expect(normalizeLibraryViewSettings({ materialBrowserScrollTop: -100 }).materialBrowserScrollTop).toBe(0);
    expect(normalizeLibraryViewSettings({}).materialBrowserScrollTop).toBe(0);
  });

  it("saves on scroll and restores after enough gallery pages are mounted", () => {
    expect(libraryViewSource).toContain('logRendererStartupEvent("view-scroll:save"');
    expect(libraryViewSource).toContain('logRendererStartupEvent("view-scroll:restore"');
    expect(libraryViewSource).toContain("pendingHomeScrollRestoreRef");
    expect(libraryViewSource).toContain("saveMaterialBrowserScrollTop(container.scrollTop)");
    expect(storeSource).toContain("materialBrowserScrollSaveTimer");
    expect(storeSource).toContain("materialBrowserScrollTop: normalizeMaterialBrowserScrollTop");
  });

  it("does not reset the home container when switching to another work area", () => {
    const openMainViewStart = libraryViewSource.indexOf("function openMainView(view: LibraryMainView)");
    const openMainViewEnd = libraryViewSource.indexOf("async function pushImageToCanvas", openMainViewStart);
    const openMainView = libraryViewSource.slice(openMainViewStart, openMainViewEnd);

    expect(openMainView).not.toContain("setMainView(view);\n    scrollToTop();");
    expect(openMainView).toContain("saveMaterialBrowserScrollTop(scrollTop)");
  });
});
