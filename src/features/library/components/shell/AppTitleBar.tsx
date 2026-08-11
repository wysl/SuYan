import { useEffect, useState } from "react";
import { Copy, Minus, PanelLeftClose, PanelLeftOpen, Square, X } from "lucide-react";
import { AppLogoMark } from "@/components/ui/AppLogoMark";

type SidebarToggleButtonProps = {
  isOpen: boolean;
  onClick: () => void;
};

type AppTitleBarProps = {
  isSidebarOpen: boolean;
  overlayActive: boolean;
  onToggleSidebar: () => void;
};

export function AppTitleBar({ isSidebarOpen, overlayActive, onToggleSidebar }: AppTitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(true);

  useEffect(() => {
    let unsubscribe = () => {};
    window.suyanApi.isWindowMaximized().then((result) => {
      if (result.ok && result.data) {
        setIsMaximized(result.data.maximized);
      }
    });
    unsubscribe = window.suyanApi.onWindowMaximizeChange((maximized) => {
      setIsMaximized(maximized);
    });
    return () => unsubscribe();
  }, []);

  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-panel/95 pl-3 pr-2 shadow-sm backdrop-blur [-webkit-app-region:drag]">
      <div className="flex min-w-0 items-center gap-2.5">
        <SidebarToggleButton isOpen={isSidebarOpen} onClick={onToggleSidebar} />
        <AppLogoMark />
        <span className="truncate text-sm font-semibold text-foreground">素言</span>
      </div>
      <div className={`flex items-center gap-1 [-webkit-app-region:no-drag] ${overlayActive ? "hidden" : ""}`}>
        <button
          aria-label="最小化"
          className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-border/60 hover:text-foreground"
          type="button"
          onClick={() => void window.suyanApi.minimizeWindow()}
        >
          <Minus size={15} />
        </button>
        <button
          aria-label={isMaximized ? "向下还原" : "最大化"}
          className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-border/60 hover:text-foreground"
          type="button"
          onClick={() => void window.suyanApi.toggleMaximizeWindow()}
        >
          {isMaximized ? <Copy size={13} /> : <Square size={12} />}
        </button>
        <button
          aria-label="关闭"
          className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-danger hover:text-primary-foreground"
          type="button"
          onClick={() => void window.suyanApi.closeWindow()}
        >
          <X size={15} />
        </button>
      </div>
    </header>
  );
}

function SidebarToggleButton({ isOpen, onClick }: SidebarToggleButtonProps) {
  const label = isOpen ? "隐藏边栏" : "显示边栏";

  return (
    <button
      aria-label={label}
      className="icon-tooltip-button flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted shadow-none [-webkit-app-region:no-drag] transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      data-tooltip-align="start"
      data-tooltip-placement="below"
      type="button"
      onClick={onClick}
    >
      {isOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
      <span className="icon-tooltip-button__bubble" role="tooltip">
        {label}
      </span>
    </button>
  );
}
