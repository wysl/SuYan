import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicAiProviderSettings } from "../../src/features/library/types/ai";
import { useLibraryStore } from "../../src/features/library/store/useLibraryStore";
import { updateAiActionModelPreference } from "../../src/features/library/utils/aiSettingsDraft";

function createSettings(): PublicAiProviderSettings {
  return {
    activeProfileId: "main",
    actionPreferences: {
      "prompt-category": {
        profileId: "main",
        modelId: "main-text",
        rulePresetIds: ["prompt-category-fine"],
        customInstructions: "keep-existing-rules",
      },
    },
    recognitionSourcePreferences: {},
    profiles: [
      {
        id: "main",
        name: "Main provider",
        enabled: true,
        baseUrl: "https://main.example.com/v1",
        hasApiKey: true,
        apiKeyPreview: "sk-***main",
        model: "main-text",
        models: [
          { id: "main-text", label: "main-text", capabilities: ["text"] },
          { id: "main-vision", label: "main-vision", capabilities: ["vision"] },
        ],
      },
      {
        id: "backup",
        name: "Backup provider",
        enabled: true,
        baseUrl: "https://backup.example.com/v1",
        hasApiKey: true,
        apiKeyPreview: "sk-***back",
        model: "backup-text",
        models: [{ id: "backup-text", label: "backup-text", capabilities: ["text"] }],
      },
    ],
    enabled: true,
    baseUrl: "https://main.example.com/v1",
    hasApiKey: true,
    apiKeyPreview: "sk-***main",
    model: "main-text",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("detail AI provider/model preference", () => {
  it("updates only the selected action and preserves its saved rules", () => {
    const settings = createSettings();
    const next = updateAiActionModelPreference(settings, "prompt-category", {
      profileId: "backup",
      modelId: "backup-text",
    });

    expect(next?.actionPreferences["prompt-category"]).toEqual({
      profileId: "backup",
      modelId: "backup-text",
      rulePresetIds: ["prompt-category-fine"],
      customInstructions: "keep-existing-rules",
    });
    expect(settings.actionPreferences["prompt-category"]).toMatchObject({
      profileId: "main",
      modelId: "main-text",
    });
  });

  it("rejects a model that lacks the capability required by the action", () => {
    expect(
      updateAiActionModelPreference(createSettings(), "image-reverse", {
        profileId: "main",
        modelId: "main-text",
      }),
    ).toBeNull();
  });

  it("optimistically updates the shared settings and persists the selection through the existing IPC", async () => {
    const settings = createSettings();
    const persistedSettings = updateAiActionModelPreference(settings, "prompt-category", {
      profileId: "backup",
      modelId: "backup-text",
    });

    expect(persistedSettings).not.toBeNull();
    const saveAiSettings = vi.fn().mockResolvedValue({ ok: true, data: persistedSettings });
    vi.stubGlobal("window", { suyanApi: { saveAiSettings } });
    useLibraryStore.setState({ aiSettings: settings, statusMessage: null });

    const pendingSave = useLibraryStore.getState().saveAiActionModelPreference("prompt-category", {
      profileId: "backup",
      modelId: "backup-text",
    });

    expect(useLibraryStore.getState().aiSettings.actionPreferences["prompt-category"]).toMatchObject({
      profileId: "backup",
      modelId: "backup-text",
    });
    await expect(pendingSave).resolves.toBe(true);
    expect(saveAiSettings).toHaveBeenCalledTimes(1);
    expect(saveAiSettings.mock.calls[0]?.[0].actionPreferences["prompt-category"]).toMatchObject({
      profileId: "backup",
      modelId: "backup-text",
      customInstructions: "keep-existing-rules",
    });
  });
});
