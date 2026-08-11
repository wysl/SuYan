import { useEffect, useMemo, useState } from "react";
import { Blocks, LoaderCircle, RefreshCw } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { Capsule } from "@/components/ui/Capsule";
import { useLibraryStore } from "../store/useLibraryStore";
import {
  buildModuleManagementRows,
  groupModuleManagementRows,
  isVideoRuntimeModule,
  type ModuleManagementRow,
} from "../utils/moduleManagement";
import type { BuiltinModuleId } from "../utils/moduleRegistry";
import {
  resolveStatusFeedbackTone,
  type StatusFeedbackMessage,
} from "../utils/statusFeedback";
import { VideoRuntimeInstallBanner } from "./VideoRuntimeInstallBanner";

type ModuleManagementDialogProps = {
  isBusy: boolean;
  /** 嵌入系统设置壳时不渲染 AppDialog 外框。 */
  embedded?: boolean;
  onClose?: () => void;
  onNotify?: (message: StatusFeedbackMessage) => void;
};

export function ModuleManagementDialog({
  isBusy,
  embedded = false,
  onClose,
  onNotify,
}: ModuleManagementDialogProps) {
  const moduleState = useLibraryStore((state) => state.moduleState);
  const setModuleState = useLibraryStore((state) => state.setModuleState);
  const checkVideoRuntime = useLibraryStore((state) => state.checkVideoRuntime);
  const [isProbing, setIsProbing] = useState(true);
  const [togglingModuleId, setTogglingModuleId] = useState<BuiltinModuleId | null>(null);
  const [feedbackText, setFeedbackText] = useState("");

  useEffect(() => {
    let disposed = false;

    void (async () => {
      setIsProbing(true);
      try {
        await checkVideoRuntime();
      } finally {
        if (!disposed) {
          setIsProbing(false);
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, [checkVideoRuntime]);

  useEffect(() => {
    const text = feedbackText.trim();
    if (!text) {
      return;
    }

    onNotify?.({
      text,
      type: resolveStatusFeedbackTone(text),
    });
  }, [feedbackText, onNotify]);

  const groups = useMemo(
    () => groupModuleManagementRows(buildModuleManagementRows(moduleState)),
    [moduleState],
  );

  const isActionBusy = isBusy || isProbing || togglingModuleId !== null;

  async function handleRefreshRuntime() {
    if (isActionBusy) {
      return;
    }

    setIsProbing(true);
    setFeedbackText("正在检测视频运行时...");
    try {
      const installed = await checkVideoRuntime();
      setFeedbackText(installed ? "视频运行时可用。" : "未检测到视频运行时（FFmpeg）。");
    } finally {
      setIsProbing(false);
    }
  }

  async function handleToggleEnabled(row: ModuleManagementRow, nextEnabled: boolean) {
    if (!row.canToggleEnabled || isActionBusy) {
      return;
    }

    const moduleId = row.definition.id;
    setTogglingModuleId(moduleId);
    try {
      const ok = await setModuleState({
        [moduleId]: {
          installed: row.installed,
          enabled: nextEnabled,
        },
      });
      setFeedbackText(
        ok
          ? nextEnabled
            ? `已启用「${row.definition.label}」。`
            : `已停用「${row.definition.label}」。`
          : `更新「${row.definition.label}」失败。`,
      );
    } finally {
      setTogglingModuleId(null);
    }
  }

  const body = (
      <div className={`grid min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain ${embedded ? "px-1 py-1" : "px-5 py-5"}`}>
        <div className="flex justify-end">
          <Button
            aria-label="重新检测视频运行时"
            className="min-h-9 px-2.5 text-xs"
            disabled={isActionBusy}
            type="button"
            variant="ghost"
            onClick={() => void handleRefreshRuntime()}
          >
            {isProbing ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            检测运行时
          </Button>
        </div>
        {groups.map((group) => (
          <section key={group.category} className="grid gap-3 rounded-md border border-border bg-background p-4">
            <div>
              <p className="text-sm font-semibold text-foreground">{group.label}</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                {group.category === "runtime"
                  ? "运行时提供底层编解码能力；视频运行时不随安装包分发。"
                  : group.category === "batch"
                    ? "批量工具依赖对应运行时；停用后工具入口会隐藏。"
                    : group.category === "core"
                      ? "核心模块始终启用，不可关闭。"
                      : "提示词卡片控制素材展示与编辑能力。"}
              </p>
            </div>

            <div className="grid gap-3">
              {group.rows.map((row) => (
                <ModuleRow
                  key={row.definition.id}
                  isBusy={isActionBusy}
                  isToggling={togglingModuleId === row.definition.id}
                  row={row}
                  onToggleEnabled={(next) => void handleToggleEnabled(row, next)}
                  onVideoRuntimeInstalled={() => {
                    setFeedbackText("视频运行时已安装并启用。");
                  }}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
  );

  if (embedded) {
    return body;
  }

  return (
    <AppDialog
      panelClassName="flex max-h-[92vh] w-full max-w-3xl flex-col"
      titleId="module-management-title"
      onClose={onClose ?? (() => undefined)}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-foreground">
            <Blocks size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold" id="module-management-title">
              模块管理
            </h2>
            <p className="mt-1 text-sm text-muted">启用功能模块；视频运行时按需安装 FFmpeg</p>
          </div>
        </div>
        <DialogCloseButton onClick={() => onClose?.()} />
      </header>
      {body}
    </AppDialog>
  );
}

function ModuleRow({
  row,
  isBusy,
  isToggling,
  onToggleEnabled,
  onVideoRuntimeInstalled,
}: {
  row: ModuleManagementRow;
  isBusy: boolean;
  isToggling: boolean;
  onToggleEnabled: (nextEnabled: boolean) => void;
  onVideoRuntimeInstalled: () => void;
}) {
  const { definition } = row;
  const isVideoRuntime = isVideoRuntimeModule(definition.id);
  const showInstallBanner = isVideoRuntime && !row.installed;

  return (
    <div className="grid gap-3 rounded-md border border-border/80 bg-panel/40 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{definition.label}</p>
            {!row.canDisable ? (
              <Capsule size="sm" tone="stone" variant="outline">
                必需
              </Capsule>
            ) : null}
            {row.installed ? (
              <Capsule size="sm" tone="sage" variant="outline">
                已安装
              </Capsule>
            ) : (
              <Capsule size="sm" tone="sand" variant="outline">
                未安装
              </Capsule>
            )}
            {row.effectivelyEnabled ? (
              <Capsule size="sm" tone="mist" variant="outline">
                可用
              </Capsule>
            ) : (
              <Capsule size="sm" tone="stone" variant="outline">
                不可用
              </Capsule>
            )}
            {row.blockedByDependencies ? (
              <Capsule size="sm" tone="clay" variant="outline">
                依赖未满足
              </Capsule>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted">{definition.description}</p>
          {row.dependencyLabels.length > 0 ? (
            <p className="mt-1 text-[11px] text-muted">依赖：{row.dependencyLabels.join("、")}</p>
          ) : null}
        </div>

        <label className="flex shrink-0 items-center gap-2 text-xs text-muted">
          <span>{row.rawEnabled ? "已启用" : "已停用"}</span>
          <input
            aria-label={`${definition.label}启用开关`}
            checked={row.rawEnabled}
            className="size-4 accent-[var(--color-primary)]"
            disabled={!row.canToggleEnabled || isBusy}
            type="checkbox"
            onChange={(event) => onToggleEnabled(event.target.checked)}
          />
          {isToggling ? <LoaderCircle size={12} className="animate-spin" /> : null}
        </label>
      </div>

      {showInstallBanner ? (
        <VideoRuntimeInstallBanner
          message="视频运行时未安装。可在线下载验签安装，或离线导入已签名的组件包。"
          onInstalled={onVideoRuntimeInstalled}
        />
      ) : null}

      {isVideoRuntime && row.installed ? (
        <p className="text-[11px] leading-5 text-muted">
          已安装的 FFmpeg 组件保留在本地；停用只会隐藏依赖它的批量能力，不会删除二进制。
        </p>
      ) : null}
    </div>
  );
}
