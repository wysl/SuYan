import { app, shell } from "electron";
import { AppError } from "../ipc/errors";

/**
 * Reveal the writable data directory so users can copy it before upgrading.
 * Installer upgrades replace the whole software directory, so a manual copy of
 * this folder is the only complete backup (see docs/VERSIONING.md).
 */
export async function openAppDataDirectory(): Promise<{ opened: true; path: string }> {
  const dataDir = app.getPath("userData");
  const failure = await shell.openPath(dataDir);

  if (failure) {
    throw new AppError("OPEN_DATA_DIRECTORY_FAILED", `无法打开数据目录：${failure}`);
  }

  return { opened: true, path: dataDir };
}
