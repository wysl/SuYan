import { useEffect, useRef, useState } from "react";

export type AutoSaveResult = boolean | string | void;

type UseAutoSaveOptions<T> = {
  delayMs?: number;
  enabled?: boolean;
  isBusy?: boolean;
  onError?: (message: string) => void;
  onSave: (value: T) => Promise<AutoSaveResult>;
  onSaved?: () => void;
  serialize?: (value: T) => string;
  value: T;
};

type UseAutoSaveResult = {
  isSaving: boolean;
};

/** Debounces local draft changes and persists the latest complete snapshot. */
export function useAutoSave<T>({
  delayMs = 250,
  enabled = true,
  isBusy = false,
  onError,
  onSave,
  onSaved,
  serialize = (value) => JSON.stringify(value),
  value,
}: UseAutoSaveOptions<T>): UseAutoSaveResult {
  const [isSaving, setIsSaving] = useState(false);
  const valueRef = useRef(value);
  const signatureRef = useRef(serialize(value));
  const lastObservedSignatureRef = useRef(signatureRef.current);
  const lastSavedSignatureRef = useRef(signatureRef.current);
  const revisionRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const enabledRef = useRef(enabled);
  const isBusyRef = useRef(isBusy);
  const onSaveRef = useRef(onSave);
  const onErrorRef = useRef(onError);
  const onSavedRef = useRef(onSaved);
  const serializeRef = useRef(serialize);
  const flushRef = useRef<(() => Promise<void>) | null>(null);

  valueRef.current = value;
  signatureRef.current = serialize(value);
  enabledRef.current = enabled;
  isBusyRef.current = isBusy;
  onSaveRef.current = onSave;
  onErrorRef.current = onError;
  onSavedRef.current = onSaved;
  serializeRef.current = serialize;

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function scheduleFlush() {
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flushRef.current?.();
    }, delayMs);
  }

  async function flush() {
    if (inFlightRef.current) {
      return;
    }

    if (!enabledRef.current || isBusyRef.current) {
      return;
    }

    const requestSignature = signatureRef.current;
    if (requestSignature === lastSavedSignatureRef.current) {
      return;
    }

    const requestRevision = revisionRef.current;
    inFlightRef.current = true;

    if (mountedRef.current) {
      setIsSaving(true);
    }

    try {
      const result = await onSaveRef.current(valueRef.current);
      const succeeded = result === true || typeof result === "undefined";

      if (requestRevision === revisionRef.current) {
        if (succeeded) {
          lastSavedSignatureRef.current = requestSignature;
          onSavedRef.current?.();
        } else {
          onErrorRef.current?.(
            typeof result === "string" && result.trim() ? result : "自动保存失败，请稍后重试。",
          );
        }
      }
    } catch (error) {
      if (requestRevision === revisionRef.current) {
        onErrorRef.current?.(error instanceof Error ? error.message : "自动保存失败，请稍后重试。");
      }
    } finally {
      inFlightRef.current = false;

      if (mountedRef.current) {
        setIsSaving(false);
      }

      if (
        mountedRef.current &&
        signatureRef.current !== lastSavedSignatureRef.current &&
        enabledRef.current &&
        !isBusyRef.current
      ) {
        scheduleFlush();
      }
    }
  }

  flushRef.current = flush;

  useEffect(() => {
    const signature = signatureRef.current;

    if (signature !== lastObservedSignatureRef.current) {
      lastObservedSignatureRef.current = signature;
      revisionRef.current += 1;
    }

    if (signature === lastSavedSignatureRef.current) {
      clearTimer();
      return;
    }

    if (enabled && !isBusy) {
      scheduleFlush();
    }
  }, [delayMs, enabled, isBusy, serialize, value]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, []);

  return { isSaving };
}
