import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AppDialog } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";

export type ConfirmDialogTone = "danger" | "primary";

export type ConfirmDialogProps = {
  cancelLabel?: string;
  confirmLabel?: string;
  description: ReactNode;
  icon?: ReactNode;
  isBusy?: boolean;
  /** Busy button label while confirm is in progress. */
  busyLabel?: string;
  open: boolean;
  title: string;
  /** Visual tone for the confirm action. Defaults to danger (destructive). */
  tone?: ConfirmDialogTone;
  titleId?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Centered in-app confirm dialog. Prefer this over window.confirm / native
 * message boxes so destructive actions match the rest of the UI.
 * Portaled to document.body so transformed cards (hover previews) cannot cover it.
 */
export function ConfirmDialog({
  cancelLabel = "取消",
  confirmLabel = "确定",
  description,
  icon,
  isBusy = false,
  busyLabel = "处理中…",
  open,
  title,
  tone = "danger",
  titleId = "confirm-dialog-title",
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isBusy) {
        event.preventDefault();
        onCancel();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isBusy, onCancel, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const confirmVariant = tone === "danger" ? "danger" : "primary";
  const iconWrapClassName =
    tone === "danger"
      ? "bg-danger-soft text-danger"
      : "bg-primary-soft text-foreground";

  return createPortal(
    <AppDialog
      overlayClassName="z-[200] px-4 py-8"
      panelClassName="relative z-[201] flex w-full max-w-md flex-col"
      titleId={titleId}
      onClose={() => {
        if (!isBusy) {
          onCancel();
        }
      }}
    >
      <div className="flex items-start gap-3 px-5 pt-5">
        {icon ? (
          <span
            className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl ${iconWrapClassName}`}
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="text-base font-semibold text-foreground" id={titleId}>
            {title}
          </h2>
          <div className="mt-2 text-sm leading-6 text-muted">{description}</div>
        </div>
      </div>

      <footer className="mt-5 flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
        <Button disabled={isBusy} type="button" variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          disabled={isBusy}
          type="button"
          variant={confirmVariant}
          onClick={onConfirm}
        >
          {isBusy ? busyLabel : confirmLabel}
        </Button>
      </footer>
    </AppDialog>,
    document.body,
  );
}
