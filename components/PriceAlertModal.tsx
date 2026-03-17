"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type PriceAlert,
  type PriceAlertCondition,
  getPriceAlerts,
  savePriceAlerts,
  generateAlertId,
  MAX_ALERTS_FREE,
} from "../lib/price-alerts";
import { addToWatchlistApi } from "../lib/watchlist-api";
import { useToast } from "./ToastContext";

const POPULAR_TICKERS = ["SPY", "QQQ", "AAPL", "NVDA", "TSLA", "BTC", "ETH", "MSFT", "GOOGL", "AMZN", "META"];

type Props = {
  open: boolean;
  onClose: () => void;
  /** When editing, pass the existing alert. */
  editingAlert?: PriceAlert | null;
  /** Pre-fill ticker (e.g. from watchlist bell). */
  prefilledTicker?: string;
  onSaved?: () => void;
};

function formatPrice(p: number) {
  return p >= 1 ? `$${p.toFixed(2)}` : `$${p.toFixed(4)}`;
}

export function PriceAlertModal({ open, onClose, editingAlert, prefilledTicker, onSaved }: Props) {
  const { showToast } = useToast();
  const [ticker, setTicker] = useState("");
  const [company, setCompany] = useState("");
  const [condition, setCondition] = useState<PriceAlertCondition>("above");
  const [targetPriceRaw, setTargetPriceRaw] = useState("");
  const [name, setName] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [notifyBrowser, setNotifyBrowser] = useState(true);
  const [notifyInApp, setNotifyInApp] = useState(true);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);

  const targetPrice = parseFloat(targetPriceRaw) || 0;
  const isEdit = !!editingAlert;

  const fetchQuote = useCallback(async (sym: string) => {
    const s = sym.toUpperCase().trim();
    if (!s) {
      setCurrentPrice(null);
      return;
    }
    setLoadingQuote(true);
    try {
      const res = await fetch(`/api/ticker-quote?ticker=${encodeURIComponent(s)}`, { cache: "no-store" });
      const data = await res.json();
      if (data?.price != null) setCurrentPrice(data.price);
      else setCurrentPrice(null);
    } catch {
      setCurrentPrice(null);
    } finally {
      setLoadingQuote(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (editingAlert) {
      setTicker(editingAlert.ticker);
      setCompany(editingAlert.company || "");
      setCondition(editingAlert.condition);
      setTargetPriceRaw(String(editingAlert.targetPrice));
      setName(editingAlert.name || "");
      setRepeat(editingAlert.repeat);
      setNotifyBrowser(editingAlert.notifyBrowser);
      setNotifyInApp(editingAlert.notifyInApp);
      setCurrentPrice(editingAlert.currentPrice ?? null);
      fetchQuote(editingAlert.ticker);
    } else {
      setTicker(prefilledTicker?.toUpperCase().trim() || "");
      setCompany("");
      setCondition("above");
      setTargetPriceRaw("");
      setName("");
      setRepeat(false);
      setNotifyBrowser(true);
      setNotifyInApp(true);
      setCurrentPrice(null);
      if (prefilledTicker) fetchQuote(prefilledTicker);
    }
  }, [open, editingAlert, prefilledTicker, fetchQuote]);

  useEffect(() => {
    if (!open || !ticker) return;
    const t = setTimeout(() => fetchQuote(ticker), 400);
    return () => clearTimeout(t);
  }, [open, ticker, fetchQuote]);

  const defaultName = ticker
    ? `${ticker} ${condition === "above" ? "above" : "below"} $${targetPrice ? targetPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`
    : "";
  const displayName = name.trim() || defaultName;

  const pctDiff =
    currentPrice != null && currentPrice > 0 && targetPrice > 0
      ? ((targetPrice - currentPrice) / currentPrice) * 100
      : null;

  const handleSubmit = useCallback(() => {
    const sym = ticker.toUpperCase().trim();
    if (!sym) {
      showToast("Enter a ticker symbol", "warning");
      return;
    }
    if (targetPrice <= 0) {
      showToast("Enter a valid target price", "warning");
      return;
    }
    const list = getPriceAlerts();
    if (!isEdit && list.length >= MAX_ALERTS_FREE) {
      showToast("Upgrade to Pro for unlimited alerts", "warning");
      return;
    }
    const now = new Date().toISOString();
    if (isEdit && editingAlert) {
      const next = list.map((a) =>
        a.id === editingAlert.id
          ? {
              ...a,
              ticker: sym,
              company: company.trim() || sym,
              condition,
              targetPrice,
              currentPrice: currentPrice ?? a.currentPrice,
              name: name.trim() || defaultName,
              repeat,
              notifyBrowser,
              notifyInApp,
            }
          : a
      );
      savePriceAlerts(next);
      showToast("Alert updated");
      onSaved?.();
      onClose();
    } else {
      const newAlert: PriceAlert = {
        id: generateAlertId(),
        ticker: sym,
        company: company.trim() || sym,
        condition,
        targetPrice,
        currentPrice: currentPrice ?? 0,
        name: name.trim() || defaultName,
        createdAt: now,
        triggeredAt: null,
        status: "active",
        repeat,
        notifyBrowser,
        notifyInApp,
      };
      savePriceAlerts([...list, newAlert]);
      // Auto-add ticker to watchlist if not already there
      addToWatchlistApi({ ticker: sym, name: company.trim() || sym }).catch(() => {});
      showToast("Alert created");
      onSaved?.();
      onClose();
    }
  }, [
    ticker,
    company,
    condition,
    targetPrice,
    name,
    defaultName,
    repeat,
    notifyBrowser,
    notifyInApp,
    currentPrice,
    isEdit,
    editingAlert,
    showToast,
    onSaved,
    onClose,
  ]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="price-alert-modal-title">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/10 py-6 px-5 shadow-2xl animate-[fadeIn_0.2s_ease-out]"
        style={{ backgroundColor: "#0F1520" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="price-alert-modal-title" className="text-lg font-semibold text-zinc-100">
          {isEdit ? "Edit Alert" : "Create Price Alert"}
        </h2>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400">Ticker</label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g. NVDA"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-[var(--accent-color)] focus:outline-none"
              list="price-alert-tickers"
            />
            <datalist id="price-alert-tickers">
              {POPULAR_TICKERS.filter((t) => t.toUpperCase().includes(ticker.toUpperCase()) || !ticker).slice(0, 8).map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            {loadingQuote && <p className="mt-1 text-xs text-zinc-500">Loading price…</p>}
            {!loadingQuote && currentPrice != null && <p className="mt-1 text-xs text-zinc-400">Current: {formatPrice(currentPrice)}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400">Condition</label>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setCondition("above")}
                className={`flex-1 rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                  condition === "above"
                    ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                    : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10"
                }`}
              >
                Price goes ABOVE
              </button>
              <button
                type="button"
                onClick={() => setCondition("below")}
                className={`flex-1 rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                  condition === "below"
                    ? "border-red-500/50 bg-red-500/20 text-red-300"
                    : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10"
                }`}
              >
                Price goes BELOW
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400">Target price</label>
            <input
              type="number"
              step="any"
              min="0"
              value={targetPriceRaw}
              onChange={(e) => setTargetPriceRaw(e.target.value)}
              placeholder="0.00"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-[var(--accent-color)] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            {pctDiff != null && currentPrice != null && targetPrice > 0 && (
              <p className={`mt-1 text-xs font-medium ${pctDiff >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                <span className="inline-block" aria-hidden>
                  {pctDiff >= 0 ? "↑" : "↓"}
                </span>{" "}
                {pctDiff >= 0 ? `${pctDiff.toFixed(1)}% above current price` : `${Math.abs(pctDiff).toFixed(1)}% below current price`}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400">Alert name (optional)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. NVDA breakout target"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-[var(--accent-color)] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400">Repeat</label>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setRepeat(false)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${!repeat ? "border-[var(--accent-color)]/50 bg-[var(--accent-color)]/10 text-[var(--accent-color)]" : "border-white/10 bg-white/5 text-zinc-400"}`}
              >
                Alert once
              </button>
              <button
                type="button"
                onClick={() => setRepeat(true)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${repeat ? "border-[var(--accent-color)]/50 bg-[var(--accent-color)]/10 text-[var(--accent-color)]" : "border-white/10 bg-white/5 text-zinc-400"}`}
              >
                Repeat every time price crosses
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400">Notify via</label>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={notifyBrowser} onChange={(e) => setNotifyBrowser(e.target.checked)} className="rounded border-white/20" />
                <span className="text-sm text-zinc-300">Browser notification</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={notifyInApp} onChange={(e) => setNotifyInApp(e.target.checked)} className="rounded border-white/20" />
                <span className="text-sm text-zinc-300">In-app notification bell</span>
              </label>
              <label className="flex items-center gap-2 opacity-60">
                <input type="checkbox" disabled className="rounded border-white/20" />
                <span className="text-sm text-zinc-500">Email (coming soon)</span>
              </label>
            </div>
          </div>

          {ticker && (
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
              <p className="text-zinc-200">
                Alert when {ticker} goes{" "}
                <span className={condition === "above" ? "text-emerald-400" : "text-red-400"}>
                  {condition === "above" ? "above" : "below"}
                </span>{" "}
                {formatPrice(targetPrice)}
              </p>
              {currentPrice != null && pctDiff != null && (
                <p className="mt-1">
                  <span className="text-zinc-400">Currently {formatPrice(currentPrice)}</span>
                  <span className={pctDiff >= 0 ? " text-emerald-400" : " text-red-400"}>
                    {" "}
                    <span aria-hidden>{pctDiff >= 0 ? "↑" : "↓"}</span> {pctDiff >= 0 ? pctDiff.toFixed(1) : Math.abs(pctDiff).toFixed(1)}% {pctDiff >= 0 ? "below" : "above"} target
                  </span>
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            className="flex-1 rounded-full bg-[var(--accent-color)] py-2.5 text-sm font-semibold text-[#020308] hover:opacity-90"
          >
            {isEdit ? "Save Changes" : "Create Alert"}
          </button>
          <button type="button" onClick={onClose} className="rounded-full border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/5">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
