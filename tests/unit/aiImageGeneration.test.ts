import { describe, expect, it, vi } from "vitest";
import {
  generateImagesWithOpenAiCompatible,
  normalizeOpenAiCompatibleImageEditsEndpoint,
  normalizeOpenAiCompatibleImagesEndpoint,
} from "../../electron/main/ai/remoteAiClient";

const opaquePngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

describe("AI image generation", () => {
  it("normalizes image generation endpoints", () => {
    expect(normalizeOpenAiCompatibleImagesEndpoint("https://api.example.com/v1")).toBe(
      "https://api.example.com/v1/images/generations",
    );
    expect(normalizeOpenAiCompatibleImagesEndpoint("https://api.example.com/v1/chat/completions")).toBe(
      "https://api.example.com/v1/images/generations",
    );
    expect(normalizeOpenAiCompatibleImagesEndpoint("https://api.example.com/v1/images/generations")).toBe(
      "https://api.example.com/v1/images/generations",
    );
    expect(normalizeOpenAiCompatibleImageEditsEndpoint("https://api.example.com/v1")).toBe(
      "https://api.example.com/v1/images/edits",
    );
    expect(normalizeOpenAiCompatibleImageEditsEndpoint("https://api.example.com/v1/images/generations")).toBe(
      "https://api.example.com/v1/images/edits",
    );
  });

  it("parses base64 image results from an OpenAI-compatible response", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.example.com/v1/images/generations");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer test-key" });
      expect(JSON.parse(String(init?.body))).toMatchObject({
        model: "image-model",
        prompt: "a red fox",
        n: 2,
        size: "auto",
        output_format: "png",
      });
      return new Response(JSON.stringify({
        data: [
          { b64_json: opaquePngBase64, revised_prompt: "a vivid red fox" },
          { b64_json: opaquePngBase64, revised_prompt: "a vivid red fox" },
        ],
      }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(
        generateImagesWithOpenAiCompatible(
          {
            apiKey: "test-key",
            baseUrl: "https://api.example.com/v1",
            enabled: true,
            id: "profile",
            model: "image-model",
            models: [],
            name: "test",
          },
          {
            prompt: "a red fox",
            size: "auto",
            n: 2,
            outputFormat: "png",
          },
        ),
      ).resolves.toEqual({
        images: [
          { dataUrl: `data:image/png;base64,${opaquePngBase64}`, revisedPrompt: "a vivid red fox" },
          { dataUrl: `data:image/png;base64,${opaquePngBase64}`, revisedPrompt: "a vivid red fox" },
        ],
        model: "image-model",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses multipart /images/edits when a reference image is present", async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.example.com/v1/images/edits");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer test-key");
      expect(headers.get("content-type")).toBeNull();

      const form = init?.body as FormData;
      expect(form).toBeInstanceOf(FormData);
      expect(form.get("model")).toBe("image-model");
      expect(form.get("prompt")).toBe("preserve composition");
      expect(form.get("size")).toBe("auto");
      expect(form.get("image")).toBeInstanceOf(Blob);
      return new Response(JSON.stringify({ data: [{ b64_json: opaquePngBase64 }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(
        generateImagesWithOpenAiCompatible(
          {
            apiKey: "test-key",
            baseUrl: "https://api.example.com/v1",
            enabled: true,
            id: "profile",
            model: "image-model",
            models: [],
            name: "test",
          },
          {
            prompt: "preserve composition",
            referenceImageDataUrl: `data:application/octet-stream;base64,${pngBytes.toString("base64")}`,
            referenceImageFileName: "source.bin",
            size: "auto",
          },
        ),
      ).resolves.toMatchObject({
        model: "image-model",
        images: [{ dataUrl: `data:image/png;base64,${opaquePngBase64}` }],
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("restores a persisted reference image by file name after a renderer restart", async () => {
    const readCanvasReferenceImage = vi.fn(async () => ({
      dataUrl: `data:image/png;base64,${opaquePngBase64}`,
      fileName: "canvas-reference-restored.png",
      height: 1,
      title: "restored",
      width: 1,
    }));
    vi.doMock("../../electron/main/library/canvasReferenceImages", () => ({
      readCanvasReferenceImage,
    }));
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.example.com/v1/images/edits");
      expect((init?.body as FormData).get("image")).toBeInstanceOf(Blob);
      return new Response(JSON.stringify({ data: [{ b64_json: opaquePngBase64 }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(
        generateImagesWithOpenAiCompatible(
          {
            apiKey: "test-key",
            baseUrl: "https://api.example.com/v1",
            enabled: true,
            id: "profile",
            model: "image-model",
            models: [],
            name: "test",
          },
          {
            prompt: "preserve the restored composition",
            referenceImageFileName: "canvas-reference-restored.png",
            outputFormat: "png",
          },
        ),
      ).resolves.toMatchObject({ model: "image-model", images: [{ dataUrl: `data:image/png;base64,${opaquePngBase64}` }] });
      expect(readCanvasReferenceImage).toHaveBeenCalledWith("canvas-reference-restored.png");
    } finally {
      vi.unstubAllGlobals();
      vi.doUnmock("../../electron/main/library/canvasReferenceImages");
    }
  });

  it("explains when the upstream does not support reference-image editing", async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));

    try {
      await expect(
        generateImagesWithOpenAiCompatible(
          {
            apiKey: "test-key",
            baseUrl: "https://api.example.com/v1",
            enabled: true,
            id: "profile",
            model: "image-model",
            models: [],
            name: "test",
          },
          {
            prompt: "edit image",
            referenceImageDataUrl: `data:image/png;base64,${pngBytes.toString("base64")}`,
          },
        ),
      ).rejects.toThrow("当前接口不支持参考图生成");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
