"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type CurvePoint = { maturity: string; value: number | null };
type SparkPoint = { date: string; value: number };
type MaturityCard = {
  label: string;
  seriesId: string;
  current: number | null;
  dailyChangeBps: number | null;
  weeklyChangeBps: number | null;
  sparkline: SparkPoint[];
};
type CountryBucket = {
  id: string;
  label: string;
  tvSymbol: string;
  maturities: MaturityCard[];
};
type SpreadItem = {
  value: number | null;
  change: number | null;
  interpretation: string;
  inversionDays?: number;
  note?: string;
  /** Last-known / static spread (not live) — show neutral styling in UI. */
  estimated?: boolean;
};
type BondNews = { title: string; source: string; url: string; publishedAt: string };
type BondsApiResponse = {
  yieldCurve: {
    current: CurvePoint[];
    monthAgo: CurvePoint[];
    yearAgo: CurvePoint[];
    shape: "Normal" | "Inverted";
    twoTenSpread: number | null;
  };
  bondsByCountry: Record<string, CountryBucket>;
  spreads: {
    yieldCurve: SpreadItem;
    vix: SpreadItem;
    tenTwoSpread: SpreadItem;
  };
  sentiment: { score: number; label: string };
  centralBankRates: Record<string, { label: string; value: number | null; source: string; lastUpdated: string | null; note?: string }>;
  historicalYields: Record<string, Array<{ date: string; value: number }>>;
  news: BondNews[];
  lastUpdated: string;
};

const TAB_ORDER = ["us", "uk", "de", "jp", "cn", "em"] as const;
const US_TREASURY_SERIES = [
  { label: "2Y", seriesId: "DGS2", color: "#3b82f6" },
  { label: "5Y", seriesId: "DGS5", color: "#22c55e" },
  { label: "10Y", seriesId: "DGS10", color: "var(--accent-color)" },
  { label: "30Y", seriesId: "DGS30", color: "#f59e0b" },
] as const;
/** Recharts 3: single stroke so horizontal/vertical grid match (avoid default #ccc vs custom mix). */
const CHART_GRID = { stroke: "#64748b", strokeOpacity: 0.3 };

/**
 * Recharts 3 ResponsiveContainer returns null when flex/grid gives width 0 — charts stay blank.
 * Measure the box and pass numeric width/height to LineChart instead.
 */
function BondChartBox({
  className,
  style,
  minWidth = 200,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  minWidth?: number;
  children: (width: number, height: number) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const r = el.getBoundingClientRect();
      const width = Math.max(minWidth, Math.floor(r.width));
      const height = Math.max(64, Math.floor(r.height));
      setDims((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [minWidth]);

  return (
    <div ref={ref} className={className} style={style}>
      {dims ? children(dims.width, dims.height) : null}
    </div>
  );
}

const NON_US_SERIES: Record<string, Array<{ label: string; seriesId: string; color: string }>> = {
  uk: [{ label: "UK 10Y", seriesId: "GBAM10Y", color: "var(--accent-color)" }],
  de: [{ label: "Germany 10Y", seriesId: "DEAM10Y", color: "var(--accent-color)" }],
  jp: [{ label: "Japan 10Y", seriesId: "INTGSBEJPM193N", color: "var(--accent-color)" }],
  cn: [{ label: "China 10Y", seriesId: "INTDSRCNM193N", color: "var(--accent-color)" }],
  em: [
    { label: "Brazil 10Y", seriesId: "INTDSRBRM193N", color: "#3b82f6" },
    { label: "India 10Y", seriesId: "INTDSRINM193N", color: "#22c55e" },
    { label: "Mexico 10Y", seriesId: "INTDSRMXM193N", color: "var(--accent-color)" },
    { label: "South Africa 10Y", seriesId: "INTDSRZAM193N", color: "#f59e0b" },
  ],
};

function fmtYield(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(2)}%`;
}

function fmtBps(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)} bps`;
}

function directionClass(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "text-zinc-400";
  if (v > 0) return "text-red-400";
  if (v < 0) return "text-emerald-400";
  return "text-zinc-400";
}

function fmtVix(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

function fmtVixPtsDelta(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)} pts`;
}

/** VIX level coloring: green &lt;20, amber 20–30, red &gt;30 */
function vixLevelClass(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "text-zinc-400";
  if (v < 20) return "text-emerald-400";
  if (v <= 30) return "text-amber-400";
  return "text-red-400";
}

function tenTwoValueClass(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "text-zinc-400";
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-zinc-400";
}

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  if (!Number.isFinite(d)) return "";
  const diffM = Math.floor((Date.now() - d) / 60000);
  if (diffM < 1) return "just now";
  if (diffM < 60) return `${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

export default function BondView() {
  const [data, setData] = useState<BondsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [activeTab, setActiveTab] = useState<string>("us");
  const [visibleSeries, setVisibleSeries] = useState<Set<string>>(
    () => new Set(US_TREASURY_SERIES.map((s) => s.seriesId)),
  );
  const [showMonthAgo, setShowMonthAgo] = useState(true);
  const [showYearAgo, setShowYearAgo] = useState(false);

  const fetchBonds = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch("/api/bonds", { cache: "no-store" });
      const json = (await res.json()) as Partial<BondsApiResponse> & { error?: string };
      if (!res.ok || json.yieldCurve == null) {
        setData(null);
        setLastFetched(null);
        return;
      }
      setData(json as BondsApiResponse);
      setLastFetched(new Date().toISOString());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchBonds(false);
    const id = setInterval(() => void fetchBonds(true), 1800000);
    const clock = setInterval(() => setNowTick(Date.now()), 60000);
    return () => {
      clearInterval(id);
      clearInterval(clock);
    };
  }, [fetchBonds]);

  const curveRows = useMemo(() => {
    if (!data?.yieldCurve) return [];
    const monthByMaturity = new Map((data.yieldCurve.monthAgo ?? []).map((p) => [p.maturity, p.value]));
    const yearByMaturity = new Map((data.yieldCurve.yearAgo ?? []).map((p) => [p.maturity, p.value]));
    return (data.yieldCurve.current ?? []).map((c) => ({
      maturity: c.maturity,
      current: c.value,
      monthAgo: monthByMaturity.get(c.maturity) ?? null,
      yearAgo: yearByMaturity.get(c.maturity) ?? null,
    }));
  }, [data]);

  const country = data?.bondsByCountry?.[activeTab];
  const liveUpdatedLabel = useMemo(() => {
    if (!lastFetched) return "Live · Updated —";
    const mins = Math.max(0, Math.floor((nowTick - new Date(lastFetched).getTime()) / 60000));
    return `Live · Updated ${mins} min${mins === 1 ? "" : "s"} ago`;
  }, [lastFetched, nowTick]);
  const score = data?.sentiment.score ?? 50;
  const scoreColor =
    score <= 20 ? "text-red-500" : score <= 40 ? "text-amber-400" : score <= 60 ? "text-zinc-300" : score <= 80 ? "text-emerald-400" : "text-emerald-300";
  const chartSeries = useMemo(
    () => (activeTab === "us" ? [...US_TREASURY_SERIES] : (NON_US_SERIES[activeTab] ?? [])),
    [activeTab],
  );
  const chartRows = useMemo(() => {
    if (!data) return [];
    const byDate = new Map<string, Record<string, string | number | null>>();
    for (const s of chartSeries) {
      const points = data.historicalYields?.[s.seriesId] ?? [];
      for (const p of points) {
        const row = byDate.get(p.date) ?? { date: p.date };
        row[s.seriesId] = p.value;
        byDate.set(p.date, row);
      }
    }
    return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [data, chartSeries]);

  useEffect(() => {
    if (activeTab === "us") {
      setVisibleSeries(new Set(US_TREASURY_SERIES.map((s) => s.seriesId)));
    }
  }, [activeTab]);

  if (loading) {
    return (
      <div className="mt-2 rounded-2xl border border-white/10 bg-[#050713] p-5 text-sm text-zinc-500">
        Loading fixed income dashboard...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mt-2 rounded-2xl border border-white/10 bg-[#050713] p-5 text-sm text-red-400">
        Failed to load bond market data.
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-3">
      <section className="rounded-2xl border border-white/10 bg-[#050713] p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Yield Curve</p>
            <p className="text-sm text-zinc-200">US Treasury Curve</p>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500">
              <span>{liveUpdatedLabel}</span>
              <button
                type="button"
                onClick={() => void fetchBonds(true)}
                className="rounded border border-white/10 bg-white/5 p-1 text-zinc-400 transition hover:text-zinc-200"
                title="Refresh bond data"
                aria-label="Refresh bond data"
              >
                <svg className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded px-2 py-1 text-[10px] font-semibold ${data.yieldCurve.shape === "Inverted" ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"}`}>
              {data.yieldCurve.shape}
            </span>
            <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-zinc-300">
              2s10s: {fmtYield(data.yieldCurve.twoTenSpread)}
            </span>
          </div>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px]">
          <button type="button" onClick={() => setShowMonthAgo((v) => !v)} className={`rounded border px-2 py-1 ${showMonthAgo ? "border-[var(--accent-color)]/40 bg-[var(--accent-color)]/15 text-[var(--accent-color)]" : "border-white/10 bg-white/5 text-zinc-400"}`}>
            Month-ago curve
          </button>
          <button type="button" onClick={() => setShowYearAgo((v) => !v)} className={`rounded border px-2 py-1 ${showYearAgo ? "border-[var(--accent-color)]/40 bg-[var(--accent-color)]/15 text-[var(--accent-color)]" : "border-white/10 bg-white/5 text-zinc-400"}`}>
            Year-ago curve
          </button>
          <span className="ml-auto text-zinc-500">Server {timeAgo(data.lastUpdated)}</span>
        </div>
        <p className="mb-2 text-[11px] leading-relaxed text-zinc-500">
          The yield curve plots current US Treasury yields across maturities from 1 month to 30 years. A normal (upward sloping) curve
          signals healthy growth expectations. An inverted curve (short rates above long rates) has historically preceded recessions.
        </p>
        <div className="w-full rounded-xl border border-white/10 bg-[#050713] p-2">
          {/* Explicit px height: percentage height inside padded boxes often resolves to 0 in flex layouts (Recharts blank). */}
          <div style={{ width: "100%", height: 304 }}>
            <ResponsiveContainer width="100%" height={304}>
            <LineChart data={curveRows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="#64748b" strokeOpacity={0.3} />
              <XAxis dataKey="maturity" interval={0} tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <YAxis
                domain={["auto", "auto"]}
                padding={{ top: 8, bottom: 8 }}
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{ background: "#0F1520", border: "1px solid rgba(255,255,255,0.1)" }}
                labelStyle={{ color: "#cbd5e1" }}
                labelFormatter={(maturity) => `Maturity: ${String(maturity)}`}
                formatter={(v) => (v == null ? "—" : `${Number(v).toFixed(3)}%`)}
              />
              <Line
                type="monotone"
                dataKey="current"
                name="Current"
                stroke="var(--accent-color)"
                strokeWidth={2.2}
                dot={{ r: 3 }}
                connectNulls
              />
              {showMonthAgo && (
                <Line type="monotone" dataKey="monthAgo" name="1M ago" stroke="#60a5fa" strokeWidth={1.4} dot={false} connectNulls />
              )}
              {showYearAgo && (
                <Line type="monotone" dataKey="yearAgo" name="1Y ago" stroke="#f59e0b" strokeWidth={1.4} dot={false} connectNulls />
              )}
            </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <section className="min-w-0 space-y-3 xl:col-span-8">
          <div className="rounded-2xl border border-white/10 bg-[#050713] p-3">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">Bond Market</p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {TAB_ORDER.map((id) => {
                const label = data.bondsByCountry[id]?.label ?? id.toUpperCase();
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={`rounded-lg border px-2.5 py-1.5 text-[11px] transition ${
                      activeTab === id
                        ? "border-[var(--accent-color)]/40 bg-[var(--accent-color)]/15 text-[var(--accent-color)]"
                        : "border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
              Yield up = bond price falling (sellers dominating). Yield down = bond price rising (buyers dominating). Daily/weekly
              changes shown in basis points (bps) where 100 bps = 1%.
            </p>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {country?.maturities.map((m) => (
                <div key={`${country.id}-${m.seriesId}`} className="rounded-xl border border-white/10 bg-[#050713] p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs font-medium text-zinc-200">{m.label}</p>
                    <p className={`text-xs font-semibold ${directionClass(m.dailyChangeBps)}`}>
                      {m.dailyChangeBps != null && m.dailyChangeBps > 0
                        ? "Yield ↑ Price ↓"
                        : m.dailyChangeBps != null && m.dailyChangeBps < 0
                          ? "Yield ↓ Price ↑"
                          : "Flat"}
                    </p>
                  </div>
                  <p className={`text-lg font-semibold ${directionClass(m.dailyChangeBps)}`}>{fmtYield(m.current)}</p>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-400">
                    <span className={directionClass(m.dailyChangeBps)}>Day: {fmtBps(m.dailyChangeBps)}</span>
                    <span className={directionClass(m.weeklyChangeBps)}>Week: {fmtBps(m.weeklyChangeBps)}</span>
                  </div>
                  <div className="mt-2 h-20 w-full min-w-0">
                    <BondChartBox className="w-full" style={{ height: 72 }} minWidth={100}>
                      {(w, h) => (
                        <LineChart
                          width={w}
                          height={h}
                          data={m.sparkline}
                          margin={{ top: 4, right: 0, bottom: 4, left: 0 }}
                        >
                          <YAxis domain={["auto", "auto"]} width={0} tick={false} axisLine={false} />
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke={m.dailyChangeBps != null && m.dailyChangeBps > 0 ? "#f87171" : "#34d399"}
                            strokeWidth={1.6}
                            dot={false}
                          />
                        </LineChart>
                      )}
                    </BondChartBox>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">Live Chart</p>
              <p className="mb-2 text-[11px] leading-relaxed text-zinc-500">
                Each line is a maturity; the chart shows all available history for the selected market. US Treasury uses daily Treasury.gov data; other markets use FRED, World Bank, or official feeds where available.
              </p>
              {activeTab === "us" && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {US_TREASURY_SERIES.map((item) => {
                    const active = visibleSeries.has(item.seriesId);
                    return (
                      <button
                        key={item.seriesId}
                        type="button"
                        onClick={() =>
                          setVisibleSeries((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.seriesId)) next.delete(item.seriesId);
                            else next.add(item.seriesId);
                            return next;
                          })
                        }
                        className={`rounded-lg border px-2.5 py-1.5 text-[11px] transition ${
                          active
                            ? "border-[var(--accent-color)]/40 bg-[var(--accent-color)]/15 text-[var(--accent-color)]"
                            : "border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="min-h-[320px] w-full min-w-0 rounded-xl border border-white/10 bg-[#050713] p-2">
                {chartRows.length === 0 ? (
                  <div className="flex h-[320px] items-center justify-center text-sm text-zinc-500">
                    No historical yield data for this market yet.
                  </div>
                ) : (
                <BondChartBox className="h-[320px] w-full min-w-0" minWidth={280}>
                  {(w, h) => (
                    <LineChart width={w} height={h} data={chartRows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                      <CartesianGrid {...CHART_GRID} />
                      <XAxis
                        dataKey="date"
                        interval="preserveStartEnd"
                        tick={{ fill: "#94a3b8", fontSize: 11 }}
                        tickFormatter={(v: string) => {
                          const d = new Date(v);
                          if (!Number.isFinite(d.getTime())) return v;
                          return d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
                        }}
                      />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={["auto", "auto"]} />
                      <Tooltip
                        contentStyle={{ background: "#0F1520", border: "1px solid rgba(255,255,255,0.1)" }}
                        labelStyle={{ color: "#cbd5e1" }}
                        labelFormatter={(v: string) => {
                          const d = new Date(v);
                          return Number.isFinite(d.getTime())
                            ? d.toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" })
                            : v;
                        }}
                        formatter={(value, _name, item) => {
                          const n = typeof value === "number" ? value : Number(value);
                          const label =
                            typeof item === "object" && item != null && "name" in item
                              ? String((item as { name?: string }).name ?? "")
                              : "";
                          return [Number.isFinite(n) ? `${n.toFixed(3)}%` : "—", label];
                        }}
                      />
                      <Legend verticalAlign="bottom" />
                      {chartSeries
                        .filter((s) => activeTab !== "us" || visibleSeries.has(s.seriesId))
                        .map((s) => (
                          <Line
                            key={s.seriesId}
                            type="monotone"
                            dataKey={s.seriesId}
                            name={s.label}
                            stroke={s.color}
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                            isAnimationActive={false}
                          />
                        ))}
                    </LineChart>
                  )}
                </BondChartBox>
                )}
              </div>
              {activeTab !== "us" && (
                <p className="mt-2 text-[10px] text-zinc-500">Note: international bond data updates monthly.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#050713] p-3">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">Bond News</p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {data.news.length === 0 ? (
                <p className="text-sm text-zinc-500">No recent bond headlines.</p>
              ) : (
                data.news.map((n) => (
                  <a
                    key={`${n.url}-${n.publishedAt}`}
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-white/10 bg-[#050713] p-3 transition hover:border-[var(--accent-color)]/30 hover:bg-white/5"
                  >
                    <p className="line-clamp-2 text-sm font-medium text-zinc-100">{n.title}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">{n.source} · {timeAgo(n.publishedAt)}</p>
                  </a>
                ))
              )}
            </div>
          </div>
        </section>

        <aside className="space-y-3 xl:col-span-4">
          <div className="rounded-2xl border border-white/10 bg-[#050713] p-3">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">Risk & Sentiment</p>
            <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
              This panel tracks equity volatility (VIX), the Treasury 10Y–2Y spread, and overall curve shape. An inverted yield curve has
              often preceded US recessions. The Fear &amp; Greed proxy blends curve slope and VIX into a single 0–100 score.
            </p>
            {(
              [
                { key: "yieldCurve", name: "Yield Curve", item: data.spreads.yieldCurve, kind: "yieldCurve" as const },
                { key: "vix", name: "VIX", item: data.spreads.vix, kind: "vix" as const },
                { key: "tenTwo", name: "10Y-2Y Spread", item: data.spreads.tenTwoSpread, kind: "tenTwo" as const },
              ] as const
            ).map(({ key, name, item, kind }) => {
              if (kind === "vix") {
                return (
                  <div key={key} className="mb-2 rounded-xl border border-white/10 bg-[#050713] p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-zinc-300">{name}</p>
                      <span className={`flex shrink-0 items-center gap-1.5 ${vixLevelClass(item.value)}`}>
                        <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-50" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
                        </span>
                        <span>{fmtVix(item.value)}</span>
                      </span>
                    </div>
                    <p className={`mt-0.5 text-[11px] ${directionClass(item.change)}`}>{fmtVixPtsDelta(item.change)}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">{item.interpretation}</p>
                    {item.note ? <p className="mt-1 text-[10px] text-zinc-500">{item.note}</p> : null}
                  </div>
                );
              }
              if (kind === "tenTwo") {
                return (
                  <div key={key} className="mb-2 rounded-xl border border-white/10 bg-[#050713] p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-zinc-300">{name}</p>
                      <span className={`shrink-0 text-sm font-medium ${tenTwoValueClass(item.value)}`}>{fmtYield(item.value)}</span>
                    </div>
                    <p className={`mt-0.5 text-[11px] ${directionClass(item.change)}`}>{fmtBps(item.change)}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">{item.interpretation}</p>
                    {item.note ? <p className="mt-1 text-[10px] text-zinc-500">{item.note}</p> : null}
                  </div>
                );
              }
              const est = item.estimated === true;
              return (
                <div key={key} className="mb-2 rounded-xl border border-white/10 bg-[#050713] p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-zinc-300">{name}</p>
                    <span className={`flex shrink-0 items-baseline gap-1 ${est ? "" : directionClass(item.change)}`}>
                      <span className={est ? "text-zinc-400" : undefined}>{fmtYield(item.value)}</span>
                      {est ? <span className="text-[9px] text-zinc-600">(est.)</span> : null}
                    </span>
                  </div>
                  <p className={`mt-0.5 text-[11px] ${est ? "text-zinc-500" : directionClass(item.change)}`}>{fmtBps(item.change)}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">{item.interpretation}</p>
                  {item.note ? <p className="mt-1 text-[10px] text-zinc-500">{item.note}</p> : null}
                </div>
              );
            })}

            <div className="mt-2 rounded-xl border border-white/10 bg-[#050713] p-2.5">
              <p className="text-xs text-zinc-300">Fear & Greed Proxy</p>
              <p className={`mt-1 text-2xl font-semibold ${scoreColor}`}>{score.toFixed(0)}</p>
              <p className="text-[11px] text-zinc-500">{data.sentiment.label}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#050713] p-3">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">Central Bank Rates</p>
            <div className="space-y-2">
              {Object.values(data.centralBankRates).map((r) => (
                <div key={r.label} className="flex items-center justify-between rounded-lg border border-white/10 bg-[#050713] px-2.5 py-2">
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">{r.label}</p>
                    <p className="text-[11px] text-zinc-400">{r.source}</p>
                    <p className="text-[10px] text-zinc-500">
                      {r.lastUpdated ? `Updated ${new Date(r.lastUpdated).toLocaleDateString()}` : (r.note ?? "Data unavailable")}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-zinc-200">{fmtYield(r.value)}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
