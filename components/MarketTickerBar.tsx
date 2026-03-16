"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const TICKER_CACHE_KEY = "xchange-ticker-cache";
const HEADER_TICKERS_KEY = "xchange-header-tickers";

function getHeaderTickerSymbols(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HEADER_TICKERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

type Ticker = {
  id: string;
  name: string;
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  source: "live" | "mock";
};

const FALLBACK_TICKERS: Ticker[] = [
  { id: "spy", name: "S&P 500", symbol: "SPY", price: 5850, change: 42.5, changePercent: 0.73, source: "mock" },
  { id: "qqq", name: "Nasdaq", symbol: "QQQ", price: 5250, change: -18.2, changePercent: -0.35, source: "mock" },
  { id: "btc", name: "Bitcoin", symbol: "BTC", price: 97200, change: 1200, changePercent: 1.25, source: "mock" },
  { id: "eth", name: "Ethereum", symbol: "ETH", price: 3450, change: -22, changePercent: -0.63, source: "mock" },
  { id: "gld", name: "Gold", symbol: "GLD", price: 265, change: 1.2, changePercent: 0.47, source: "mock" },
  { id: "oil", name: "Oil", symbol: "OIL", price: 78.2, change: -1.1, changePercent: -1.39, source: "mock" },
  { id: "dxy", name: "Dollar Index", symbol: "DXY", price: 104.2, change: 0.15, changePercent: 0.14, source: "mock" },
  { id: "eurusd", name: "EUR/USD", symbol: "EURUSD", price: 1.085, change: -0.002, changePercent: -0.18, source: "mock" },
];

function getCachedTickers(): Ticker[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(TICKER_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setCachedTickers(tickers: Ticker[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(TICKER_CACHE_KEY, JSON.stringify(tickers));
  } catch {
    // ignore
  }
}

function formatPrice(price: number, symbol: string): string {
  if (symbol === "BTC" || symbol === "ETH") return price >= 1000 ? `${(price / 1000).toFixed(1)}k` : price.toFixed(0);
  if (symbol === "EURUSD") return price.toFixed(4);
  return price >= 1 ? price.toFixed(2) : price.toFixed(4);
}

function TickerItem({ t }: { t: Ticker }) {
  const isPositive = t.changePercent >= 0;
  const isZero = t.changePercent === 0;
  const dotColor = isZero ? "bg-zinc-500" : isPositive ? "bg-emerald-400" : "bg-red-400";
  return (
    <Link
      href="/news"
      className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded px-3 py-1 text-xs transition hover:bg-white/5"
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} aria-hidden />
      <span className="font-medium text-zinc-200">{t.name}</span>
      <span className="text-zinc-500">{formatPrice(t.price, t.symbol)}</span>
      <span
        className={
          isZero ? "text-zinc-500" : isPositive ? "font-medium text-emerald-400" : "font-medium text-red-400"
        }
      >
        {isPositive ? "+" : ""}
        {t.changePercent.toFixed(2)}%
      </span>
    </Link>
  );
}

function TickerSkeleton() {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden px-4" aria-label="Market tickers loading">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div key={i} className="flex shrink-0 items-center gap-2 rounded px-3 py-1">
          <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/20 animate-pulse" />
          <div className="h-3 w-16 rounded bg-white/10 animate-pulse" />
          <div className="h-3 w-10 rounded bg-white/10 animate-pulse" />
          <div className="h-3 w-8 rounded bg-white/10 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function MarketTickerBar() {
  const [tickers, setTickers] = useState<Ticker[]>(FALLBACK_TICKERS);
  const [loading, setLoading] = useState(false);

  const fetchTickers = useCallback(async () => {
    const symbols = getHeaderTickerSymbols();
    const url = symbols.length > 0 ? `/api/market-tickers?symbols=${encodeURIComponent(symbols.join(","))}` : "/api/market-tickers";
    try {
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      if (list.length > 0) {
        setTickers(list);
        setCachedTickers(list);
      } else {
        const cached = getCachedTickers();
        setTickers(cached.length > 0 ? cached : FALLBACK_TICKERS);
      }
    } catch {
      const cached = getCachedTickers();
      setTickers(cached.length > 0 ? cached : FALLBACK_TICKERS);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await fetchTickers();
      if (!cancelled) setLoading(false);
    })();
    const interval = setInterval(fetchTickers, 60 * 1000);
    const onCustomChange = () => fetchTickers();
    window.addEventListener("xchange-header-tickers-changed" as any, onCustomChange);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("xchange-header-tickers-changed" as any, onCustomChange);
    };
  }, [fetchTickers]);

  if (loading && tickers.length === 0) {
    return <TickerSkeleton />;
  }

  if (tickers.length === 0) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center overflow-hidden rounded border border-white/10 bg-white/5 px-4 py-2 text-xs text-zinc-500">
        Data temporarily unavailable — refresh to try again
      </div>
    );
  }

  const list = tickers.slice(0, 8);

  return (
    <div
      className="relative min-w-0 flex-1 overflow-hidden px-4"
      aria-label="Market tickers"
      aria-live="polite"
      role="region"
    >
      <div className="ticker-marquee-track flex gap-8" style={{ width: "max-content" }}>
        {[...list, ...list].map((t, i) => (
          <TickerItem key={`${t.id}-${i}`} t={t} />
        ))}
      </div>
    </div>
  );
}
