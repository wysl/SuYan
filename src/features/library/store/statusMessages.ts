import { getUiErrorMessage } from "../utils/uiMessages";

export type StatusMessage = {
  type: "success" | "error" | "info";
  text: string;
  autoDismissMs: number | null;
};

export const statusToastAutoDismissMs = 1_800;

export function successStatus(text: string): StatusMessage {
  return { type: "success", text, autoDismissMs: statusToastAutoDismissMs };
}

export function progressStatus(text: string): StatusMessage {
  return { type: "info", text, autoDismissMs: null };
}

export function infoStatus(text: string): StatusMessage {
  return { type: "info", text, autoDismissMs: statusToastAutoDismissMs };
}

export function failureStatus(text: string): StatusMessage {
  return { type: "error", text, autoDismissMs: statusToastAutoDismissMs };
}

export function errorStatus(code: string, fallback: string): StatusMessage {
  return { type: "error", text: getUiErrorMessage(code, fallback), autoDismissMs: statusToastAutoDismissMs };
}

export function formatSavedBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
