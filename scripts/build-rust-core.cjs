const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const coreDir = path.join(projectRoot, "native", "suyan-core");
const outputDir = path.join(coreDir, "bin");
const outputPath = path.join(outputDir, process.platform === "win32" ? "suyan-core.exe" : "suyan-core");

function findCargo() {
  const configured = process.env.SUYAN_CARGO?.trim();
  if (configured) {
    return configured;
  }

  const candidates = process.platform === "win32"
    ? [
        "cargo.exe",
        path.join(process.env.USERPROFILE || "", ".cargo", "bin", "cargo.exe"),
        path.join(process.env.HOME || "", ".cargo", "bin", "cargo.exe"),
      ]
    : [
        "cargo",
        path.join(process.env.HOME || "", ".cargo", "bin", "cargo"),
      ];

  return candidates.find((candidate) => candidate && (path.isAbsolute(candidate) ? fs.existsSync(candidate) : candidate === "cargo.exe" || candidate === "cargo")) || (process.platform === "win32" ? "cargo.exe" : "cargo");
}

function isValidWindowsBinary(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size < 64) {
      return false;
    }
    const header = Buffer.alloc(2);
    const descriptor = fs.openSync(filePath, "r");
    try {
      fs.readSync(descriptor, header, 0, 2, 0);
    } finally {
      fs.closeSync(descriptor);
    }
    return header[0] === 0x4d && header[1] === 0x5a;
  } catch {
    return false;
  }
}

function buildWithCargo(cargo) {
  const probe = spawnSync(cargo, ["--version"], { cwd: coreDir, stdio: "ignore", windowsHide: true });
  if (probe.error || probe.status !== 0) {
    return false;
  }

  const result = spawnSync(
    cargo,
    ["build", "--release", "--target-dir", path.join(coreDir, "target")],
    { cwd: coreDir, stdio: "inherit", windowsHide: true },
  );
  if (result.error || result.status !== 0) {
    throw result.error || new Error(`cargo build failed with exit code ${result.status}`);
  }

  const releaseBinary = path.join(coreDir, "target", "release", process.platform === "win32" ? "suyan-core.exe" : "suyan-core");
  if (!fs.existsSync(releaseBinary)) {
    throw new Error(`cargo build did not produce a binary at ${releaseBinary}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  // 复制到 bin/ 供打包脚本使用，避免直接引用 target 目录。
  fs.copyFileSync(releaseBinary, outputPath);
  return true;
}

function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const cargo = findCargo();

  if (buildWithCargo(cargo)) {
    if (process.platform === "win32" && !isValidWindowsBinary(outputPath)) {
      throw new Error(`cargo build produced an invalid Windows binary: ${outputPath}`);
    }
    console.log(`Built Rust Core: ${path.relative(projectRoot, outputPath)}`);
    return;
  }

  if (process.platform === "win32" && isValidWindowsBinary(outputPath)) {
    console.warn("cargo unavailable; using the prebuilt suyan-core binary.");
    return;
  }

  throw new Error(
    "cargo is unavailable and no valid prebuilt suyan-core binary exists. Install Rust (rustup) or provide SUYAN_CARGO before running pnpm package:win.",
  );
}

if (require.main === module) {
  main();
}

module.exports = { findCargo, isValidWindowsBinary };