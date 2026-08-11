import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { promoteStagedRelease } = require("../../package-win.cjs") as {
  promoteStagedRelease: (
    stagedDir: string,
    finalDir: string,
    options?: { stopLockedProcesses?: boolean },
  ) => void;
};

const projectRoot = path.resolve(__dirname, "../..");
const testRoot = path.join(projectRoot, "release-next", `package-win-test-${process.pid}`);

describe("package-win", () => {
  afterEach(() => {
    removePathIfExists(testRoot);
  });

  it("promotes staged package by syncing into the final release directory", () => {
    const stagedDir = path.join(testRoot, "staged");
    const finalDir = path.join(testRoot, "release");
    const finalAsarPath = path.join(finalDir, "win-unpacked", "resources", "app.asar");
    const stagedAsarPath = path.join(stagedDir, "win-unpacked", "resources", "app.asar");
    const setupPath = path.join(finalDir, "素言-Setup-0.1.0.exe");

    fs.mkdirSync(path.dirname(finalAsarPath), { recursive: true });
    fs.writeFileSync(finalAsarPath, "old app", "utf8");
    fs.writeFileSync(path.join(finalDir, "stale.txt"), "stale", "utf8");
    fs.mkdirSync(path.dirname(stagedAsarPath), { recursive: true });
    fs.writeFileSync(stagedAsarPath, "new app", "utf8");
    fs.writeFileSync(path.join(stagedDir, "素言-Setup-0.1.0.exe"), "installer", "utf8");

    promoteStagedRelease(stagedDir, finalDir, { stopLockedProcesses: false });

    expect(fs.readFileSync(finalAsarPath, "utf8")).toBe("new app");
    expect(fs.readFileSync(setupPath, "utf8")).toBe("installer");
    expect(fs.existsSync(path.join(finalDir, "stale.txt"))).toBe(false);
    expect(fs.existsSync(stagedDir)).toBe(false);
  });

  it("preserves win-unpacked runtime data and logs when promoting a staged package", () => {
    const stagedDir = path.join(testRoot, "staged-preserve");
    const finalDir = path.join(testRoot, "release-preserve");
    const finalAsarPath = path.join(finalDir, "win-unpacked", "resources", "app.asar");
    const stagedAsarPath = path.join(stagedDir, "win-unpacked", "resources", "app.asar");
    const libraryPath = path.join(finalDir, "win-unpacked", "data", "library", "library.json");
    const aiSettingsPath = path.join(finalDir, "win-unpacked", "data", "library", "ai-settings.json");
    const logPath = path.join(finalDir, "win-unpacked", "logs", "app.log");
    const staleRuntimePath = path.join(finalDir, "win-unpacked", "stale-runtime.txt");

    fs.mkdirSync(path.dirname(finalAsarPath), { recursive: true });
    fs.writeFileSync(finalAsarPath, "old app", "utf8");
    fs.mkdirSync(path.dirname(libraryPath), { recursive: true });
    fs.writeFileSync(libraryPath, JSON.stringify({ items: [{ id: "keep-me" }] }), "utf8");
    fs.writeFileSync(
      aiSettingsPath,
      JSON.stringify({ schemaVersion: 3, recognitionSourcePreferences: { category: "image" } }),
      "utf8",
    );
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, "keep log", "utf8");
    fs.writeFileSync(staleRuntimePath, "should-remove", "utf8");

    fs.mkdirSync(path.dirname(stagedAsarPath), { recursive: true });
    fs.writeFileSync(stagedAsarPath, "new app", "utf8");
    fs.writeFileSync(path.join(stagedDir, "素言-Setup-0.1.0.exe"), "installer", "utf8");

    promoteStagedRelease(stagedDir, finalDir, { stopLockedProcesses: false });

    expect(fs.readFileSync(finalAsarPath, "utf8")).toBe("new app");
    expect(fs.existsSync(libraryPath)).toBe(true);
    expect(fs.readFileSync(libraryPath, "utf8")).toContain("keep-me");
    expect(fs.existsSync(aiSettingsPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(aiSettingsPath, "utf8")).recognitionSourcePreferences.category).toBe("image");
    expect(fs.existsSync(logPath)).toBe(true);
    expect(fs.readFileSync(logPath, "utf8")).toBe("keep log");
    expect(fs.existsSync(staleRuntimePath)).toBe(false);
  });

  it("ships startup gallery assets outside app.asar for packaged startup seeding", () => {
    const script = fs.readFileSync(path.join(projectRoot, "package-win.cjs"), "utf8");

    expect(script).toContain('path.join(projectRoot, "electron", "assets", "startup-gallery")');
    expect(script).toContain('path.join(stageDir, "startup-assets")');
    expect(script).toContain('from: "startup-assets"');
    expect(script).toContain('to: "startup-assets"');
    expect(script).toContain("tryStopLockedReleaseProcesses");
  });

  it("does not package a Go file helper binary", () => {
    const script = fs.readFileSync(path.join(projectRoot, "package-win.cjs"), "utf8");

    expect(script).not.toContain("prepareGoFileHelperStage");
    expect(script).not.toContain("go-file-helper");
    expect(script).toContain('from: "bin"');
    expect(script).toContain('to: "bin"');
  });

  it("wipes dist-electron before compiling so deleted modules stop shipping", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    // tsc never removes stale .js for a deleted .ts, so a removed module would
    // keep riding along inside app.asar without this clean step.
    expect(packageJson.scripts?.["build:electron"]).toContain("clean-dist.cjs dist-electron");
    expect(packageJson.scripts?.["build:electron"]).toContain("tsc -p tsconfig.electron.json");
  });

  it("leaves no compiled output without a matching source file", () => {
    const outputRoot = path.join(projectRoot, "dist-electron", "electron");
    if (!fs.existsSync(outputRoot)) {
      return;
    }

    const orphans = listCompiledFiles(outputRoot).filter((compiledPath) => {
      const relativePath = path.relative(outputRoot, compiledPath);
      const sourcePath = path.join(projectRoot, "electron", relativePath).replace(/\.js$/, ".ts");
      return !fs.existsSync(sourcePath);
    });

    expect(orphans).toEqual([]);
  });

  it("packages sharp native runtime files without a Go helper build step", () => {
    const script = fs.readFileSync(path.join(projectRoot, "package-win.cjs"), "utf8");
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["build:go-helper"]).toBeUndefined();
    expect(packageJson.scripts?.["package:win"]).toContain("build:rust-core");
    expect(packageJson.scripts?.["package:win"]).not.toContain("build:go-helper");
    expect(script).toContain("resolvePackageJsonPath");
    expect(script).toContain('copyPackage("sharp")');
    expect(script).toContain('"@img", "sharp-win32-x64", "lib", "sharp-win32-x64.node"');
    expect(script).toContain("assertVendorRuntimeDependencies");
    expect(script).toContain("assertPackagedRuntimeDependencies");
  });

  it("packages Rust Core sidecar and does not ship ffmpeg-static in vendor", () => {
    const script = fs.readFileSync(path.join(projectRoot, "package-win.cjs"), "utf8");
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(script).toContain("prepareRustCoreStage");
    expect(script).toContain("Required Rust Core binary is missing");
    expect(script).toContain('electronLanguages: ["zh-CN", "en-US", "ja"]');
    expect(script).toContain('target: ["nsis", "zip"]');
    expect(script).toContain("${productName}-Portable-${version}.${ext}");
    expect(script).toContain('copyPackage("jszip")');
    expect(script).toContain('copyPackage("sharp")');
    expect(script).not.toContain('copyPackage("ffmpeg-static")');
    expect(script).not.toMatch(/copyPackage\(\s*["']ffmpeg/);
    expect(packageJson.dependencies?.["ffmpeg-static"]).toBeUndefined();
    expect(packageJson.devDependencies?.["ffmpeg-static"]).toBe("5.2.0");
  });

  it("packages only default startup gallery assets and guards personal library payloads", () => {
    const script = fs.readFileSync(path.join(projectRoot, "package-win.cjs"), "utf8");

    expect(script).toContain("prepareStartupAssetsStage");
    expect(script).toContain("assertEmptyShellStartupAssets");
    expect(script).toContain("assertNoPersonalLibraryPayload");
    expect(script).toContain('from: "startup-assets"');
    expect(script).toContain('to: "startup-assets"');
    expect(script).toContain("startup-default-1.png");
    expect(script).toContain("!**/library.json");
    expect(script).toContain("!**/ai-settings.json");
    expect(script).toContain("acceleration-settings.json");
    expect(script).toContain("assertPackagedEmptyShell");
    expect(script).toContain("emptyShellExcludeGlobs");
  });

});

function listCompiledFiles(rootDir: string): string[] {
  const files: string[] = [];

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...listCompiledFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(entryPath);
    }
  }

  return files;
}

function removePathIfExists(targetPath: string): void {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  const stat = fs.lstatSync(targetPath);

  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    for (const entry of fs.readdirSync(targetPath)) {
      removePathIfExists(path.join(targetPath, entry));
    }

    fs.rmdirSync(targetPath);
    return;
  }

  fs.unlinkSync(targetPath);
}
