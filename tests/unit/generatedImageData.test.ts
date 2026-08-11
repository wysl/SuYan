import { describe, expect, it } from "vitest";
import {
  decodeGeneratedImageDataUrl,
  detectGeneratedImageExtension,
} from "../../electron/main/library/generatedImageData";

describe("generated image data URLs", () => {
  it("detects supported formats from file signatures", () => {
    expect(detectGeneratedImageExtension(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(".png");
    expect(detectGeneratedImageExtension(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(".jpg");
    expect(detectGeneratedImageExtension(Buffer.from("RIFF0000WEBP", "ascii"))).toBe(".webp");
  });

  it("trusts file content rather than a mismatched declared MIME type", () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const decoded = decodeGeneratedImageDataUrl(`data:image/jpeg;base64,${pngBytes.toString("base64")}`);

    expect(decoded.extension).toBe(".png");
    expect(decoded.buffer).toEqual(pngBytes);
  });

  it("rejects non-image or malformed generated payloads", () => {
    expect(() => decodeGeneratedImageDataUrl("https://example.com/image.png")).toThrow();
    expect(() => decodeGeneratedImageDataUrl("data:image/png;base64,AQID")).toThrow();
  });
});
