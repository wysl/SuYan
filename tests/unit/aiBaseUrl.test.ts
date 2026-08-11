import { describe, expect, it } from "vitest";
import { maskAiBaseUrl, normalizeAiBaseUrl } from "@/features/library/utils/aiBaseUrl";

describe("AI base URL helpers", () => {
  it.each([
    ["https://api.example.com", "https://api.example.com/v1"],
    ["https://api.example.com/", "https://api.example.com/v1"],
    ["https://api.example.com/v1", "https://api.example.com/v1"],
    ["https://api.example.com/v1/", "https://api.example.com/v1"],
    ["https://api.example.com/v1/chat/completions", "https://api.example.com/v1"],
    ["https://api.example.com/api", "https://api.example.com/api/v1"],
    ["https://api.example.com/unrelated/page", "https://api.example.com/v1"],
    ["api.example.com/console", "https://api.example.com/v1"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeAiBaseUrl(input)).toBe(expected);
  });

  it.each([
    ["https://api.2020111.xyz/pricing/v1", "https://api.2020111.xyz/v1"],
    ["https://jianzhile.vip/console/personal/v1", "https://jianzhile.vip/v1"],
    ["https://anyrouter.top/console/v1", "https://anyrouter.top/v1"],
    ["https://windhub.cc/console/v1", "https://windhub.cc/v1"],
  ])("removes copied website routes from %s", (input, expected) => {
    expect(normalizeAiBaseUrl(input)).toBe(expected);
  });

  it.each([
    ["https://openrouter.ai/settings/keys", "https://openrouter.ai/api/v1"],
    ["https://console.groq.com/keys", "https://api.groq.com/openai/v1"],
    ["https://aistudio.google.com/apikey", "https://generativelanguage.googleapis.com/v1beta/openai"],
    ["https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", "https://dashscope.aliyuncs.com/compatible-mode/v1"],
    ["https://open.bigmodel.cn/usercenter/apikeys", "https://open.bigmodel.cn/api/paas/v4"],
    ["https://ark.cn-beijing.volces.com/api/v3", "https://ark.cn-beijing.volces.com/api/v3"],
    ["https://api.perplexity.ai/chat/completions", "https://api.perplexity.ai"],
  ])("adapts the common provider URL %s", (input, expected) => {
    expect(normalizeAiBaseUrl(input)).toBe(expected);
  });

  it("removes query parameters and fragments from pasted website URLs", () => {
    expect(normalizeAiBaseUrl("https://api.example.com/console?region=cn#keys")).toBe("https://api.example.com/v1");
  });

  it("extracts a URL when the clipboard also contains surrounding text", () => {
    expect(normalizeAiBaseUrl("接口地址: https://api.example.com/pricing/v1 copied")).toBe("https://api.example.com/v1");
  });

  it("masks the host by default without exposing the original hostname", () => {
    const masked = maskAiBaseUrl("https://secret.example.com/v1");

    expect(masked).toContain("/v1");
    expect(masked).not.toContain("secret.example.com");
    expect(masked).toMatch(/^https:\/\/[^/]+\/v1$/);
  });
});
