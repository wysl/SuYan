import { BrowserWindow } from "electron";
import fs from "node:fs/promises";
import chokidar, { type FSWatcher } from "chokidar";
import type { ExternalLibrarySyncData } from "../../../src/types/suyanApi";
import type { LibraryRoot } from "../../../src/features/library/types/library";
import { IpcChannelName } from "../../shared/ipcChannels";
import { logger } from "../appLogger";
import { AppError } from "../ipc/errors";
import { isSupportedExternalMediaPath } from "./externalLibraryScanner";
import { syncExternalLibraryRoot } from "./externalLibrarySync";
import { readLibraryRoots, updateLibraryRoot } from "./libraryRoots";

const DEFAULT_WATCHER_DEBOUNCE_MS = 900;
const DEFAULT_WATCHER_STABILITY_THRESHOLD_MS = 700;
const DEFAULT_WATCHER_POLL_INTERVAL_MS = 100;

/**
 * Positive integer from env, else the production default. Lets tests shrink the
 * debounce / awaitWriteFinish windows so the watcher settles in well under a
 * second instead of ~2s, removing the timing race with the test poll deadline
 * under parallel load. Unset in production → identical defaults.
 */
function watcherTimingMs(envName: string, fallback: number): number {
  const parsed = Number(process.env[envName]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const watcherStates = new Map<string, RootWatcherState>();
let syncQueue: Promise<void> = Promise.resolve();
let watcherControlQueue: Promise<void> = Promise.resolve();

type RootWatcherState = {
  active: boolean;
  pendingAdded: Set<string>;
  pendingRemoved: Set<string>;
  timer: NodeJS.Timeout | null;
  watcher: FSWatcher;
};

export async function restoreExternalLibraryWatchers(): Promise<void> {
  return enqueueWatcherControl(restoreExternalLibraryWatchersInternal);
}

async function restoreExternalLibraryWatchersInternal(): Promise<void> {
  const roots = await readLibraryRoots();

  for (const root of roots) {
    if (root.watchEnabled && root.status !== "missing") {
      try {
        await startExternalLibraryRootWatcher(root);
      } catch (error) {
        logger.warn("external-library", "watch:restore-root-failed", {
          rootId: root.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

export async function setExternalLibraryRootWatch(
  rootId: string,
  enabled: boolean,
): Promise<{ root: LibraryRoot; roots: LibraryRoot[] }> {
  return enqueueWatcherControl(() => setExternalLibraryRootWatchInternal(rootId, enabled));
}

async function setExternalLibraryRootWatchInternal(
  rootId: string,
  enabled: boolean,
): Promise<{ root: LibraryRoot; roots: LibraryRoot[] }> {
  const roots = await readLibraryRoots();
  const root = roots.find((candidate) => candidate.id === rootId);

  if (!root) {
    throw new AppError("LIBRARY_ROOT_NOT_FOUND", "素材目录不存在。请刷新后重试。");
  }

  if (enabled) {
    const stats = await fs.stat(root.absolutePath).catch(() => null);

    if (!stats?.isDirectory()) {
      throw new AppError("LIBRARY_ROOT_UNAVAILABLE", "素材目录不可访问，无法开启监视。");
    }
  }

  await stopExternalLibraryRootWatcherInternal(rootId);
  let updatedRoot: LibraryRoot;

  try {
    updatedRoot = await updateLibraryRoot({ ...root, watchEnabled: enabled });
  } catch (error) {
    await refreshExternalLibraryRootWatcherInternal(rootId);
    throw error;
  }

  if (enabled) {
    try {
      await startExternalLibraryRootWatcher(updatedRoot);
    } catch (error) {
      await updateLibraryRoot({ ...updatedRoot, watchEnabled: false });
      throw error;
    }
  }

  return { root: updatedRoot, roots: await readLibraryRoots() };
}

export async function refreshExternalLibraryRootWatcher(rootId: string): Promise<void> {
  return enqueueWatcherControl(() => refreshExternalLibraryRootWatcherInternal(rootId));
}

async function refreshExternalLibraryRootWatcherInternal(rootId: string): Promise<void> {
  await stopExternalLibraryRootWatcherInternal(rootId);
  const root = (await readLibraryRoots()).find((candidate) => candidate.id === rootId);

  if (root?.watchEnabled && root.status !== "missing") {
    await startExternalLibraryRootWatcher(root);
  }
}

export async function stopExternalLibraryRootWatcher(rootId: string): Promise<void> {
  return enqueueWatcherControl(() => stopExternalLibraryRootWatcherInternal(rootId));
}

async function stopExternalLibraryRootWatcherInternal(rootId: string): Promise<void> {
  const state = watcherStates.get(rootId);

  if (!state) {
    return;
  }

  state.active = false;
  watcherStates.delete(rootId);
  if (state.timer) {
    clearTimeout(state.timer);
  }
  state.pendingAdded.clear();
  state.pendingRemoved.clear();
  await state.watcher.close();
  await syncQueue;
}

export async function shutdownExternalLibraryWatchers(): Promise<void> {
  return enqueueWatcherControl(async () => {
    await Promise.all([...watcherStates.keys()].map((rootId) => stopExternalLibraryRootWatcherInternal(rootId)));
  });
}

async function startExternalLibraryRootWatcher(root: LibraryRoot): Promise<void> {
  if (watcherStates.has(root.id)) {
    return;
  }

  const watcher = chokidar.watch(root.absolutePath, {
    atomic: true,
    awaitWriteFinish: {
      pollInterval: watcherTimingMs("SUYAN_WATCHER_POLL_MS", DEFAULT_WATCHER_POLL_INTERVAL_MS),
      stabilityThreshold: watcherTimingMs("SUYAN_WATCHER_STABILITY_MS", DEFAULT_WATCHER_STABILITY_THRESHOLD_MS),
    },
    depth: root.recursive ? undefined : 0,
    ignoreInitial: true,
    persistent: true,
  });
  const state: RootWatcherState = {
    active: true,
    pendingAdded: new Set(),
    pendingRemoved: new Set(),
    timer: null,
    watcher,
  };
  watcherStates.set(root.id, state);

  watcher.on("add", (filePath) => queueWatcherPath(root, state, "added", filePath));
  watcher.on("change", (filePath) => queueWatcherPath(root, state, "added", filePath));
  watcher.on("unlink", (filePath) => queueWatcherPath(root, state, "removed", filePath));
  watcher.on("error", (error) => {
    logger.warn("external-library", "watch:error", {
      rootId: root.id,
      message: error instanceof Error ? error.message : String(error),
    });
  });
  try {
    await waitForWatcherReady(watcher);
  } catch (error) {
    state.active = false;
    watcherStates.delete(root.id);
    await watcher.close();
    throw new AppError(
      "LIBRARY_ROOT_WATCH_FAILED",
      error instanceof Error ? `目录监视启动失败：${error.message}` : "目录监视启动失败。",
    );
  }
  logger.info("external-library", "watch:start", { rootId: root.id, recursive: root.recursive });
}

function queueWatcherPath(
  root: LibraryRoot,
  state: RootWatcherState,
  kind: "added" | "removed",
  filePath: string,
): void {
  if (!state.active || !isSupportedExternalMediaPath(filePath)) {
    return;
  }

  if (kind === "added") {
    state.pendingRemoved.delete(filePath);
    state.pendingAdded.add(filePath);
  } else {
    state.pendingAdded.delete(filePath);
    state.pendingRemoved.add(filePath);
  }
  if (state.timer) {
    clearTimeout(state.timer);
  }
  state.timer = setTimeout(() => {
    state.timer = null;
    void flushWatcherEvents(root, state);
  }, watcherTimingMs("SUYAN_WATCHER_DEBOUNCE_MS", DEFAULT_WATCHER_DEBOUNCE_MS));
}

async function flushWatcherEvents(root: LibraryRoot, state: RootWatcherState): Promise<void> {
  const addedOrChangedPaths = [...state.pendingAdded];
  const removedPaths = [...state.pendingRemoved];
  state.pendingAdded.clear();
  state.pendingRemoved.clear();

  if (!state.active || (addedOrChangedPaths.length === 0 && removedPaths.length === 0)) {
    return;
  }

  syncQueue = syncQueue
    .then(async () => {
      if (!state.active) {
        return;
      }

      const roots = await readLibraryRoots();
      const currentRoot = roots.find((candidate) => candidate.id === root.id && candidate.watchEnabled);

      if (!currentRoot) {
        return;
      }

      const result = await syncExternalLibraryRoot(currentRoot, { addedOrChangedPaths, removedPaths });

      if (result.changedCount === 0) {
        return;
      }

      const data: ExternalLibrarySyncData = {
        library: result.library,
        // Watcher control operations stop and await this sync before changing roots,
        // so the validated snapshot remains current for this notification.
        roots,
        rootId: root.id,
        importedCount: result.importedCount,
        missingCount: result.missingCount,
        renamedCount: result.renamedCount,
      };
      BrowserWindow.getAllWindows().forEach((window) => {
        if (!window.isDestroyed()) {
          window.webContents.send(IpcChannelName.LibraryExternalChanged, data);
        }
      });
      logger.info("external-library", "watch:sync", {
        rootId: root.id,
        changedCount: result.changedCount,
        importedCount: result.importedCount,
        missingCount: result.missingCount,
        renamedCount: result.renamedCount,
      });
    })
    .catch((error) => {
      logger.warn("external-library", "watch:sync-failed", {
        rootId: root.id,
        message: error instanceof Error ? error.message : String(error),
      });
    });

  await syncQueue;
}

function waitForWatcherReady(watcher: FSWatcher): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleReady = () => {
      watcher.off("error", handleError);
      resolve();
    };
    const handleError = (error: unknown) => {
      watcher.off("ready", handleReady);
      reject(error);
    };

    watcher.once("ready", handleReady);
    watcher.once("error", handleError);
  });
}

function enqueueWatcherControl<T>(operation: () => Promise<T>): Promise<T> {
  const result = watcherControlQueue.then(operation, operation);
  watcherControlQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
