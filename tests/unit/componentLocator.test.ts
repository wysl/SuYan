import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveComponentExeInBaseSync } from "../../electron/main/modules/componentLocator";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

async function makeBaseDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-locator-"));
  temporaryDirectories.push(dir);
  return dir;
}

describe("resolveComponentExeInBaseSync", () => {
  it("returns null when current.json is missing", async () => {
    const base = await makeBaseDir();
    expect(resolveComponentExeInBaseSync(base, "ffmpeg", "ffmpeg.exe")).toBeNull();
  });

  it("returns null when current.json is malformed", async () => {
    const base = await makeBaseDir();
    await fs.mkdir(path.join(base, "ffmpeg"), { recursive: true });
    await fs.writeFile(path.join(base, "ffmpeg", "current.json"), "{ not json");
    expect(resolveComponentExeInBaseSync(base, "ffmpeg", "ffmpeg.exe")).toBeNull();
  });

  it("returns null when the executable is absent despite a valid current.json", async () => {
    const base = await makeBaseDir();
    await fs.mkdir(path.join(base, "ffmpeg"), { recursive: true });
    await fs.writeFile(
      path.join(base, "ffmpeg", "current.json"),
      JSON.stringify({ version: "7.1.1-suyan.1", platform: "win32-x64", installedAt: "" }),
    );
    expect(resolveComponentExeInBaseSync(base, "ffmpeg", "ffmpeg.exe")).toBeNull();
  });

  it("returns the executable path when current.json and the binary exist", async () => {
    const base = await makeBaseDir();
    const version = "7.1.1-suyan.1";
    const platform = "win32-x64";
    const platformDir = path.join(base, "ffmpeg", version, platform);
    await fs.mkdir(platformDir, { recursive: true });
    await fs.writeFile(path.join(platformDir, "ffmpeg.exe"), "BIN");
    await fs.mkdir(path.join(base, "ffmpeg"), { recursive: true });
    await fs.writeFile(
      path.join(base, "ffmpeg", "current.json"),
      JSON.stringify({ version, platform, installedAt: "" }),
    );
    expect(resolveComponentExeInBaseSync(base, "ffmpeg", "ffmpeg.exe")).toBe(
      path.join(platformDir, "ffmpeg.exe"),
    );
  });
});
