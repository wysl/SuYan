import path from "node:path";
import type { RustCoreRuntime } from "./rustCoreRuntime";

/**
 * 阶段 2-3：Rust 侧文件扫描、哈希与归档的 Node 门面。
 *
 * 通过环境变量启用 Rust 实现，未启用时相关调用返回 `null`，由调用方继续走
 * Node 旧实现 —— 这是迁移期的 Feature Flag，保证旧逻辑始终可用、可回退。
 * - `SUYAN_USE_RUST_FILE_OPS`（"1" | "true"）：扫描与 sha256
 * - `SUYAN_USE_RUST_ARCHIVE`（"1" | "true"）：ZIP 导出
 */

export type RustScannedMediaFile = {
  absolutePath: string;
  relativePath: string;
  size: number;
  mtimeMs: number;
};

export type RustScanMediaFilesResult = {
  files: RustScannedMediaFile[];
  errors: string[];
};

/** `library.scanNext` 单页返回。 */
export type RustScanPageResult = {
  sessionId: string;
  done: boolean;
  files: RustScannedMediaFile[];
  errors: string[];
};

export type RustSha256FileResult = {
  hash: string;
  size: number;
};

export type RustZipEntry = {
  zipPath: string;
  sourcePath: string;
};

export type RustCreateZipResult = {
  status: string;
  outputPath: string;
  entryCount: number;
};

/** 图片压缩方法 `image.compressFile` 的返回。 */
export type RustCompressImageResult = {
  outputBytes: number;
  width: number;
  height: number;
};

/** 视频压缩方法 `video.compressFile` 的返回。 */
export type RustRunFfmpegResult = {
  code: number;
  stderr: string;
};

export function isRustFileOpsEnabled(): boolean {
  const raw = process.env.SUYAN_USE_RUST_FILE_OPS?.trim().toLowerCase();
  return raw === "1" || raw === "true";
}

export function isRustArchiveEnabled(): boolean {
  const raw = process.env.SUYAN_USE_RUST_ARCHIVE?.trim().toLowerCase();
  return raw === "1" || raw === "true";
}

export function isRustImageCompressEnabled(): boolean {
  const raw = process.env.SUYAN_USE_RUST_IMAGE_COMPRESS?.trim().toLowerCase();
  return raw === "1" || raw === "true";
}

export function isRustVideoCompressEnabled(): boolean {
  const raw = process.env.SUYAN_USE_RUST_VIDEO_COMPRESS?.trim().toLowerCase();
  return raw === "1" || raw === "true";
}

/** 调用 Rust `library.scanMediaFiles`。未启用或不可用时返回 null。 */
export async function scanMediaFilesViaRust(
  rootPath: string,
  recursive: boolean,
  extensions: readonly string[],
): Promise<RustScanMediaFilesResult | null> {
  if (!isRustFileOpsEnabled()) {
    return null;
  }
  try {
    const runtime = await getRuntime();
    return await runtime.request<RustScanMediaFilesResult>("library.scanMediaFiles", {
      rootPath: path.resolve(rootPath),
      recursive,
      extensions: [...extensions],
    });
  } catch {
    // Sidecar 不可用时回退 Node 实现（调用方判断 null）。
    return null;
  }
}

/**
 * 调用 Rust 流式扫描会话（`scanStart` → 循环 `scanNext` → `scanEnd`）。
 * 单条 NDJSON 响应有 4MB 上限，10 万文件一次返回会超限，因此分页聚合。
 * 未启用或不可用时返回 null（调用方回退 Node 实现）。
 */
export async function scanMediaFilesViaRustStream(
  rootPath: string,
  recursive: boolean,
  extensions: readonly string[],
  pageSize = 5000,
): Promise<RustScanMediaFilesResult | null> {
  if (!isRustFileOpsEnabled()) {
    return null;
  }
  try {
    const runtime = await getRuntime();
    const resolvedRoot = path.resolve(rootPath);
    const { sessionId } = await runtime.request<{ sessionId: string }>("library.scanStart", {
      rootPath: resolvedRoot,
      recursive,
      extensions: [...extensions],
    });

    const files: RustScannedMediaFile[] = [];
    const errors: string[] = [];

    try {
      for (;;) {
        const page = await runtime.request<RustScanPageResult>("library.scanNext", {
          sessionId,
          pageSize,
        });
        files.push(...page.files);
        errors.push(...page.errors);
        if (page.done) {
          break;
        }
      }
    } finally {
      await runtime.request("library.scanEnd", { sessionId }).catch(() => undefined);
    }

    // 与旧 `library.scanMediaFiles` 语义一致：按相对路径排序。
    files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

    return { files, errors };
  } catch {
    // Sidecar 不可用时回退 Node 实现（调用方判断 null）。
    return null;
  }
}

/** 调用 Rust `files.sha256`。未启用或不可用时返回 null。 */
export async function sha256FileViaRust(filePath: string): Promise<RustSha256FileResult | null> {
  if (!isRustFileOpsEnabled()) {
    return null;
  }
  try {
    const runtime = await getRuntime();
    return await runtime.request<RustSha256FileResult>("files.sha256", {
      filePath: path.resolve(filePath),
    });
  } catch {
    return null;
  }
}

/** 调用 Rust `archive.createZip`。未启用或不可用时返回 null。 */
export async function createZipViaRust(
  outputPath: string,
  entries: readonly RustZipEntry[],
): Promise<RustCreateZipResult | null> {
  if (!isRustArchiveEnabled()) {
    return null;
  }
  try {
    const runtime = await getRuntime();
    return await runtime.request<RustCreateZipResult>("archive.createZip", {
      outputPath: path.resolve(outputPath),
      entries: entries.map((entry) => ({
        zipPath: entry.zipPath,
        sourcePath: path.resolve(entry.sourcePath),
      })),
    });
  } catch {
    // Sidecar 不可用时回退 Node 实现（调用方判断 null）。
    return null;
  }
}

/** 调用 Rust `image.compressFile`。未启用或不可用时返回 null。 */
export async function compressImageViaRust(options: {
  sourcePath: string;
  outputPath: string;
  ext: string;
  quality: number;
  format: "keep" | "webp";
  maxSide?: number;
}): Promise<RustCompressImageResult | null> {
  if (!isRustImageCompressEnabled()) {
    return null;
  }
  try {
    const runtime = await getRuntime();
    return await runtime.request<RustCompressImageResult>("image.compressFile", {
      sourcePath: path.resolve(options.sourcePath),
      outputPath: path.resolve(options.outputPath),
      ext: options.ext,
      quality: options.quality,
      format: options.format,
      maxSide: options.maxSide ?? 0,
    });
  } catch {
    // Sidecar 不可用时回退 Node 实现（调用方判断 null）。
    return null;
  }
}

/**
 * 调用 Rust `video.compressFile`（后台线程执行 ffmpeg，持续上报进度事件）。
 * 未启用或不可用时返回 null。
 * 参数 `onProgress` 接收 Rust 上报的 `video.progress` 事件中的 fraction。
 */
export async function compressVideoViaRust(options: {
  ffmpegPath: string;
  args: string[];
  timeoutMs: number;
  duration: number;
  onProgress?: (fraction: number) => void;
}): Promise<RustRunFfmpegResult | null> {
  if (!isRustVideoCompressEnabled()) {
    return null;
  }
  try {
    const runtime = await getRuntime();
    const unsubscribe = options.onProgress
      ? runtime.onEvent((event, data) => {
          if (event === "video.progress") {
            const fraction = (data as { fraction?: number } | null)?.fraction;
            if (typeof fraction === "number") {
              options.onProgress?.(fraction);
            }
          }
        })
      : () => undefined;
    try {
      return await runtime.request<RustRunFfmpegResult>("video.compressFile", {
        ffmpegPath: path.resolve(options.ffmpegPath),
        args: options.args,
        timeoutMs: options.timeoutMs,
        duration: options.duration,
      });
    } finally {
      unsubscribe();
    }
  } catch {
    // Sidecar 不可用时回退 Node 实现（调用方判断 null）。
    return null;
  }
}

/** 调用 Rust `video.cancel`，让正在运行的 ffmpeg 尽快退出。 */
export async function cancelVideoViaRust(): Promise<boolean> {
  if (!isRustVideoCompressEnabled()) {
    return false;
  }
  try {
    const runtime = await getRuntime();
    await runtime.request<{ status: string }>("video.cancel", {});
    return true;
  } catch {
    return false;
  }
}

/** 惰性加载运行时单例，避免在无 Electron 环境的单元测试中于模块加载期访问 `app`。 */
async function getRuntime(): Promise<RustCoreRuntime> {
  const { rustCoreRuntime } = await import("./rustCoreRuntime");
  return rustCoreRuntime;
}