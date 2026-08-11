import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readPublicAiProviderSettings,
  writeAiProviderSettings,
} from "../../electron/main/ai/aiSettingsStore";

const runtime = vi.hoisted(() => ({ userDataPath: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => runtime.userDataPath },
  safeStorage: {
    isEncryptionAvailable: () => false,
    decryptString: () => "",
    encryptString: () => Buffer.alloc(0),
  },
}));

const temporaryDirectories: string[] = [];

afterEach(async () => {
  runtime.userDataPath = "";
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("AI settings action preference persistence", () => {
  it("restores the selected provider and model after rereading ai-settings.json", async () => {
    runtime.userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-ai-model-memory-"));
    temporaryDirectories.push(runtime.userDataPath);

    await writeAiProviderSettings({
      activeProfileId: "main",
      actionPreferences: {
        "prompt-category": {
          profileId: "backup",
          modelId: "backup-text",
          rulePresetIds: ["prompt-category-fine"],
          customInstructions: "keep-analysis-rules-after-reload",
        },
      },
      recognitionSourcePreferences: {},
      profiles: [
        {
          id: "main",
          name: "Main provider",
          enabled: true,
          baseUrl: "https://main.example.com/v1",
          apiKey: "sk-main",
          model: "main-text",
          models: [{ id: "main-text", label: "main-text", capabilities: ["text"] }],
        },
        {
          id: "backup",
          name: "Backup provider",
          enabled: true,
          baseUrl: "https://backup.example.com/v1",
          apiKey: "sk-backup",
          model: "backup-text",
          models: [{ id: "backup-text", label: "backup-text", capabilities: ["text"] }],
        },
      ],
    });

    const rawFile = JSON.parse(
      await fs.readFile(path.join(runtime.userDataPath, "library", "ai-settings.json"), "utf8"),
    ) as { actionPreferences?: Record<string, unknown> };
    const reloaded = await readPublicAiProviderSettings();

    expect(rawFile.actionPreferences?.["prompt-category"]).toMatchObject({
      profileId: "backup",
      modelId: "backup-text",
    });
    expect(reloaded.actionPreferences["prompt-category"]).toEqual({
      profileId: "backup",
      modelId: "backup-text",
      rulePresetIds: ["prompt-category-fine"],
      customInstructions: "keep-analysis-rules-after-reload",
    });
  });
});
