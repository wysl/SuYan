import fs from "node:fs";
import path from "node:path";

export type AppStoragePathOptions = {
  isPackaged: boolean;
  execPath: string;
  appDataPath: string;
  portableExecutableDir?: string;
};

export type AppUserDataMigrationResult = {
  userDataPath: string;
  packagedRoot: string | null;
  migrated: boolean;
  from?: string;
  reason: "dev" | "already-ready" | "migrated" | "fresh" | "migrate-failed" | "not-writable";
  errorMessage?: string;
  /** Set when the resolved data directory failed the startup write probe. */
  writeErrorCode?: string | null;
};

export type DirectoryWritability =
  | { writable: true }
  | { writable: false; code: string | null; message: string };

/** Legacy AppData folder names used by earlier SuYan / PromptImageLibrary builds. */
export const legacyUserDataFolderNames = ["SuYan", "素言", "PromptImageLibrary"] as const;

const libraryDirName = "library";
const libraryFileName = "library.json";
const imagesDirName = "images";
const migrationMarkerFileName = "migrated-to-local-data.json";

/**
 * Resolve where Electron `userData` (and thus library/settings) should live.
 * - Development (`electron .` from source): stable %APPDATA%\SuYan
 * - Packaged install / portable / release\win-unpacked: <software-root>\data
 *
 * When iterating via release\win-unpacked\素言.exe, data stays next to the exe
 * and packaging must preserve that `data` folder (see package-win promote).
 */
export function resolveAppUserDataPath(options: AppStoragePathOptions): string {
  if (!options.isPackaged) {
    return path.join(options.appDataPath, "SuYan");
  }

  return path.join(resolvePackagedSoftwareRoot(options), "data");
}

export function resolvePackagedSoftwareRoot(options: AppStoragePathOptions): string {
  if (options.portableExecutableDir?.trim()) {
    return path.resolve(options.portableExecutableDir);
  }

  return path.dirname(path.resolve(options.execPath));
}

export function listLegacyUserDataCandidates(appDataPath: string): string[] {
  return legacyUserDataFolderNames.map((name) => path.join(appDataPath, name));
}

export function hasLibraryUserData(userDataDir: string): boolean {
  if (!userDataDir || !fs.existsSync(userDataDir)) {
    return false;
  }

  const libraryJson = path.join(userDataDir, libraryDirName, libraryFileName);
  if (fs.existsSync(libraryJson)) {
    return true;
  }

  const imagesDir = path.join(userDataDir, libraryDirName, imagesDirName);
  if (fs.existsSync(imagesDir)) {
    try {
      return fs.readdirSync(imagesDir).some((entry) => !entry.startsWith("."));
    } catch {
      return false;
    }
  }

  const viewSettings = path.join(userDataDir, libraryDirName, "view-settings.json");
  if (fs.existsSync(viewSettings)) {
    return true;
  }

  return false;
}

/**
 * Verify the resolved data directory can actually be created and written to.
 * Installing into `C:\Program Files` or onto read-only media would otherwise
 * crash before any window exists, leaving the user with a silent exit.
 */
export function probeDirectoryWritable(dirPath: string): DirectoryWritability {
  const probePath = path.join(dirPath, `.suyan-write-probe-${process.pid}`);

  try {
    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(probePath, "probe", "utf8");
    return { writable: true };
  } catch (error) {
    return {
      writable: false,
      code: (error as NodeJS.ErrnoException).code ?? null,
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    try {
      fs.unlinkSync(probePath);
    } catch {
      // Probe file may not exist when the write itself failed.
    }
  }
}

/**
 * Ensure packaged builds use software-local data, and migrate once from legacy AppData
 * so upgrades stop reading/writing the old C: location.
 */
export function prepareAppUserDataSync(options: AppStoragePathOptions): AppUserDataMigrationResult {
  const userDataPath = resolveAppUserDataPath(options);
  const packagedRoot = options.isPackaged ? resolvePackagedSoftwareRoot(options) : null;

  if (!options.isPackaged) {
    ensureDirSync(userDataPath);
    return {
      userDataPath,
      packagedRoot,
      migrated: false,
      reason: "dev",
    };
  }

  const writability = probeDirectoryWritable(userDataPath);
  if (!writability.writable) {
    return {
      userDataPath,
      packagedRoot,
      migrated: false,
      reason: "not-writable",
      errorMessage: writability.message,
      writeErrorCode: writability.code,
    };
  }

  ensureDirSync(userDataPath);

  if (hasLibraryUserData(userDataPath)) {
    return {
      userDataPath,
      packagedRoot,
      migrated: false,
      reason: "already-ready",
    };
  }

  const legacyCandidates = listLegacyUserDataCandidates(options.appDataPath).filter(
    (candidate) => path.resolve(candidate) !== path.resolve(userDataPath),
  );

  for (const legacyDir of legacyCandidates) {
    if (!hasLibraryUserData(legacyDir)) {
      continue;
    }

    try {
      copyDirectoryContentsSync(legacyDir, userDataPath);
      writeMigrationMarkerSync(legacyDir, userDataPath);
      return {
        userDataPath,
        packagedRoot,
        migrated: true,
        from: legacyDir,
        reason: "migrated",
      };
    } catch (error) {
      return {
        userDataPath,
        packagedRoot,
        migrated: false,
        from: legacyDir,
        reason: "migrate-failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    userDataPath,
    packagedRoot,
    migrated: false,
    reason: "fresh",
  };
}

function ensureDirSync(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeMigrationMarkerSync(legacyDir: string, targetDir: string): void {
  try {
    const markerPath = path.join(legacyDir, migrationMarkerFileName);
    fs.writeFileSync(
      markerPath,
      `${JSON.stringify(
        {
          migratedAt: new Date().toISOString(),
          targetUserData: targetDir,
          note: "SuYan now stores library data next to the app. This AppData copy is no longer used.",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  } catch {
    // Marker is best-effort; migration copy already succeeded.
  }
}

function copyDirectoryContentsSync(sourceDir: string, targetDir: string): void {
  ensureDirSync(targetDir);
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === migrationMarkerFileName) {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursiveSync(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile()) {
      ensureDirSync(path.dirname(targetPath));
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function copyDirectoryRecursiveSync(sourceDir: string, targetDir: string): void {
  ensureDirSync(targetDir);
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursiveSync(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile()) {
      ensureDirSync(path.dirname(targetPath));
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}
