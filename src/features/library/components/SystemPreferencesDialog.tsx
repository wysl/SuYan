import type { ReactNode } from "react";
import { Blocks, Gauge, ImageIcon, Settings2, Wifi } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import type { ProxyDetectionData, ProxySettings } from "../types/proxy";
import type { StatusFeedbackMessage } from "../utils/statusFeedback";
import {
  systemPreferenceSectionMeta,
  systemPreferenceSections,
  type SystemPreferenceSection,
} from "../utils/systemPreferences";
import { ModuleManagementDialog } from "./ModuleManagementDialog";
import { PerformanceSettingsDialog } from "./PerformanceSettingsDialog";
import { ProxySettingsDialog } from "./ProxySettingsDialog";
import { StartupGallerySettingsDialog } from "./StartupGallerySettingsDialog";

type SystemPreferencesDialogProps = {
  isBusy: boolean;
  section: SystemPreferenceSection;
  proxySettings: ProxySettings;
  onSectionChange: (section: SystemPreferenceSection) => void;
  onClose: () => void;
  onDetectProxy: () => Promise<ProxyDetectionData | null>;
  onSaveProxy: (settings: ProxySettings) => Promise<boolean>;
  onTestProxy: (settings: ProxySettings) => Promise<boolean>;
  onNotify?: (message: StatusFeedbackMessage) => void;
};

const sectionIcons: Record<SystemPreferenceSection, ReactNode> = {
  proxy: <Wifi size={16} />,
  performance: <Gauge size={16} />,
  modules: <Blocks size={16} />,
  startupGallery: <ImageIcon size={16} />,
};

/**
 * 系统偏好统一壳：网络 / 启动加速 / 模块 / 启动图库。
 * 模型配置与内容分级因体量与作业属性保持独立弹窗。
 */
export function SystemPreferencesDialog({
  isBusy,
  section,
  proxySettings,
  onSectionChange,
  onClose,
  onDetectProxy,
  onSaveProxy,
  onTestProxy,
  onNotify,
}: SystemPreferencesDialogProps) {
  const activeMeta = systemPreferenceSectionMeta[section];

  return (
    <AppDialog
      panelClassName="flex max-h-[92vh] w-full max-w-5xl flex-col"
      titleId="system-preferences-title"
      onClose={onClose}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-foreground">
            <Settings2 size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold" id="system-preferences-title">
              系统设置
            </h2>
            <p className="mt-1 text-sm text-muted">
              {activeMeta.label} · {activeMeta.description}
            </p>
          </div>
        </div>
        <DialogCloseButton onClick={onClose} />
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[12.5rem_minmax(0,1fr)]">
        <nav
          aria-label="系统设置分区"
          className="flex gap-1 overflow-x-auto border-b border-border px-3 py-3 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r md:px-3 md:py-4"
        >
          {systemPreferenceSections.map((entry) => {
            const meta = systemPreferenceSectionMeta[entry];
            const selected = entry === section;

            return (
              <button
                aria-current={selected ? "page" : undefined}
                className={`flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
                  selected
                    ? "bg-primary-soft font-semibold text-foreground"
                    : "text-muted hover:bg-panel hover:text-foreground"
                }`}
                key={entry}
                type="button"
                onClick={() => onSectionChange(entry)}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-background">
                  {sectionIcons[entry]}
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{meta.label}</span>
                  <span className="mt-0.5 hidden text-[11px] font-normal leading-4 text-muted md:block">
                    {meta.description}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden px-4 py-4 md:px-5">
          {section === "proxy" ? (
            <ProxySettingsDialog
              embedded
              isBusy={isBusy}
              settings={proxySettings}
              onDetect={onDetectProxy}
              onSave={onSaveProxy}
              onTest={onTestProxy}
              onNotify={onNotify}
            />
          ) : null}
          {section === "performance" ? (
            <PerformanceSettingsDialog embedded isBusy={isBusy} onNotify={onNotify} />
          ) : null}
          {section === "modules" ? (
            <ModuleManagementDialog embedded isBusy={isBusy} onNotify={onNotify} />
          ) : null}
          {section === "startupGallery" ? (
            <StartupGallerySettingsDialog embedded isBusy={isBusy} onNotify={onNotify} />
          ) : null}
        </div>
      </div>
    </AppDialog>
  );
}
