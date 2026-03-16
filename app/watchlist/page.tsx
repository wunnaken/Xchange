"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  fetchWatchlist,
  removeFromWatchlistApi,
  type WatchlistItem,
} from "../../lib/watchlist-api";

const HEADER_TICKERS_KEY = "xchange-header-tickers";
const MAX_HEADER_TICKERS = 8;

function getHeaderTickerSymbols(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HEADER_TICKERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string").slice(0, MAX_HEADER_TICKERS) : [];
  } catch {
    return [];
  }
}

function setHeaderTickerSymbols(symbols: string[]) {
  const list = symbols.slice(0, MAX_HEADER_TICKERS);
  localStorage.setItem(HEADER_TICKERS_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("xchange-header-tickers-changed"));
}

type Quote = { price: number; changePercent: number };

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [headerSymbols, setHeaderSymbols] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    try {
      const list = await fetchWatchlist();
      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    setHeaderSymbols(getHeaderTickerSymbols());
  }, []);

  const tickerList = items.map((i) => i.ticker).sort().join(",");
  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    const next: Record<string, Quote> = {};
    Promise.all(
      items.map((item) =>
        fetch(`/api/ticker-quote?ticker=${encodeURIComponent(item.ticker)}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((d) => {
            if (!cancelled && d?.price != null) next[item.ticker] = { price: d.price, changePercent: d.changePercent ?? 0 };
          })
          .catch(() => {})
      )
    ).then(() => {
      if (!cancelled) setQuotes((prev) => ({ ...prev, ...next }));
    });
    return () => { cancelled = true; };
  }, [tickerList, items.length]);

  const toggleHeaderTicker = (ticker: string) => {
    const sym = ticker.toUpperCase();
    setHeaderSymbols((prev) => {
      const next = prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym].slice(0, MAX_HEADER_TICKERS);
      setHeaderTickerSymbols(next);
      return next;
    });
  };

  const handleRemove = async (ticker: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await removeFromWatchlistApi(ticker);
      setItems((prev) => prev.filter((i) => i.ticker.toUpperCase() !== ticker.toUpperCase()));
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-zinc-100">My Watchlist</h1>
        <p className="mt-4 text-zinc-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-zinc-100">My Watchlist</h1>
      {items.length === 0 ? (
        <p className="mt-4 text-zinc-400">
          No assets added yet. Search for a stock or crypto to add to your watchlist.
        </p>
      ) : (
        <>
        <p className="mt-2 text-sm text-zinc-500">
          Choose which tickers appear in the header bar (max {MAX_HEADER_TICKERS}). Toggle &quot;In header&quot; below.
        </p>
        <ul className="mt-4 space-y-2">
          {items.map((item) => {
            const q = quotes[item.ticker];
            const priceStr = q?.price != null ? (q.price >= 1 ? `$${q.price.toFixed(2)}` : `$${q.price.toFixed(4)}`) : null;
            const ch = q?.changePercent;
            return (
              <li key={item.ticker}>
                <div className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-4 py-3 transition-colors hover:bg-white/10">
                  <Link
                    href={`/search/${encodeURIComponent(item.ticker)}`}
                    className="min-w-0 flex-1 flex items-center justify-between gap-3"
                  >
                    <span className="font-medium text-zinc-200">{item.ticker}</span>
                    <div className="flex shrink-0 items-center gap-4 text-sm">
                      {priceStr && <span className="text-zinc-400">{priceStr}</span>}
                      {ch != null && (
                        <span className={ch >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {ch >= 0 ? "+" : ""}{ch.toFixed(2)}%
                        </span>
                      )}
                      {!priceStr && ch == null && <span className="text-zinc-500">—</span>}
                    </div>
                  </Link>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleHeaderTicker(item.ticker)}
                      className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        headerSymbols.includes(item.ticker.toUpperCase())
                          ? "bg-[var(--accent-color)]/20 text-[var(--accent-color)]"
                          : "text-zinc-400 hover:bg-white/5 hover:text-zinc-300"
                      }`}
                      title={headerSymbols.includes(item.ticker.toUpperCase()) ? "Shown in header bar" : "Show in header bar"}
                    >
                      In header
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleRemove(item.ticker, e)}
                      className="rounded px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
                      aria-label={`Remove ${item.ticker} from watchlist`}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        </>
      )}
    </div>
  );
}
