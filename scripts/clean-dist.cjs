const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
/**
 * Build output directories are fully regenerated, so they must be wiped first:
 * `tsc` never deletes stale `.js` left behind by a removed `.ts`, and such
 * orphans would otherwise keep shipping inside `app.asar`.
 */
const allowedTargets = new Set(["dist", "dist-electron"]);
const requestedTargets = process.argv.slice(2);
const targets = requestedTargets.length > 0 ? requestedTargets : ["dist"];

function assertInsideProject(targetPath) {
  const relativePath = path.relative(projectRoot, targetPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Refusing to remove path outside project: ${targetPath}`);
  }
}

for (const target of targets) {
  if (!allowedTargets.has(target)) {
    throw new Error(`Refusing to remove unknown build output: ${target}`);
  }

  const targetDir = path.join(projectRoot, target);
  assertInsideProject(targetDir);
  removePathIfExists(targetDir);

  if (fs.existsSync(targetDir)) {
    throw new Error(`Directory still exists after removal: ${targetDir}`);
  }
}

function removePathIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  removePathRecursive(targetPath);
}

function removePathRecursive(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  const stat = fs.lstatSync(targetPath);

  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    for (const entry of fs.readdirSync(targetPath)) {
      removePathRecursive(path.join(targetPath, entry));
    }

    fs.rmdirSync(targetPath);
    return;
  }

  fs.unlinkSync(targetPath);
}
