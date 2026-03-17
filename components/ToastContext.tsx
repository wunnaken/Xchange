"use client";

import { createContext, useCallback, useContext, useState } from "react";

export type ToastType = "success" | "warning" | "info" | "celebration" | "error";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

type ToastContextValue = {
  toasts: ToastItem[];
  showToast: (message: string, type?: ToastType, durationMs?: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let id = 0;
const AUTO_DISMISS_MS = 3000;

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx)
    return {
      toasts: [],
      showToast: (_m: string, _t?: ToastType, _d?: number) => {},
    };
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info", durationMs?: number) => {
    const item: ToastItem = { id: String(++id), message, type };
    setToasts((prev) => [...prev, item]);
    const duration = durationMs ?? AUTO_DISMISS_MS;
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== item.id));
    }, duration);
  }, []);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg transition-all duration-300 animate-[fadeIn_0.2s_ease-out] ${
              t.type === "success"
                ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-100"
                : t.type === "error"
                  ? "border-red-500/40 bg-red-500/20 text-red-100"
                  : t.type === "warning"
                    ? "border-amber-500/40 bg-amber-500/20 text-amber-100"
                    : t.type === "celebration"
                      ? "border-[var(--accent-color)]/50 bg-[var(--accent-color)]/20 text-zinc-100"
                      : "border-white/20 bg-[#0F1520] text-zinc-100"
            }`}
          >
            <span className="text-sm font-medium">{t.message}</span>
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="ml-2 rounded p-1 opacity-70 hover:opacity-100"
              aria-label="Dismiss"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
