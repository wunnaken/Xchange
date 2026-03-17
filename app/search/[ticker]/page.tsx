"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalyzeTickerResponse } from "../../api/analyze-ticker/route";
import {
  addToWatchlistApi,
  fetchWatchlist,
  isTickerInWatchlist,
  removeFromWatchlistApi,
} from "../../../lib/watchlist-api";
import { getAlertForTicker } from "../../../lib/price-alerts";
import { PriceAlertModal } from "../../../components/PriceAlertModal";
import { useToast } from "../../../components/ToastContext";
import { useLivePrice } from "../../../lib/hooks/useLivePrice";
import { usePriceContext } from "../../../lib/price-context";
import { PriceDisplay } from "../../../components/PriceDisplay";
import { CandlestickChart } from "../../../components/CandlestickChart";

const CARD_BG = "#0F1520";

type ChartPoint = {
  time: number;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const CHART_RANGES = ["10m", "1H", "1D", "1W", "1M", "3M", "6M", "1Y", "5Y"] as const;
type ChartRangeKey = "10m" | "1h" | "1d" | "1w" | "1m" | "3m" | "6m" | "1y" | "5y";

function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i);
  return Math.abs((h >>> 0) % 1000) / 1000;
}

function useWatchingCount(ticker: string) {
  const [count, setCount] = useState(() => {
    const r = seededRandom(ticker || "X");
    return Math.floor(80 + r * 320);
  });
  useEffect(() => {
    const t = setInterval(() => {
      setCount((c) => Math.max(50, Math.min(500, c + Math.floor((seededRandom(ticker + Date.now()) - 0.5) * 20))));
    }, 60000);
    return () => clearInterval(t);
  }, [ticker]);
  return count;
}

type QuoteData = {
  price: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  high: number | null;
  low: number | null;
};

function TickerDataPanel({
  ticker,
  inWatchlist,
  onWatchlistChange,
  alertForTicker,
  onSetAlertClick,
  watchingCount,
  quote,
  quoteLoading,
  chartData,
  chartLoading,
  chartRange,
  onChartRangeChange,
  isLive,
}: {
  ticker: string;
  inWatchlist: boolean;
  onWatchlistChange: () => void;
  alertForTicker: { condition: string; targetPrice: number } | null;
  onSetAlertClick: () => void;
  watchingCount: number;
  quote: QuoteData | null;
  quoteLoading: boolean;
  chartData: ChartPoint[];
  chartLoading: boolean;
  chartRange: ChartRangeKey;
  onChartRangeChange: (r: ChartRangeKey) => void;
  isLive?: boolean;
}) {
  const name = ticker.length <= 4 ? `${ticker}` : ticker;
  const price = quote?.price ?? null;
  const change = quote?.change ?? null;
  const changePercent = quote?.changePercent ?? null;
  const volumeFromQuote = quote?.volume;
  const volumeFromChart = chartData.length > 0
    ? chartData[chartData.length - 1]?.volume ?? chartData.reduce((s, d) => s + d.volume, 0)
    : null;
  const volume = volumeFromQuote ?? (volumeFromChart != null && volumeFromChart > 0 ? volumeFromChart : null);
  const high = quote?.high;
  const low = quote?.low;
  const hasPrice = price != null && !Number.isNaN(price);
  const hasChange = changePercent != null && !Number.isNaN(changePercent);
  const hasVolume = chartData.length > 0 && chartData.some((d) => d.volume > 0);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">{ticker}</h1>
        <p className="mt-1 text-sm text-zinc-400">{name}</p>
        <p className="mt-1 text-xs text-zinc-500">👁 {watchingCount} Xchange members watching {ticker} today</p>
      </div>
      {quoteLoading ? (
        <div className="flex items-baseline gap-2">
          <div className="h-8 w-24 animate-pulse rounded bg-white/10" />
          <div className="h-5 w-12 animate-pulse rounded bg-white/10" />
        </div>
      ) : (
        <div className="flex items-baseline gap-2">
          <PriceDisplay
            price={price}
            change={change}
            changePercent={changePercent}
            symbol={ticker}
            showChange={true}
            className="text-2xl font-semibold text-zinc-100"
            priceClassName="text-2xl font-semibold text-zinc-100"
            changeClassName={changePercent != null && changePercent >= 0 ? "text-emerald-400" : "text-red-400"}
          />
          {isLive && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live
            </span>
          )}
        </div>
      )}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {CHART_RANGES.map((label) => {
            const value = (
              label === "1H" ? "1h" : label === "1D" ? "1d" : label === "1W" ? "1w" : label === "1M" ? "1m" :
              label === "3M" ? "3m" : label === "6M" ? "6m" : label === "1Y" ? "1y" : label === "5Y" ? "5y" : "10m"
            ) as ChartRangeKey;
            const active = chartRange === value;
            return (
              <button
                key={label}
                type="button"
                onClick={() => onChartRangeChange(value)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  active ? "bg-white/15 text-zinc-100" : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div
          className="flex w-full items-center justify-center overflow-hidden rounded-xl border border-white/10"
          style={{ backgroundColor: CARD_BG }}
        >
          {chartLoading ? (
            <div className="flex h-56 w-full items-center justify-center">
              <p className="text-sm text-zinc-500">Loading chart…</p>
            </div>
          ) : chartData.length > 0 ? (
            <CandlestickChart
              data={chartData}
              showVolume={hasVolume}
              height={280}
              className="w-full rounded-xl"
            />
          ) : (
            <div className="flex h-56 w-full items-center justify-center">
              <p className="text-sm text-zinc-500">Chart data unavailable</p>
            </div>
          )}
        </div>
        {chartData.length > 0 && !hasVolume && (
          <p className="text-[10px] text-zinc-500">Volume not available for this range</p>
        )}
        {chartData.length > 0 && chartData.length <= 2 && (
          <p className="text-[10px] text-zinc-500">Limited history for this symbol/range</p>
        )}
      </div>
      {(() => {
        const rows = [
          { label: "Volume", value: volume != null ? (volume >= 1e6 ? `${(volume / 1e6).toFixed(1)}M` : volume >= 1e3 ? `${(volume / 1e3).toFixed(1)}K` : String(volume)) : "—" },
          { label: "High", value: high != null ? `$${high.toFixed(2)}` : "—" },
          { label: "Low", value: low != null ? `$${low.toFixed(2)}` : "—" },
        ].filter((r) => r.value !== "—");
        if (rows.length === 0) return null;
        return (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-1">
            {rows.map(({ label, value }) => (
              <div key={label} className="flex justify-between rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                <dt className="text-xs text-zinc-500">{label}</dt>
                <dd className="text-sm font-medium text-zinc-200">{value}</dd>
              </div>
            ))}
          </dl>
        );
      })()}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onWatchlistChange}
          className={`flex-1 rounded-full py-2.5 text-sm font-semibold transition-colors ${
            inWatchlist
              ? "border border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20"
              : "bg-[var(--accent-color)] text-[#020308] hover:opacity-90"
          }`}
        >
          {inWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
        </button>
        <button
          type="button"
          onClick={onSetAlertClick}
          className={`flex items-center gap-2 rounded-full border py-2.5 px-4 text-sm font-medium transition-colors ${
            alertForTicker
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
          }`}
        >
          <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {alertForTicker
            ? `Alert: ${alertForTicker.condition === "above" ? "above" : "below"} $${alertForTicker.targetPrice >= 1 ? alertForTicker.targetPrice.toFixed(2) : alertForTicker.targetPrice.toFixed(4)}`
            : "Set Alert"}
        </button>
      </div>
    </div>
  );
}

function AIAnalysisSkeleton() {
  return (
    <div className="space-y-4 rounded-2xl border border-[var(--accent-color)]/30 bg-[#0F1520]/80 p-6">
      <div className="search-skeleton h-8 w-32 rounded" />
      <div className="search-skeleton h-4 w-full rounded" />
      <div className="search-skeleton h-4 w-4/5 rounded" />
      <div className="search-skeleton h-20 w-full rounded-xl" />
      <div className="search-skeleton h-20 w-full rounded-xl" />
      <div className="search-skeleton h-6 w-24 rounded" />
    </div>
  );
}

function AIAnalysisCard({ data }: { data: AnalyzeTickerResponse }) {
  const riskBarColor =
    data.riskRating <= 3 ? "var(--accent-color)" : data.riskRating <= 6 ? "#eab308" : "#ef4444";
  const riskBarWidth = Math.min(100, (data.riskRating / 10) * 100);

  return (
    <div
      className="rounded-2xl border-2 p-6"
      style={{
        animation: "fadeIn 0.4s ease-out forwards",
        borderImage: "linear-gradient(135deg, var(--accent-color-40), var(--accent-color-10)) 1",
        backgroundColor: "rgba(15, 21, 32, 0.9)",
      }}
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="text-lg">✨</span>
        <h2 className="text-lg font-semibold text-zinc-100">AI Analysis</h2>
      </div>

      <section className="mb-6">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold text-zinc-100">{data.riskRating}/10</span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              data.riskColor === "green"
                ? "bg-[var(--accent-color)]/20 text-[var(--accent-color)]"
                : data.riskColor === "yellow"
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-red-500/20 text-red-400"
            }`}
          >
            {data.riskLabel}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${riskBarWidth}%`, backgroundColor: riskBarColor }}
          />
        </div>
      </section>

      <section className="mb-6">
        <h3 className="mb-2 text-sm font-semibold text-zinc-300">Summary</h3>
        <p className="text-sm leading-relaxed text-zinc-400">{data.summary}</p>
      </section>

      <section className="mb-6">
        <h3 className="mb-2 text-sm font-semibold text-zinc-300">Bull case 📈</h3>
        <div className="border-l-4 border-[var(--accent-color)] bg-[var(--accent-color)]/5 px-4 py-3 rounded-r-lg">
          <p className="text-sm text-zinc-300">{data.bullCase}</p>
        </div>
      </section>

      <section className="mb-6">
        <h3 className="mb-2 text-sm font-semibold text-zinc-300">Bear case 📉</h3>
        <div className="border-l-4 border-red-500 bg-red-500/5 px-4 py-3 rounded-r-lg">
          <p className="text-sm text-zinc-300">{data.bearCase}</p>
        </div>
      </section>

      <section className="mb-6">
        <h3 className="mb-2 text-sm font-semibold text-zinc-300">Suitable for</h3>
        <Link
          href="/growth#choose-profile"
          className="inline-flex items-center gap-1 rounded-full border border-[var(--accent-color)]/40 bg-[var(--accent-color)]/10 px-3 py-1.5 text-sm font-medium text-[var(--accent-color)] hover:bg-[var(--accent-color)]/20"
        >
          {data.suitableFor}
        </Link>
      </section>

      <section className="mb-6">
        <h3 className="mb-2 text-sm font-semibold text-zinc-300">Key factors</h3>
        <ul className="list-inside list-disc space-y-1 text-sm text-zinc-400">
          {data.keyFactors.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      </section>

      <p className="text-xs italic text-zinc-500">{data.disclaimer}</p>
    </div>
  );
}

const AI_CACHE_PREFIX = "ai-analysis-";
const AI_CACHE_HOURS = 6;

function getCachedAnalysis(ticker: string): AnalyzeTickerResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const hour = Math.floor(now.getHours() / AI_CACHE_HOURS) * AI_CACHE_HOURS;
    const key = `${AI_CACHE_PREFIX}${ticker}-${date}-${hour}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as AnalyzeTickerResponse;
  } catch {
    return null;
  }
}

function setCachedAnalysis(ticker: string, data: AnalyzeTickerResponse) {
  if (typeof window === "undefined") return;
  try {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const hour = Math.floor(now.getHours() / AI_CACHE_HOURS) * AI_CACHE_HOURS;
    const key = `${AI_CACHE_PREFIX}${ticker}-${date}-${hour}`;
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export default function TickerPage() {
  const params = useParams();
  const ticker = typeof params.ticker === "string" ? params.ticker.toUpperCase() : "";
  const [inWatchlist, setInWatchlist] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzeTickerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quoteMeta, setQuoteMeta] = useState<QuoteData | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartRange, setChartRange] = useState<ChartRangeKey>("1d");
  const chartRangeRef = useRef<ChartRangeKey>("1d");
  const watchingCount = useWatchingCount(ticker || "");
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [alertRefresh, setAlertRefresh] = useState(0);
  const alertForTicker = getAlertForTicker(ticker);
  const live = useLivePrice(ticker);
  const { isConnected } = usePriceContext();
  const quote: QuoteData | null = live.price != null
    ? {
        price: live.price,
        change: live.change,
        changePercent: live.changePercent,
        volume: quoteMeta?.volume ?? null,
        high: quoteMeta?.high ?? null,
        low: quoteMeta?.low ?? null,
      }
    : quoteMeta;
  const quoteLoading = live.isLoading && live.price == null;

  const refreshWatchlist = useCallback(async () => {
    try {
      const items = await fetchWatchlist();
      setInWatchlist(isTickerInWatchlist(items, ticker));
    } catch {
      setInWatchlist(false);
    }
  }, [ticker]);

  useEffect(() => {
    queueMicrotask(() => refreshWatchlist());
  }, [refreshWatchlist]);

  useEffect(() => {
    if (!ticker) return;
    fetch(`/api/ticker-quote?ticker=${encodeURIComponent(ticker)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setQuoteMeta({
          price: data.price ?? null,
          change: data.change ?? null,
          changePercent: data.changePercent ?? null,
          volume: data.volume ?? null,
          high: data.high ?? null,
          low: data.low ?? null,
        });
      })
      .catch(() => setQuoteMeta(null));
  }, [ticker]);

  useEffect(() => {
    if (!ticker) return;
    chartRangeRef.current = chartRange;
    setChartLoading(true);
    const controller = new AbortController();
    fetch(`/api/ticker-chart?ticker=${encodeURIComponent(ticker)}&range=${chartRange}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        const next = Array.isArray(data?.data) ? data.data : [];
        const responseRange = (data?.range ?? "").toLowerCase() as ChartRangeKey;
        if (responseRange && responseRange !== chartRangeRef.current) return;
        setChartData((prev) => (next.length > 0 ? next : prev));
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setChartData((prev) => prev);
      })
      .finally(() => {
        if (chartRangeRef.current === chartRange) setChartLoading(false);
      });
    return () => controller.abort();
  }, [ticker, chartRange]);

  useEffect(() => {
    if (!ticker) return;
    const cached = getCachedAnalysis(ticker);
    if (cached) {
      setAnalysis(cached);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/analyze-ticker?ticker=${encodeURIComponent(ticker)}`)
      .then((res) => {
        if (!res.ok) return res.json().then((b) => Promise.reject(new Error((b as { error?: string }).error || res.statusText)));
        return res.json() as Promise<AnalyzeTickerResponse>;
      })
      .then((data) => {
        setAnalysis(data);
        setCachedAnalysis(ticker, data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load analysis"))
      .finally(() => setLoading(false));
  }, [ticker]);

  const toast = useToast();
  const handleWatchlistToggle = async () => {
    try {
      if (inWatchlist) {
        await removeFromWatchlistApi(ticker);
        toast.showToast("Removed from watchlist", "success");
      } else {
        await addToWatchlistApi({ ticker, name: ticker });
        toast.showToast("Added to watchlist", "success");
      }
      await refreshWatchlist();
    } catch {
      toast.showToast("Could not update watchlist", "warning");
    }
  };

  if (!ticker) {
    return (
      <div className="min-h-screen app-page flex items-center justify-center px-4">
        <p className="text-zinc-400">Invalid ticker.</p>
        <Link href="/search" className="ml-2 text-[var(--accent-color)] hover:underline">
          Search
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen app-page font-[&quot;Times_New_Roman&quot;,serif]">
      <div className="border-b border-white/5 px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/search" className="text-sm text-zinc-400 hover:text-[var(--accent-color)]">
            ← Search
          </Link>
          <Link href="/feed" className="text-sm text-zinc-400 hover:text-[var(--accent-color)]">
            Feed
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-[1fr,1.1fr]">
          <div
            className="rounded-2xl border border-white/10 p-6 transition-colors"
            style={{ backgroundColor: CARD_BG }}
          >
            <TickerDataPanel
              ticker={ticker}
              inWatchlist={inWatchlist}
              onWatchlistChange={handleWatchlistToggle}
              alertForTicker={alertForTicker ? { condition: alertForTicker.condition, targetPrice: alertForTicker.targetPrice } : null}
              onSetAlertClick={() => setAlertModalOpen(true)}
              watchingCount={watchingCount}
              quote={quote}
              quoteLoading={quoteLoading}
              chartData={chartData}
              chartLoading={chartLoading}
              chartRange={chartRange}
              onChartRangeChange={setChartRange}
              isLive={isConnected}
            />
          </div>

          <div>
            {loading && <AIAnalysisSkeleton />}
            {error && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-300">
                {error}. Add <code className="rounded bg-black/20 px-1">ANTHROPIC_API_KEY</code> to .env.local to enable AI analysis.
              </div>
            )}
            {!loading && !error && analysis && <AIAnalysisCard data={analysis} />}
          </div>
        </div>
      </div>
      <PriceAlertModal
        open={alertModalOpen}
        onClose={() => setAlertModalOpen(false)}
        prefilledTicker={ticker}
        editingAlert={alertForTicker ?? undefined}
        onSaved={() => setAlertRefresh((r) => r + 1)}
      />
    </div>
  );
}
