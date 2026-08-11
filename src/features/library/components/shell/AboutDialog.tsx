import { useState } from "react";
import { ExternalLink, FolderOpen, RefreshCw } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import type { AppUpdateCheckData } from "@/types/suyanApi";
import { appVersion, suyanGithubReleasesUrl } from "../../appVersion";

type AboutDialogProps = {
  onClose: () => void;
};

export function AboutDialog({ onClose }: AboutDialogProps) {
  const [isReleaseNotesVisible, setIsReleaseNotesVisible] = useState(true);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updateCheckResult, setUpdateCheckResult] = useState<AppUpdateCheckData | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const displayedVersion = updateCheckResult?.currentVersion ?? appVersion;
  const updateStatusClassName =
    updateCheckResult?.status === "update_available"
      ? "text-primary"
      : updateCheckResult?.status === "network_error"
        ? "text-danger"
        : "text-muted";
  const updatePageLabel = updateCheckResult?.status === "update_available" ? "前往下载" : "打开发布页";
  const isUpdateAvailable = updateCheckResult?.status === "update_available";

  const handleCheckUpdates = async () => {
    if (isCheckingUpdates) {
      return;
    }

    setIsCheckingUpdates(true);
    setUpdateStatus("正在连接 GitHub Releases...");

    try {
      const result = await window.suyanApi.checkForUpdates();
      if (result.ok) {
        setUpdateCheckResult(result.data);
        setUpdateStatus(result.data.message);
      } else {
        setUpdateCheckResult(null);
        setUpdateStatus(result.error.message);
      }
    } catch {
      setUpdateCheckResult(null);
      setUpdateStatus("检查更新失败，请稍后重试。");
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const handleOpenUpdatePage = async () => {
    const result = await window.suyanApi.openExternalUrl(updateCheckResult?.releaseUrl ?? suyanGithubReleasesUrl);
    if (!result.ok) {
      setUpdateStatus(result.error.message);
    }
  };

  const handleOpenDataDirectory = async () => {
    setBackupStatus(null);

    try {
      const result = await window.suyanApi.openDataDirectory();
      if (!result.ok) {
        setBackupStatus(result.error.message);
      }
    } catch {
      setBackupStatus("无法打开数据目录，请手动定位软件安装目录下的 data 文件夹。");
    }
  };

  return (
    <AppDialog
      overlayClassName="z-40 px-6 py-8"
      panelClassName="flex max-h-full w-full max-w-lg flex-col"
      titleId="about-dialog-title"
      onClose={onClose}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold" id="about-dialog-title">
            关于素言
          </h2>
          <p className="mt-1 text-sm text-muted">本地提示词与图像素材管理工具</p>
        </div>
        <DialogCloseButton onClick={onClose} />
      </header>

      <div className="grid gap-4 overflow-y-auto px-5 py-4">
        <section className="grid gap-2 rounded-xl border border-border bg-background p-4">
          <div className="grid gap-2 text-sm">
            <InfoRow label="软件名称" value="素言" />
            <InfoRow label="版本" value={displayedVersion} />
            <InfoRow label="软件描述" value="本地 AI 提示词与图像素材管理工具" />
          </div>
        </section>

        <section className="grid gap-3 rounded-xl border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">软件功能</h3>
            <button
              className="rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-primary-soft hover:text-foreground"
              type="button"
              onClick={() => setIsReleaseNotesVisible((current) => !current)}
            >
              {isReleaseNotesVisible ? "收起" : "查看"}
            </button>
          </div>
          {isReleaseNotesVisible ? (
            <ul className="grid gap-2 text-sm leading-6 text-muted">
              <li>本地管理提示词、图片与视频效果图。</li>
              <li>支持文件、剪贴板、Word 文档与网页导入。</li>
              <li>分类、标签和 NSFW 分级整理。</li>
              <li>AI 分析、优化、翻译与图片反推提示词。</li>
              <li>批量压缩、重复扫描、启动图库和日志反馈。</li>
            </ul>
          ) : null}
        </section>

        <section className="grid gap-3 rounded-xl border border-border bg-background p-4">
          <h3 className="text-sm font-semibold">检查更新</h3>
          <p className="text-sm leading-6 text-muted">从 GitHub Releases 获取最新版本：guliacer/SuYan。</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="w-fit"
              disabled={isCheckingUpdates}
              icon={<RefreshCw className={isCheckingUpdates ? "animate-spin" : ""} size={16} />}
              onClick={() => {
                void handleCheckUpdates();
              }}
            >
              {isCheckingUpdates ? "检查中..." : "检查更新"}
            </Button>
            <Button
              className="w-fit"
              icon={<ExternalLink size={16} />}
              onClick={() => {
                void handleOpenUpdatePage();
              }}
              variant={updateCheckResult?.status === "update_available" ? "primary" : "secondary"}
            >
              {updatePageLabel}
            </Button>
          </div>
          {updateStatus ? <p className={`text-sm leading-6 ${updateStatusClassName}`}>{updateStatus}</p> : null}
          {isUpdateAvailable ? (
            <div className="grid gap-2 rounded-xl border border-danger/20 bg-danger-soft/40 p-3">
              <p className="text-sm font-semibold text-danger">升级前请先备份数据</p>
              <p className="text-sm leading-6 text-muted">
                安装版和便携版都可以直接覆盖升级，但你的素材库、设置和词库都保存在软件目录下的 data
                文件夹里：安装版升级会重建软件目录并删除它，便携版换目录解压则不会自动带过去。
              </p>
              <p className="text-sm leading-6 text-muted">
                升级前请打开数据目录，把整个 data 文件夹复制到软件目录之外备份；升级后把它复制回新版软件目录即可还原。
                「导出分享包」只包含素材条目，不是完整备份，不能用来做升级备份。
              </p>
              <Button
                className="w-fit"
                icon={<FolderOpen size={16} />}
                onClick={() => {
                  void handleOpenDataDirectory();
                }}
                variant="secondary"
              >
                打开数据目录
              </Button>
              {backupStatus ? <p className="text-sm leading-6 text-danger">{backupStatus}</p> : null}
            </div>
          ) : null}
        </section>
      </div>
    </AppDialog>
  );
}

type InfoRowProps = {
  label: string;
  value: string;
};

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
      <span className="text-muted">{label}</span>
      <span className="min-w-0 truncate text-foreground">{value}</span>
    </div>
  );
}
