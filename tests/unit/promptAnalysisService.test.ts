import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serviceSpies = vi.hoisted(() => ({
  generateImages: vi.fn(),
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  readSettings: vi.fn(),
}));

vi.mock("../../electron/main/appLogger", () => ({ logger: serviceSpies.logger }));
vi.mock("../../electron/main/ai/aiSettingsStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../electron/main/ai/aiSettingsStore")>()),
  readPrivateAiProviderSettings: serviceSpies.readSettings,
}));
vi.mock("../../electron/main/ai/remoteAiClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../electron/main/ai/remoteAiClient")>()),
  generateImagesWithOpenAiCompatible: serviceSpies.generateImages,
}));

import { generateImagesWithRemoteAi } from "../../electron/main/ai/promptAnalysisService";

const privateSettings = {
  activeProfileId: "image-profile",
  actionPreferences: {
    "image-generation": {
      customInstructions: "Keep all visible product text unchanged.",
      modelId: "image-model",
      profileId: "image-profile",
      rulePresetIds: ["saved-image-rule"],
      rules: [
        {
          id: "saved-image-rule",
          instructions: "Preserve the reference composition and subject identity.",
          label: "Saved image rule",
        },
      ],
    },
  },
  recognitionSourcePreferences: {},
  profiles: [
    {
      apiKey: "test-key",
      baseUrl: "https://api.example.com/v1",
      enabled: true,
      id: "image-profile",
      model: "image-model",
      models: [
        {
          capabilities: ["image-generation" as const],
          id: "image-model",
          label: "image-model",
        },
      ],
      name: "Image provider",
    },
  ],
};

const generatedData = {
  images: [{ dataUrl: "data:image/png;base64,AA==", revisedPrompt: null }],
  model: "image-model",
};

describe("promptAnalysisService image generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceSpies.readSettings.mockResolvedValue(privateSettings);
    serviceSpies.generateImages.mockResolvedValue(generatedData);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes persisted image-generation rules into the remote generation runtime", async () => {
    await generateImagesWithRemoteAi({ prompt: "A ceramic tea set" });

    expect(serviceSpies.generateImages).toHaveBeenCalledWith(
      expect.objectContaining({ id: "image-profile", model: "image-model" }),
      expect.objectContaining({ prompt: "A ceramic tea set" }),
      expect.stringContaining("Preserve the reference composition and subject identity."),
    );
    expect(serviceSpies.generateImages.mock.calls[0]?.[2]).toContain(
      "Keep all visible product text unchanged.",
    );
  });

  it("does not contact TapRelay when completion notifications are disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await generateImagesWithRemoteAi({
      notificationEnabled: false,
      prompt: "A ceramic tea set",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts and logs a successful TapRelay completion notification", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await generateImagesWithRemoteAi({
      notificationEnabled: true,
      prompt: "A ceramic tea set",
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:1122/send");
    expect(JSON.parse(String(init.body))).toMatchObject({
      source: "suyan",
      status: "completed",
    });
    await vi.waitFor(() => {
      expect(serviceSpies.logger.info).toHaveBeenCalledWith(
        "ai",
        "tap-relay-hook-sent",
        expect.objectContaining({ event: "image-generation-success", httpStatus: 204, imageCount: 1 }),
      );
    });
  });

  it("logs a non-success TapRelay response without failing image generation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateImagesWithRemoteAi({
      notificationEnabled: true,
      prompt: "A ceramic tea set",
    })).resolves.toEqual(generatedData);

    await vi.waitFor(() => {
      expect(serviceSpies.logger.warn).toHaveBeenCalledWith(
        "ai",
        "tap-relay-hook-non-ok",
        expect.objectContaining({ event: "image-generation-success", httpStatus: 503 }),
      );
    });
  });

  it("posts a failed-generation notification and contains TapRelay network errors", async () => {
    const generationError = new Error("upstream unavailable");
    const fetchMock = vi.fn().mockRejectedValue(new Error("relay offline"));
    serviceSpies.generateImages.mockRejectedValueOnce(generationError);
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateImagesWithRemoteAi({
      notificationEnabled: true,
      prompt: "A ceramic tea set",
    })).rejects.toBe(generationError);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      source: "suyan",
      status: "failed",
    });
    await vi.waitFor(() => {
      expect(serviceSpies.logger.warn).toHaveBeenCalledWith(
        "ai",
        "tap-relay-hook-failed",
        expect.objectContaining({
          error: "relay offline",
          errorCode: "AI_IMAGE_GENERATION_FAILED",
          event: "image-generation-failed",
        }),
      );
    });
  });
});
