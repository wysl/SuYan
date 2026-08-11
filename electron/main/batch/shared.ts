export type CompressProgress = {
  current: number;
  total: number;
  currentItem: string;
  savedBytes: number;
};

export type CompressResult = {
  processedCount: number;
  totalOriginalBytes: number;
  totalCompressedBytes: number;
  skippedExternalCount: number;
  failedItems: { itemId: string; reason: string }[];
};

let compressAbortController = new AbortController();

export function cancelCompress(): void {
  compressAbortController.abort();
  // 若视频压缩运行在 Rust Sidecar，同步通知其取消 ffmpeg。
  void import("../runtime/rustFileOps")
    .then(({ cancelVideoViaRust }) => cancelVideoViaRust())
    .catch(() => undefined);
}

export function resetCompressCancellation(): void {
  compressAbortController = new AbortController();
}

export function isCompressCanceled(): boolean {
  return compressAbortController.signal.aborted;
}
