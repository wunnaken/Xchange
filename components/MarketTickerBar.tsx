"use client";

import { memo, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLivePrices } from "../lib/hooks/useLivePrice";
import { PriceDisplay } from "./PriceDisplay";
import {
  DEFAULT_TICKERS,
  clearLegacyHeaderTickers,
  fetchTickerBarConfig,
  getLocalTickerConfig,
  saveTickerBarConfig,
  type TickerBarConfig,
} from "../lib/ticker-bar-api";
import { fetchWatchlistWithStatus } from "../lib/watchlist-api";

const MAX_TICKERS = 15;

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

const CRYPTO_SYMBOLS = new Set(["BTC", "ETH"]);

const LOADING_DATA = { price: null, change: null, changePercent: null, isLoading: true } as const;

const TickerItem = memo(function TickerItem({
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
});

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
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_TICKERS);
  const [config, setConfig] = useState<TickerBarConfig>({
    tickers: DEFAULT_TICKERS,
    useWatchlist: false,
  });

  useEffect(() => {
    const load = async () => {
      const local = getLocalTickerConfig();
      if (local) setConfig(local);

      const migrationSource = local?.tickers?.length ? local : null;
      const result = await fetchTickerBarConfig();
      setConfig(result.config);
      if (migrationSource && migrationSource.tickers.length > 0) {
        await saveTickerBarConfig(migrationSource);
        clearLegacyHeaderTickers();
      }
    };
    void load();
  }, []);

  useEffect(() => {
    const onHeaderChanged = () => {
      const local = getLocalTickerConfig();
      if (!local) return;
      setConfig((prev) => {
        const prevKey = `${prev.useWatchlist}:${prev.tickers.join(",")}`;
        const nextKey = `${local.useWatchlist}:${local.tickers.join(",")}`;
        return prevKey === nextKey ? prev : local;
      });
    };
    window.addEventListener("xchange-header-tickers-changed", onHeaderChanged);
    return () => window.removeEventListener("xchange-header-tickers-changed", onHeaderChanged);
  }, []);

  useEffect(() => {
    if (!config.useWatchlist) {
      setSymbols(config.tickers.length ? config.tickers : DEFAULT_TICKERS);
      return;
    }
    const loadWatchlist = async () => {
      const result = await fetchWatchlistWithStatus();
      const next = [...new Set(result.items.map((x) => x.ticker.trim().toUpperCase()).filter(Boolean))].slice(0, MAX_TICKERS);
      setSymbols(next.length > 0 ? next : DEFAULT_TICKERS);
    };
    void loadWatchlist();
    const onChanged = () => void loadWatchlist();
    window.addEventListener("xchange-watchlist-changed", onChanged);
    return () => window.removeEventListener("xchange-watchlist-changed", onChanged);
  }, [config.useWatchlist, config.tickers]);

  const list = useMemo(
    () =>
      (symbols.length > 0 ? symbols : DEFAULT_TICKERS)
        .map((s) => (typeof s === "string" ? s.toUpperCase() : s))
        .slice(0, MAX_TICKERS),
    [symbols]
  );
  const prices = useLivePrices(list.length > 0 ? list : DEFAULT_TICKERS);

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
            data={prices[symbol] ?? LOADING_DATA}
          />
        ))}
      </div>
    </div>
  );
}
