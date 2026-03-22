"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PALETTE = ["#3b82f6", "#22c55e", "#f59e0b", "#e879f9", "#f87171", "#34d399", "#60a5fa", "#fbbf24"];

type Timeframe = "1D" | "1W" | "1M" | "1Y";

type HistoryPayload = {
  dates: string[];
  series: Record<string, (number | null)[]>;
  error?: string;
};

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function pctColor(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "text-zinc-400";
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-zinc-400";
}

/** Stable identity for watchlist symbols so parent re-renders (new array refs) do not retrigger fetch. */
function tickersContentKey(symbols: string[]): string {
  return [...new Set(symbols.map((t) => t.trim().toUpperCase()).filter(Boolean))].sort().join("|");
}

export default function WatchlistChart({ tickers }: { tickers: string[] }) {
  const [timeframe, setTimeframe] = useState<Timeframe>("1M");
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<HistoryPayload | null>(null);

  const tickersKey = tickersContentKey(tickers);
  const symbols = useMemo(
    () => (tickersKey.length > 0 ? tickersKey.split("|") : []),
    [tickersKey],
  );

  useEffect(() => {
    const list = tickersKey.length > 0 ? tickersKey.split("|") : [];
    if (list.length === 0) {
      setPayload(null);
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    setLoading(true);

    const q = new URLSearchParams({
      tickers: list.join(","),
      timeframe,
    });

    void (async () => {
      try {
        const res = await fetch(`/api/watchlist-history?${q}`, {
          cache: "no-store",
          signal: ac.signal,
        });
        const json = (await res.json()) as HistoryPayload;
        if (ac.signal.aborted) return;
        if (!res.ok) {
          setPayload({ dates: [], series: {}, error: json.error ?? "Could not load history" });
        } else {
          setPayload(json);
        }
      } catch {
        if (ac.signal.aborted) return;
        setPayload({ dates: [], series: {}, error: "Failed to load" });
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [tickersKey, timeframe]);

  const chartData = useMemo(() => {
    const dates = payload?.dates ?? [];
    if (dates.length === 0) return [];
    return dates.map((date, i) => {
      const row: Record<string, string | number | null> = { date };
      for (const tk of symbols) {
        row[tk] = payload?.series?.[tk]?.[i] ?? null;
      }
      row.average = payload?.series?.average?.[i] ?? null;
      return row;
    });
  }, [payload, symbols]);

  const lastAverageReturn = useMemo(() => {
    const avg = payload?.series?.average;
    if (!avg?.length) return null;
    for (let i = avg.length - 1; i >= 0; i--) {
      const v = avg[i];
      if (v != null && Number.isFinite(v)) return v;
    }
    return null;
  }, [payload]);

  const tfButtons: Timeframe[] = ["1D", "1W", "1M", "1Y"];

  return (
    <div className="mt-8 rounded-xl border border-white/10 bg-[#050713] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">WATCHLIST PERFORMANCE</p>
        <span className={`text-2xl font-semibold tabular-nums ${pctColor(lastAverageReturn)}`}>
          {fmtPct(lastAverageReturn)}
        </span>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {tfButtons.map((tf) => (
          <button
            key={tf}
            type="button"
            onClick={() => setTimeframe(tf)}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              timeframe === tf ? "bg-white/15 text-zinc-100" : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-[280px] animate-pulse rounded-lg bg-white/5" aria-hidden />
      ) : payload?.error || chartData.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">
          {payload?.error ?? "No chart data for this watchlist."}
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              tickFormatter={(v) => `${Number(v).toFixed(1)}%`}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
            <Tooltip
              content={({ active, label, payload: rows }) => {
                if (!active || !rows?.length) return null;
                return (
                  <div className="rounded-lg border border-white/10 bg-[#0c1222] px-3 py-2 text-xs shadow-xl">
                    <p className="mb-1.5 font-medium text-zinc-300">{label}</p>
                    <ul className="space-y-0.5">
                      {rows
                        .filter((e) => e.dataKey !== "date" && e.value != null && Number.isFinite(Number(e.value)))
                        .map((e) => {
                          const v = Number(e.value);
                          const name = String(e.dataKey) === "average" ? "Watchlist Avg" : String(e.dataKey);
                          return (
                            <li key={String(e.dataKey)} className={`flex justify-between gap-4 ${pctColor(v)}`}>
                              <span className="text-zinc-500">{name}</span>
                              <span className="font-mono tabular-nums">{fmtPct(v)}</span>
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                );
              }}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value) => (value === "average" ? "Watchlist Avg" : value)}
            />
            {symbols.map((tk, i) => (
              <Line
                key={tk}
                type="monotone"
                dataKey={tk}
                name={tk}
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={1.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
            <Line
              type="monotone"
              dataKey="average"
              name="Watchlist Avg"
              stroke="var(--accent-color)"
              strokeWidth={2.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
