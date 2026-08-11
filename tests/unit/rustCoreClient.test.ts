import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RustCoreClient, RUST_CORE_PROTOCOL_VERSION } from "../../electron/main/runtime/rustCoreClient";

const rustCoreBinary = path.resolve(
  __dirname,
  "../../native/suyan-core/target/release",
  process.platform === "win32" ? "suyan-core.exe" : "suyan-core",
);

const rustCoreAvailable = process.platform === "win32" && existsSync(rustCoreBinary);

/** 在非 Windows 或缺少已编译二进制时跳过，避免测试假失败。 */
function skipIfUnavailable(body: () => Promise<void>, timeoutMs = 30_000) {
  if (!rustCoreAvailable) {
    return;
  }
  it(`runs for available Rust Core binary (${path.basename(rustCoreBinary)})`, async () => {
    await body();
  }, timeoutMs);
}

describe("Rust Core sidecar client", () => {
  skipIfUnavailable(async () => {
    const client = new RustCoreClient({ executablePath: rustCoreBinary });
    await client.start();
    await client.waitForReady(10_000);

    const handshake = await client.request<{
      status: string;
      protocolVersion: number;
      implementation: string;
    }>("system.handshake", {});
    expect(handshake.status).toBe("ok");
    expect(handshake.protocolVersion).toBe(RUST_CORE_PROTOCOL_VERSION);
    expect(handshake.implementation).toBe("suyan-core");

    const ping = await client.request<{ status: string }>("system.ping", {});
    expect(ping.status).toBe("ok");

    await client.stop();
  });

  skipIfUnavailable(async () => {
    const client = new RustCoreClient({ executablePath: rustCoreBinary });
    await client.start();
    await client.waitForReady(10_000);

    await expect(client.request("unknown.method", {})).rejects.toThrow(/METHOD_NOT_FOUND/);

    await client.stop();
  });

  skipIfUnavailable(async () => {
    const client = new RustCoreClient({
      executablePath: rustCoreBinary,
      protocolVersion: 99,
    });
    await expect(client.start()).rejects.toThrow(/协议版本不匹配|UNSUPPORTED_PROTOCOL/);

    await client.stop();
  });
});