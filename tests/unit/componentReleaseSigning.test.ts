import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createLocalArtifactProvider,
  installComponent,
} from "../../electron/main/modules/componentInstaller";
import {
  readCurrentComponent,
  type CommandRunner,
  type ZipArchiveLoader,
} from "../../electron/main/modules/componentSecurity";
import {
  CURRENT_COMPONENT_PLATFORM,
  DEFAULT_COMPONENT_LIMITS,
  FFMPEG_COMPONENT_ID,
  FFMPEG_COMPONENT_VERSION,
  FFMPEG_EXECUTABLE_NAME,
} from "../../electron/main/modules/componentConfig";

const TOOL_PATH = path.resolve("scripts/components/sign-component-release.cjs");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

async function makeDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(dir);
  return dir;
}

const loadZip: ZipArchiveLoader = async (data) => {
  const { default: JSZip } = await import("jszip");
  return JSZip.loadAsync(data);
};

const okRunner: CommandRunner = async () => ({ stdout: "ffmpeg version 7.1.1", stderr: "", code: 0 });

function runTool(args: string[]): void {
  execFileSync(process.execPath, [TOOL_PATH, ...args], { encoding: "utf8", timeout: 30_000 });
}

describe("sign-component-release CLI produces client-installable artifacts", () => {
  it("keygen + sign yields a release that installComponent accepts end-to-end", async () => {
    const keysDir = await makeDir("suyan-keys-");
    const workDir = await makeDir("suyan-work-");
    const releaseDir = await makeDir("suyan-release-");
    const base = await makeDir("suyan-install-");

    runTool(["keygen", "--out", keysDir]);
    const privatePath = path.join(keysDir, "ffmpeg-signing.private.pem");
    const publicPem = await fs.readFile(path.join(keysDir, "ffmpeg-signing.public.pem"), "utf8");

    const exePath = path.join(workDir, "ffmpeg.exe");
    const licensePath = path.join(workDir, "LICENSE");
    await fs.writeFile(exePath, Buffer.from("MZ fake ffmpeg binary"));
    await fs.writeFile(licensePath, Buffer.from("LICENSE TEXT"));

    runTool([
      "sign",
      "--ffmpeg", exePath,
      "--license", licensePath,
      "--key", privatePath,
      "--version", FFMPEG_COMPONENT_VERSION,
      "--out", releaseDir,
    ]);

    const result = await installComponent({
      provider: createLocalArtifactProvider({
        manifestPath: path.join(releaseDir, "manifest.json"),
        signaturePath: path.join(releaseDir, "manifest.json.sig"),
        zipPath: path.join(releaseDir, "ffmpeg-win32-x64.zip"),
      }),
      baseComponentsDir: base,
      publicKeyPem: publicPem,
      limits: DEFAULT_COMPONENT_LIMITS,
      loadZip,
      expected: {
        componentId: FFMPEG_COMPONENT_ID,
        version: FFMPEG_COMPONENT_VERSION,
        platform: CURRENT_COMPONENT_PLATFORM,
        exeName: FFMPEG_EXECUTABLE_NAME,
      },
      selfCheckRunner: okRunner,
    });

    expect(result.version).toBe(FFMPEG_COMPONENT_VERSION);
    expect((await fs.readFile(path.join(result.installedDir, FFMPEG_EXECUTABLE_NAME))).length).toBeGreaterThan(0);
    const current = await readCurrentComponent(base, FFMPEG_COMPONENT_ID);
    expect(current?.version).toBe(FFMPEG_COMPONENT_VERSION);
  });
});
