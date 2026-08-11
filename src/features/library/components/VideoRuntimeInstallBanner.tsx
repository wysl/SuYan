import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { useLibraryStore } from "../store/useLibraryStore";

type VideoRuntimeInstallBannerProps = {
  message: string;
  /** 是否显示警告图标（详情页用）。 */
  showIcon?: boolean;
  className?: string;
  onInstalled?: () => void;
};

const actionButtonClass =
  "inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:opacity-50";

/**
 * 视频运行时（FFmpeg）缺失时的统一安装入口：下载安装 + 离线导入。
 * PromptDetailDialog / VideoCompressPanel 共用，避免按钮文案与样式分叉。
 */
export function VideoRuntimeInstallBanner({
  message,
  showIcon = false,
  className = "",
  onInstalled,
}: VideoRuntimeInstallBannerProps) {
  const installModule = useLibraryStore((state) => state.installModule);
  const [isInstalling, setIsInstalling] = useState(false);

  async function install(source: "download" | "local" = "download") {
    if (isInstalling) {
      return;
    }
    setIsInstalling(true);
    try {
      const ok = await installModule("video-runtime", { source });
      if (ok) {
        onInstalled?.();
      }
    } finally {
      setIsInstalling(false);
    }
  }

  return (
    <div
      className={`flex flex-col gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-foreground ${className}`.trim()}
    >
      <div className="flex items-center gap-2">
        {showIcon ? <AlertCircle size={14} className="shrink-0 text-warning" /> : null}
        <span>{message}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          aria-label="下载并安装视频运行时（FFmpeg）"
          className={actionButtonClass}
          disabled={isInstalling}
          type="button"
          onClick={() => void install("download")}
        >
          {isInstalling ? "安装中…" : "下载并安装（FFmpeg）"}
        </button>
        <button
          aria-label="从本地文件离线导入视频运行时"
          className={actionButtonClass}
          disabled={isInstalling}
          type="button"
          onClick={() => void install("local")}
        >
          离线导入
        </button>
      </div>
    </div>
  );
}
