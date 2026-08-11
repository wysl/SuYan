import type {
  AiAnalyzePromptData,
  AiImageGenerationData,
  AiImageGenerationPayload,
  AiFeatureAction,
  AiAnalyzePromptPayload,
  AiListProviderModelsData,
  AiOptimizePromptData,
  AiOptimizePromptPayload,
  AiReverseImagePromptData,
  AiReverseImagePromptPayload,
  AiSettingsTestData,
  AiSummarizePromptTitleData,
  AiSummarizePromptTitlePayload,
  AiTranslatePromptData,
  AiTranslatePromptPayload,
  SaveAiProviderSettingsPayload,
} from "../../../src/features/library/types/ai";
import { AppError } from "../ipc/errors";
import { logger } from "../appLogger";
import { readPrivateAiProviderSettings, resolveAiProviderSettingsForPayload } from "./aiSettingsStore";
import {
  resolveAiActionCustomInstructions,
  resolveAiProviderProfileForAction,
} from "./aiSettingsModel";
import {
  analyzePromptRemotely,
  generateImagesWithOpenAiCompatible,
  listOpenAiCompatibleModels,
  optimizePromptRemotely,
  reverseImagePromptRemotely,
  summarizeTitleRemotely,
  testOpenAiCompatibleConnection,
  translatePromptRemotely,
} from "./remoteAiClient";

export async function analyzePromptWithRemoteAi(
  payload: AiAnalyzePromptPayload,
): Promise<AiAnalyzePromptData> {
  if (!isAnalyzePayload(payload)) {
    throw new AppError("AI_ANALYZE_PAYLOAD_INVALID", "AI 分析参数不合法。");
  }

  const runtime = await resolveAiRuntimeSettings(
    payload.target,
    payload.apiProfileId,
    payload.apiModelId,
    payload.customInstructions,
  );
  const analysis = await analyzePromptRemotely(runtime.settings, {
    ...payload,
    customInstructions: runtime.customInstructions,
  });

  return { analysis };
}

export async function optimizePromptWithRemoteAi(
  payload: AiOptimizePromptPayload,
): Promise<AiOptimizePromptData> {
  if (!isOptimizePayload(payload)) {
    throw new AppError("AI_OPTIMIZE_PAYLOAD_INVALID", "AI 优化参数不合法。");
  }

  const runtime = await resolveAiRuntimeSettings(
    "prompt-optimization",
    payload.apiProfileId,
    payload.apiModelId,
    payload.customInstructions,
  );

  return {
    prompt: await optimizePromptRemotely(
      runtime.settings,
      payload.prompt,
      runtime.customInstructions,
      payload.promptKind,
    ),
  };
}

export async function summarizePromptTitleWithRemoteAi(
  payload: AiSummarizePromptTitlePayload,
): Promise<AiSummarizePromptTitleData> {
  if (!isSummarizeTitlePayload(payload)) {
    throw new AppError("AI_SUMMARIZE_TITLE_PAYLOAD_INVALID", "AI 标题总结参数不合法。");
  }

  const runtime = await resolveAiRuntimeSettings(
    "prompt-optimization",
    payload.apiProfileId,
    payload.apiModelId,
    payload.customInstructions,
  );

  return {
    title: await summarizeTitleRemotely(runtime.settings, payload.prompt, runtime.customInstructions),
  };
}

export async function translatePromptWithRemoteAi(
  payload: AiTranslatePromptPayload,
): Promise<AiTranslatePromptData> {
  if (!isTranslatePayload(payload)) {
    throw new AppError("AI_TRANSLATE_PAYLOAD_INVALID", "AI 翻译参数不合法。");
  }

  const runtime = await resolveAiRuntimeSettings(
    "prompt-translation",
    payload.apiProfileId,
    payload.apiModelId,
    payload.customInstructions,
  );

  return translatePromptRemotely(runtime.settings, payload, runtime.customInstructions);
}

export async function reverseImagePromptWithRemoteAi(
  payload: AiReverseImagePromptPayload,
): Promise<AiReverseImagePromptData> {
  if (!isReverseImagePayload(payload)) {
    throw new AppError("AI_REVERSE_IMAGE_PAYLOAD_INVALID", "图像反推参数不合法。");
  }

  const runtime = await resolveAiRuntimeSettings(
    "image-reverse",
    payload.apiProfileId,
    payload.apiModelId,
    payload.customInstructions,
  );

  return {
    prompt: await reverseImagePromptRemotely(runtime.settings, payload, runtime.customInstructions),
  };
}


export async function generateImagesWithRemoteAi(
  payload: AiImageGenerationPayload,
): Promise<AiImageGenerationData> {
  if (!isImageGenerationPayload(payload)) {
    throw new AppError("AI_IMAGE_GENERATION_PAYLOAD_INVALID", "图像生成参数不合法。");
  }

  const runtime = await resolveAiRuntimeSettings(
    "image-generation",
    payload.apiProfileId,
    payload.apiModelId,
    payload.customInstructions,
  );

  const startedAt = Date.now();
  const notifyEnabled = payload.notificationEnabled === true;
  try {
    const data = await generateImagesWithOpenAiCompatible(
      runtime.settings,
      payload,
      runtime.customInstructions,
    );
    const durationMs = Date.now() - startedAt;
    const promptPreview = truncateText(payload.prompt, 60);
    if (notifyEnabled) {
      const message =
        `图像生成完成（${data.model}）\n` +
        `耗时 ${(durationMs / 1000).toFixed(1)} 秒，共 ${data.images.length} 张\n` +
        `提示词：${promptPreview}`;
      void notifyTapRelay(message, {
        event: "image-generation-success",
        status: "completed",
        taskId: `image-generation-${startedAt}`,
        durationMs,
        model: data.model,
        imageCount: data.images.length,
        prompt: promptPreview,
      });
    }
    return data;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const errorCode = error instanceof AppError ? error.code : "AI_IMAGE_GENERATION_FAILED";
    const errorMessage = error instanceof Error ? error.message : String(error);
    const promptPreview = truncateText(payload.prompt, 60);
    if (notifyEnabled) {
      const message =
        `图像生成失败（${errorCode}）\n` +
        `耗时 ${(durationMs / 1000).toFixed(1)} 秒\n` +
        `错误：${truncateText(errorMessage, 120)}\n` +
        `提示词：${promptPreview}`;
      void notifyTapRelay(message, {
        event: "image-generation-failed",
        status: "failed",
        taskId: `image-generation-${startedAt}`,
        durationMs,
        errorCode,
        error: truncateText(errorMessage, 200),
        prompt: promptPreview,
      });
    }
    throw error;
  }
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…`;
}

const tapRelayHookUrl = "http://localhost:1122/send";
const tapRelayHookTimeoutMs = 3_000;

async function notifyTapRelay(
  message: string,
  context: Record<string, unknown> = {},
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), tapRelayHookTimeoutMs);
  const logContext = sanitizeTapRelayLogContext(context);
  try {
    const response = await fetch(tapRelayHookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        source: "suyan",
        status: typeof context.status === "string" ? context.status : "completed",
        taskId: typeof context.taskId === "string" ? context.taskId : `suyan-${Date.now()}`,
        cwd: process.cwd(),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.warn("ai", "tap-relay-hook-non-ok", {
        ...logContext,
        httpStatus: response.status,
      });
    } else {
      logger.info("ai", "tap-relay-hook-sent", {
        ...logContext,
        httpStatus: response.status,
      });
    }
  } catch (error) {
    logger.warn("ai", "tap-relay-hook-failed", {
      error: error instanceof Error ? error.message : String(error),
      ...logContext,
    });
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeTapRelayLogContext(context: Record<string, unknown>): Record<string, unknown> {
  const safeKeys = [
    "durationMs",
    "errorCode",
    "event",
    "imageCount",
    "model",
    "status",
    "taskId",
  ] as const;
  return Object.fromEntries(
    safeKeys.flatMap((key) => context[key] === undefined ? [] : [[key, context[key]]]),
  );
}

export async function testAiProviderSettings(
  payload: SaveAiProviderSettingsPayload,
): Promise<AiSettingsTestData> {
  return testOpenAiCompatibleConnection(await resolveAiProviderSettingsForPayload(payload));
}

export async function listAiProviderModels(
  payload: SaveAiProviderSettingsPayload,
): Promise<AiListProviderModelsData> {
  return { models: await listOpenAiCompatibleModels(await resolveAiProviderSettingsForPayload(payload)) };
}


function isImageGenerationPayload(input: unknown): input is AiImageGenerationPayload {
  return (
    isRecord(input) &&
    typeof input.prompt === "string" &&
    input.prompt.trim().length > 0 &&
    isOptionalString(input.negativePrompt) &&
    isOptionalString(input.apiProfileId) &&
    isOptionalString(input.apiModelId) &&
    isOptionalString(input.customInstructions) &&
    isOptionalString(input.referenceImageFileName) &&
    isOptionalString(input.referenceImageDataUrl) &&
    isOptionalString(input.doubaoModel) &&
    isOptionalString(input.doubaoStyle) &&
    (input.generationProvider === undefined ||
      input.generationProvider === "api" ||
      input.generationProvider === "doubao-web") &&
    (input.size === undefined || isImageGenerationSize(input.size)) &&
    (input.quality === undefined || input.quality === "auto" || input.quality === "low" || input.quality === "medium" || input.quality === "high") &&
    (input.outputFormat === undefined || input.outputFormat === "png" || input.outputFormat === "jpeg" || input.outputFormat === "webp") &&
    (input.background === undefined || input.background === "auto" || input.background === "opaque" || input.background === "transparent") &&
    (input.notificationEnabled === undefined || typeof input.notificationEnabled === "boolean") &&
    (input.n === undefined || (typeof input.n === "number" && Number.isInteger(input.n) && input.n >= 1 && input.n <= 4))
  );
}

function isImageGenerationSize(input: unknown): input is AiImageGenerationPayload["size"] {
  if (input === "auto") {
    return true;
  }
  if (typeof input !== "string") {
    return false;
  }

  const match = /^(\d{3,4})x(\d{3,4})$/.exec(input);
  if (!match) {
    return false;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  return width >= 256 && width <= 4096 && height >= 256 && height <= 4096;
}

function isAnalyzePayload(input: unknown): input is AiAnalyzePromptPayload {
  return (
    isRecord(input) &&
    isAnalyzeTarget(input.target) &&
    isOptionalString(input.apiProfileId) &&
    isOptionalString(input.apiModelId) &&
    isOptionalString(input.customInstructions) &&
    isOptionalString(input.referenceImageFileName) &&
    isOptionalString(input.customInstructions) &&
    typeof input.title === "string" &&
    isAnalyzeImagePayloadBoundaryValid(input.target, input.imageFileName) &&
    typeof input.prompt === "string" &&
    typeof input.negativePrompt === "string" &&
    Array.isArray(input.tags) &&
    input.tags.every((tag) => typeof tag === "string") &&
    typeof input.category === "string" &&
    (input.knownCategories === undefined ||
      (Array.isArray(input.knownCategories) && input.knownCategories.every((category) => typeof category === "string")))
  );
}

function isAnalyzeImagePayloadBoundaryValid(target: AiAnalyzePromptPayload["target"], imageFileName: unknown): boolean {
  if (
    target === "prompt-category" ||
    target === "prompt-tags"
  ) {
    return imageFileName === undefined || imageFileName === "";
  }

  return typeof imageFileName === "string" && imageFileName.trim().length > 0;
}

function isAnalyzeTarget(input: unknown): input is AiAnalyzePromptPayload["target"] {
  return (
    input === "prompt" ||
    input === "prompt-category" ||
    input === "prompt-tags" ||
    input === "prompt-options" ||
    input === "image-category" ||
    input === "image-tags" ||
    input === "image-safety"
  );
}

function isOptionalString(input: unknown): boolean {
  return input === undefined || typeof input === "string";
}

function isOptimizePayload(input: unknown): input is AiOptimizePromptPayload {
  return (
    isRecord(input) &&
    typeof input.prompt === "string" &&
    (input.promptKind === undefined || input.promptKind === "positive" || input.promptKind === "negative") &&
    isOptionalString(input.apiProfileId) &&
    isOptionalString(input.apiModelId) &&
    isOptionalString(input.customInstructions) &&
    isOptionalString(input.referenceImageFileName) &&
    isOptionalString(input.customInstructions)
  );
}

function isSummarizeTitlePayload(input: unknown): input is AiSummarizePromptTitlePayload {
  return (
    isRecord(input) &&
    typeof input.prompt === "string" &&
    isOptionalString(input.apiProfileId) &&
    isOptionalString(input.apiModelId) &&
    isOptionalString(input.customInstructions)
  );
}

function isTranslatePayload(input: unknown): input is AiTranslatePromptPayload {
  return (
    isRecord(input) &&
    typeof input.prompt === "string" &&
    (input.negativePrompt === undefined || typeof input.negativePrompt === "string") &&
    (input.sourceLanguage === undefined ||
      input.sourceLanguage === "auto" ||
      input.sourceLanguage === "zh" ||
      input.sourceLanguage === "en") &&
    (input.targetLanguage === "zh" || input.targetLanguage === "en") &&
    isOptionalString(input.apiProfileId) &&
    isOptionalString(input.apiModelId) &&
    isOptionalString(input.customInstructions) &&
    isOptionalString(input.referenceImageFileName) &&
    isOptionalString(input.customInstructions)
  );
}

function isReverseImagePayload(input: unknown): input is AiReverseImagePromptPayload {
  return (
    isRecord(input) &&
    isOptionalString(input.imageFileName) &&
    isOptionalString(input.apiProfileId) &&
    isOptionalString(input.apiModelId) &&
    isOptionalString(input.customInstructions) &&
    isOptionalString(input.referenceImageFileName) &&
    isOptionalString(input.customInstructions)
  );
}

async function resolveAiRuntimeSettings(
  action: AiFeatureAction,
  profileId?: string,
  modelId?: string,
  customInstructions?: string,
) {
  const settings = await readPrivateAiProviderSettings();

  return {
    customInstructions: resolveAiActionCustomInstructions(settings, action, customInstructions),
    settings: resolveAiProviderProfileForAction(settings, action, profileId, modelId),
  };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
