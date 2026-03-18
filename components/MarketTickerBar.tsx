"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLivePrices } from "../lib/hooks/useLivePrice";
import { PriceDisplay } from "./PriceDisplay";

const HEADER_TICKERS_KEY = "xchange-header-tickers";
const DEFAULT_SYMBOLS = ["SPY", "QQQ", "AAPL", "BTC", "ETH", "GLD", "EURUSD", "DXY"];

const SYMBOL_NAMES: Record<string, string> = {
  SPY: "S&P 500",
  QQQ: "Nasdaq",
  AAPL: "Apple",
  BTC: "Bitcoin",
  ETH: "Ethereum",
  GLD: "Gold",
  OIL: "Oil",
  USO: "Oil",
  DXY: "Dollar Index",
  EURUSD: "EUR/USD",
};

function getHeaderTickerSymbols(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HEADER_TICKERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string").slice(0, 12) : [];
    return [...new Set(list)];
  } catch {
    return [];
  }
}

const CRYPTO_SYMBOLS = new Set(["BTC", "ETH"]);

function TickerItem({
  symbol,
  name,
  data,
}: {
  symbol: string;
  name: string;
  data: { price: number | null; change: number | null; changePercent: number | null; isLoading: boolean };
}) {
  const isPositive = data.changePercent != null && data.changePercent >= 0;
  const isZero = data.changePercent != null && data.changePercent === 0;
  const dotColor = data.isLoading ? "bg-white/20" : isZero ? "bg-zinc-500" : isPositive ? "bg-emerald-400" : "bg-red-400";
  const isCrypto = CRYPTO_SYMBOLS.has(symbol);
  const changeLabel = isCrypto ? "24h change (CoinGecko); may differ from TradingView day change" : undefined;
  return (
    <Link
      href="/news"
      className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded px-3 py-1 text-xs transition hover:bg-white/5"
      title={changeLabel}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor} ${data.isLoading ? "animate-pulse" : ""}`} aria-hidden />
      <span className="font-medium text-zinc-200">{name}</span>
      {data.price != null ? (
        <>
          <PriceDisplay
            price={data.price}
            change={data.change}
            changePercent={data.changePercent}
            symbol={symbol}
            format="compact"
            showChange={true}
          />
        </>
      ) : (
        <span className="text-zinc-500">—</span>
      )}
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
  const [symbols, setSymbols] = useState<string[]>([]);

  useEffect(() => {
    const load = () => {
      const list = getHeaderTickerSymbols();
      setSymbols(list.length > 0 ? list : DEFAULT_SYMBOLS);
    };
    load();
    window.addEventListener("xchange-header-tickers-changed", load);
    return () => window.removeEventListener("xchange-header-tickers-changed", load);
  }, []);

  const list = (symbols.length > 0 ? symbols : DEFAULT_SYMBOLS).map((s) => (typeof s === "string" ? s.toUpperCase() : s)).slice(0, 12);
  const prices = useLivePrices(list.length > 0 ? list : DEFAULT_SYMBOLS);

  if (list.length === 0) {
    return <TickerSkeleton />;
  }

  const allLoading = list.every((s) => prices[s]?.isLoading);
  if (allLoading && list.length > 0 && !list.some((s) => prices[s]?.price != null)) {
    return <TickerSkeleton />;
  }

  return (
    <div
      className="relative min-w-0 flex-1 overflow-hidden px-4"
      aria-label="Market tickers"
      aria-live="polite"
      role="region"
    >
      <div className="ticker-marquee-track flex gap-8" style={{ width: "max-content" }} key="ticker-track">
        {[...list, ...list].map((symbol, i) => (
          <TickerItem
            key={`${symbol}-${i}`}
            symbol={symbol}
            name={SYMBOL_NAMES[symbol] ?? symbol}
            data={prices[symbol] ?? { price: null, change: null, changePercent: null, isLoading: true }}
          />
        ))}
      </div>
    </div>
  );
}
