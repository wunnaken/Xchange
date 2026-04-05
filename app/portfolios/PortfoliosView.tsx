"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  PieChart, Pie, Cell,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ThematicHolding {
  ticker: string;
  rank: number;
  weight: number;
  price: number | null;
  changePercent: number | null;
  change: number | null;
}

interface ThematicPortfolio {
  id: string;
  name: string;
  description: string;
  color: string;
  tickers: string[];
  holdings: ThematicHolding[];
  dayChangePct: number | null;
  bestPerformer: { ticker: string; changePercent: number } | null;
  worstPerformer: { ticker: string; changePercent: number } | null;
}

type InvestorChange = "NEW" | "INCREASED" | "DECREASED" | "CLOSED" | "UNCHANGED";

interface InvestorHolding {
  rank: number;
  ticker: string;
  companyName: string;
  value: number;
  shares: number;
  portfolioPct: number;
  change: InvestorChange;
  changePct: number | null;
  price?: number | null;
  changePercent?: number | null;
  dayChange?: number | null;
}

interface FamousInvestor {
  id: string;
  name: string;
  fund: string;
  style: string;
  cik: string;
  filingDate: string | null;
  filingPeriod: string | null;
  nextFilingEst: string | null;
  totalValue: number;
  holdingsCount: number;
  holdings: InvestorHolding[];
  changes: { newPositions: number; increased: number; decreased: number; closed: number };
}

interface ChartPoint { t: number; value: number }

// ─── Constants ────────────────────────────────────────────────────────────────

const TIMEFRAMES = ["1D","1W","1M","3M","YTD","1Y"] as const;
type Timeframe = typeof TIMEFRAMES[number];

function tfToParam(tf: Timeframe): string {
  return tf.toLowerCase().replace("ytd", "ytd");
}

const STYLE_COLORS: Record<string, string> = {
  Value: "#3b82f6",
  Growth: "#8b5cf6",
  Macro: "#f59e0b",
  Activist: "#ef4444",
  Contrarian: "#71717a",
  Distressed: "#f97316",
};

const CHANGE_STYLES: Record<InvestorChange, { label: string; bg: string; text: string }> = {
  NEW: { label: "NEW", bg: "bg-emerald-500/15", text: "text-emerald-400" },
  INCREASED: { label: "↑", bg: "bg-blue-500/15", text: "text-blue-400" },
  DECREASED: { label: "↓", bg: "bg-amber-500/15", text: "text-amber-400" },
  CLOSED: { label: "CLOSED", bg: "bg-red-500/15", text: "text-red-400" },
  UNCHANGED: { label: "—", bg: "bg-white/5", text: "text-zinc-500" },
};

const THEMATIC_CATEGORIES: Record<string, string[]> = {
  Tech: ["ai", "cyber", "gaming", "5g"],
  Energy: ["nuclear", "oil", "clean"],
  Finance: ["banks", "reits", "crypto"],
  Healthcare: ["biotech", "genomics"],
  Consumer: ["consumer", "luxury"],
  Defense: ["defense", "space"],
  Other: ["ev", "infrastructure", "emerging", "ag"],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number | null, decimals = 2): string {
  if (n == null) return "—";
  return (n >= 0 ? "+" : "") + n.toFixed(decimals) + "%";
}

function pctColor(n: number | null): string {
  if (n == null) return "text-zinc-500";
  return n >= 0 ? "text-emerald-400" : "text-red-400";
}

function fmtMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtTs(t: number, tf: Timeframe): string {
  const d = new Date(t * 1000);
  if (tf === "1D") return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function generateSparkline(changePercent: number | null, seed: number, points = 7): number[] {
  // Deterministic noise based on seed to avoid hydration mismatch
  const rand = (i: number) => Math.sin(seed * 9301 + i * 49297 + 233995) * 0.5 + 0.5;
  const base = 100;
  const arr = [base];
  for (let i = 1; i < points; i++) {
    arr.push(arr[i - 1] + (rand(i) - 0.5) * 2);
  }
  if (changePercent != null) {
    arr[points - 1] = base + (base * changePercent) / 100;
  }
  return arr;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Sparkline({ values, up }: { values: number[]; up: boolean }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 52, H = 20;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const color = up ? "#10b981" : "#ef4444";
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="ml-auto">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.8} />
    </svg>
  );
}

function TimeframePicker({ value, onChange }: { value: Timeframe; onChange: (tf: Timeframe) => void }) {
  return (
    <div className="flex gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
      {TIMEFRAMES.map((tf) => (
        <button
          key={tf}
          onClick={() => onChange(tf)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
            value === tf ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {tf}
        </button>
      ))}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-[var(--accent-color)]" />
    </div>
  );
}

function AIAnalysisCard({
  type, name, description, style, holdings, dayChangePct, filingPeriod,
}: {
  type: "thematic" | "famous";
  name: string;
  description?: string;
  style?: string;
  holdings: Array<{ ticker: string; companyName?: string; portfolioPct?: number; changePercent?: number | null; change?: InvestorChange }>;
  dayChangePct?: number | null;
  filingPeriod?: string | null;
}) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  async function load() {
    if (fetched || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/portfolios/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, name, description, style, holdings, dayChangePct, filingPeriod }),
      });
      const data = (await res.json()) as { analysis?: string };
      setAnalysis(data.analysis ?? null);
    } catch {
      setAnalysis(null);
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-color)]/70">AI Analysis</span>
        {!fetched && !loading && (
          <button
            onClick={load}
            className="text-[11px] px-2.5 py-1 rounded-md border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 transition-colors"
          >
            Generate
          </button>
        )}
      </div>
      {loading && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="h-3 w-3 animate-spin rounded-full border border-zinc-500 border-t-transparent" />
          Analyzing...
        </div>
      )}
      {analysis && <p className="text-xs leading-relaxed text-zinc-300">{analysis}</p>}
      {fetched && !analysis && !loading && (
        <p className="text-xs text-zinc-500">Analysis unavailable.</p>
      )}
    </div>
  );
}

// ─── Portfolio Performance Chart ──────────────────────────────────────────────

function PortfolioChart({ portfolioId, color, timeframe, tickersOverride }: { portfolioId: string; color: string; timeframe: Timeframe; tickersOverride?: string }) {
  const [data, setData] = useState<{ points: ChartPoint[]; benchmark: ChartPoint[] }>({ points: [], benchmark: [] });
  const [loading, setLoading] = useState(true);
  const cacheRef = useRef<Record<string, typeof data>>({});

  useEffect(() => {
    const key = `${portfolioId}:${timeframe}:${tickersOverride ?? ""}`;
    if (cacheRef.current[key]) {
      setData(cacheRef.current[key]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ id: portfolioId, tf: tfToParam(timeframe) });
    if (tickersOverride) params.set("tickers", tickersOverride);
    fetch(`/api/portfolios/chart?${params.toString()}`)
      .then((r) => r.json())
      .then((d: { points?: ChartPoint[]; benchmark?: ChartPoint[] }) => {
        const result = { points: d.points ?? [], benchmark: d.benchmark ?? [] };
        cacheRef.current[key] = result;
        setData(result);
      })
      .catch(() => setData({ points: [], benchmark: [] }))
      .finally(() => setLoading(false));
  }, [portfolioId, timeframe]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-[var(--accent-color)]" />
      </div>
    );
  }

  if (!data.points.length) {
    return <div className="flex h-full items-center justify-center text-xs text-zinc-600">No chart data available</div>;
  }

  // Merge portfolio + benchmark on same timeline
  const tsMap = new Map<number, { portfolio?: number; spy?: number }>();
  data.points.forEach((p) => { const e = tsMap.get(p.t) ?? {}; tsMap.set(p.t, { ...e, portfolio: p.value }); });
  data.benchmark.forEach((p) => { const e = tsMap.get(p.t) ?? {}; tsMap.set(p.t, { ...e, spy: p.value }); });
  const chartData = [...tsMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, v]) => ({ t, portfolio: v.portfolio ?? null, spy: v.spy ?? null }));

  const lastPct = data.points[data.points.length - 1]?.value ?? null;

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: number }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border border-white/10 bg-[#0a0e1a] px-3 py-2 text-xs shadow-xl">
        <p className="text-zinc-500 mb-1">{label ? fmtTs(label, timeframe) : ""}</p>
        {payload.map((p) => (
          <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value != null ? pct(p.value) : "—"}</p>
        ))}
      </div>
    );
  };

  return (
    <div>
      {lastPct != null && (
        <p className={`text-lg font-bold tabular-nums mb-1 ${pctColor(lastPct)}`}>{pct(lastPct)}</p>
      )}
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="t"
            tickFormatter={(v) => fmtTs(v as number, timeframe)}
            tick={{ fontSize: 9, fill: "#52525b" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v) => `${v > 0 ? "+" : ""}${(v as number).toFixed(1)}%`}
            tick={{ fontSize: 9, fill: "#52525b" }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line type="monotone" dataKey="portfolio" stroke={color} strokeWidth={2} dot={false} name="Portfolio" connectNulls />
          <Line type="monotone" dataKey="spy" stroke="#52525b" strokeWidth={1.5} dot={false} name="SPY" strokeDasharray="4 3" connectNulls />
          <Legend
            iconType="line"
            iconSize={12}
            formatter={(value) => <span style={{ fontSize: 9, color: "#71717a" }}>{value}</span>}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Radar Chart ──────────────────────────────────────────────────────────────

function HoldingsRadar({ holdings, color }: { holdings: ThematicHolding[]; color: string }) {
  const subset = holdings.slice(0, 7);
  const changes = subset.map((h) => h.changePercent ?? 0);
  const minC = Math.min(...changes);
  // Normalize so all values >= 0, preserving relative performance shape
  const radarData = subset.map((h) => ({
    ticker: h.ticker,
    value: Math.round(((h.changePercent ?? 0) - minC) * 100) / 100,
    raw: h.changePercent ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
        <PolarGrid stroke="rgba(255,255,255,0.06)" />
        <PolarAngleAxis
          dataKey="ticker"
          tick={{ fontSize: 9, fill: "#71717a" }}
        />
        <PolarRadiusAxis tick={false} axisLine={false} />
        <Radar
          name="Performance"
          dataKey="value"
          stroke={color}
          fill={color}
          fillOpacity={0.25}
          strokeWidth={1.5}
        />
        <Tooltip
          contentStyle={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 10 }}
          formatter={(_v, _n, props: { payload?: { raw?: number } }) => [
            pct(props.payload?.raw ?? 0),
            "Day Change",
          ]}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ─── Thematic Tab ─────────────────────────────────────────────────────────────

function ThematicCard({
  portfolio,
  isExpanded,
  onToggle,
}: {
  portfolio: ThematicPortfolio;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const topHoldings = portfolio.holdings.slice(0, 3);

  return (
    <button
      onClick={onToggle}
      className="text-left w-full rounded-2xl border border-white/10 bg-[#050713] overflow-hidden transition-all duration-200 hover:border-white/20 hover:bg-white/[0.025]"
      style={{ borderLeft: `3px solid ${portfolio.color}` }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <p className="text-sm font-semibold text-zinc-100">{portfolio.name}</p>
            <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{portfolio.description}</p>
          </div>
          <div className="text-right shrink-0">
            <p className={`text-lg font-bold tabular-nums ${pctColor(portfolio.dayChangePct)}`}>
              {pct(portfolio.dayChangePct)}
            </p>
            <p className="text-[10px] text-zinc-600">today</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          {topHoldings.map((h) => (
            <span
              key={h.ticker}
              className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5 text-[10px]"
            >
              <span className="text-zinc-300 font-medium">{h.ticker}</span>
              <span className={pctColor(h.changePercent)}>{pct(h.changePercent, 1)}</span>
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between mt-3">
          <div className="flex gap-3 text-[10px] text-zinc-600">
            {portfolio.bestPerformer && (
              <span>Best: <span className="text-emerald-400">{portfolio.bestPerformer.ticker}</span></span>
            )}
            {portfolio.worstPerformer && (
              <span>Worst: <span className="text-red-400">{portfolio.worstPerformer.ticker}</span></span>
            )}
          </div>
          <span className="text-xs text-zinc-500">
            {isExpanded ? "Collapse ↑" : "View →"}
          </span>
        </div>
      </div>
    </button>
  );
}

function ThematicDetail({ portfolio }: { portfolio: ThematicPortfolio }) {
  const [tf, setTf] = useState<Timeframe>("YTD");

  // Stable sparklines
  const sparklines = useMemo(
    () =>
      Object.fromEntries(
        portfolio.holdings.map((h, i) => [h.ticker, generateSparkline(h.changePercent, i + 1)])
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolio.id]
  );

  return (
    <div className="col-span-full rounded-2xl border border-white/10 bg-[#050713] p-5 space-y-5"
      style={{ borderLeft: `3px solid ${portfolio.color}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-semibold" style={{ color: portfolio.color }}>{portfolio.name}</h3>
          <p className="text-xs text-zinc-500 mt-0.5">{portfolio.description} · {portfolio.holdings.length} holdings · Equal weighted</p>
        </div>
        <TimeframePicker value={tf} onChange={setTf} />
      </div>

      {/* Main chart */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-3">Performance vs SPY</p>
        <PortfolioChart portfolioId={portfolio.id} color={portfolio.color} timeframe={tf} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Holdings table */}
        <div className="lg:col-span-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/5 text-zinc-600 uppercase tracking-wider">
                <th className="pb-2 text-left w-6">#</th>
                <th className="pb-2 text-left">Ticker</th>
                <th className="pb-2 text-right">Weight</th>
                <th className="pb-2 text-right">Price</th>
                <th className="pb-2 text-right">Day %</th>
                <th className="pb-2 text-right hidden sm:table-cell pl-4">7D</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {portfolio.holdings.map((h) => {
                const isUp = (h.changePercent ?? 0) >= 0;
                return (
                  <tr key={h.ticker} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-2 text-zinc-600">{h.rank}</td>
                    <td className="py-2 font-medium text-zinc-200">{h.ticker}</td>
                    <td className="py-2 text-right text-zinc-400">{h.weight}%</td>
                    <td className="py-2 text-right text-zinc-300">
                      {h.price != null ? `$${h.price < 1 ? h.price.toFixed(4) : h.price.toFixed(2)}` : "—"}
                    </td>
                    <td className={`py-2 text-right font-medium tabular-nums ${pctColor(h.changePercent)}`}>
                      {pct(h.changePercent, 2)}
                    </td>
                    <td className="py-2 hidden sm:table-cell pl-4">
                      <Sparkline values={sparklines[h.ticker] ?? [100,100,100,100,100,100,100]} up={isUp} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Right: radar + AI */}
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1">Today&apos;s Performance Shape</p>
            <HoldingsRadar holdings={portfolio.holdings} color={portfolio.color} />
          </div>
          <AIAnalysisCard
            type="thematic"
            name={portfolio.name}
            description={portfolio.description}
            holdings={portfolio.holdings.map((h) => ({ ticker: h.ticker, changePercent: h.changePercent }))}
            dayChangePct={portfolio.dayChangePct}
          />
        </div>
      </div>
    </div>
  );
}

function ThematicTab({ portfolios, loading }: { portfolios: ThematicPortfolio[]; loading: boolean }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [expanded, setExpanded] = useState<string | null>(null);

  const categoryIds = useMemo(() => {
    if (category === "All") return null;
    return THEMATIC_CATEGORIES[category] ?? null;
  }, [category]);

  const filtered = useMemo(() => {
    return portfolios.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (categoryIds && !categoryIds.includes(p.id)) return false;
      return true;
    });
  }, [portfolios, search, categoryIds]);

  const expandedPortfolio = expanded ? filtered.find((p) => p.id === expanded) ?? null : null;

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => (prev === id ? null : id));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* Filter row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search portfolios..."
          className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-white/20 transition-colors"
        />
        <div className="flex gap-1.5 flex-wrap">
          {["All", "Tech", "Energy", "Finance", "Healthcare", "Consumer", "Defense", "Other"].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                category === cat
                  ? "bg-[var(--accent-color)] text-black"
                  : "border border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/20"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((portfolio) => (
          <>
            <ThematicCard
              key={portfolio.id}
              portfolio={portfolio}
              isExpanded={expanded === portfolio.id}
              onToggle={() => toggleExpand(portfolio.id)}
            />
            {expanded === portfolio.id && expandedPortfolio && (
              <ThematicDetail key={`detail-${portfolio.id}`} portfolio={expandedPortfolio} />
            )}
          </>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="py-12 text-center text-sm text-zinc-600">No portfolios match your filters.</div>
      )}
    </div>
  );
}

// ─── Famous Investors Tab ─────────────────────────────────────────────────────

function InvestorCard({
  investor,
  isExpanded,
  onToggle,
}: {
  investor: FamousInvestor;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const styleColor = STYLE_COLORS[investor.style] ?? "#71717a";
  const topHoldings = investor.holdings.slice(0, 3);

  return (
    <button
      onClick={onToggle}
      className="text-left w-full rounded-2xl border border-white/10 bg-[#050713] p-4 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.025]"
    >
      <div className="flex items-start gap-3 mb-3">
        <div
          className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-sm font-bold text-white"
          style={{ background: styleColor + "33", border: `1px solid ${styleColor}55` }}
        >
          {getInitials(investor.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-100">{investor.name}</p>
          <p className="text-xs text-zinc-500 truncate">{investor.fund}</p>
        </div>
        <span
          className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium"
          style={{ background: styleColor + "22", color: styleColor }}
        >
          {investor.style}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {topHoldings.map((h) => (
          <span key={`${h.ticker}-${h.rank}`} className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-zinc-300 font-medium">
            {h.ticker}
            {h.portfolioPct > 0 && <span className="text-zinc-600 ml-1">{h.portfolioPct.toFixed(1)}%</span>}
          </span>
        ))}
        {investor.holdings.length === 0 && (
          <span className="text-[10px] text-zinc-600">Fetching filing data…</span>
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] text-zinc-600">
        <div className="flex gap-3">
          <span>Filed: <span className="text-zinc-400">{fmtDate(investor.filingDate)}</span></span>
          {investor.totalValue > 0 && <span>{fmtMoney(investor.totalValue * 1000)} AUM</span>}
        </div>
        <span className="text-zinc-500">{isExpanded ? "Collapse ↑" : "View →"}</span>
      </div>
    </button>
  );
}

function InvestorDetail({ investor }: { investor: FamousInvestor }) {
  const styleColor = STYLE_COLORS[investor.style] ?? "#71717a";
  const { newPositions, increased, decreased, closed } = investor.changes;
  const [tf, setTf] = useState<Timeframe>("YTD");

  // Build top ticker list for chart (valid US tickers only)
  const chartTickers = investor.holdings
    .filter((h) => h.ticker && h.ticker.length <= 5 && /^[A-Z.]+$/.test(h.ticker))
    .slice(0, 6)
    .map((h) => h.ticker)
    .join(",");

  // Radar data from portfolio allocation %
  const radarData = investor.holdings.slice(0, 8).map((h) => ({
    ticker: h.ticker,
    value: h.portfolioPct,
    raw: h.changePercent ?? null,
  }));

  const pieData = investor.holdings.slice(0, 8).map((h) => ({
    name: h.ticker,
    value: h.portfolioPct,
  }));

  return (
    <div className="col-span-full rounded-2xl border border-white/10 bg-[#050713] p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div
            className="h-14 w-14 shrink-0 rounded-full flex items-center justify-center text-lg font-bold text-white"
            style={{ background: styleColor + "33", border: `2px solid ${styleColor}55` }}
          >
            {getInitials(investor.name)}
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-100">{investor.name}</h3>
            <p className="text-xs text-zinc-500">{investor.fund}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="rounded-md px-2 py-0.5 text-[10px] font-medium" style={{ background: styleColor + "22", color: styleColor }}>
                {investor.style}
              </span>
              {investor.totalValue > 0 && (
                <span className="text-[10px] text-zinc-500">{fmtMoney(investor.totalValue * 1000)} AUM · {investor.holdingsCount} positions</span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right text-xs text-zinc-500 shrink-0">
          <p>Filed: <span className="text-zinc-300">{fmtDate(investor.filingDate)}</span></p>
          <p className="mt-0.5">Period: <span className="text-zinc-300">{investor.filingPeriod ?? "—"}</span></p>
          {investor.nextFilingEst && (
            <p className="mt-0.5">Next est: <span className="text-zinc-300">{fmtDate(investor.nextFilingEst)}</span></p>
          )}
        </div>
      </div>

      {/* Changes summary */}
      {(newPositions + increased + decreased + closed) > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {newPositions > 0 && <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-400">{newPositions} new</span>}
          {increased > 0 && <span className="rounded-md bg-blue-500/10 px-2 py-1 text-blue-400">{increased} increased</span>}
          {decreased > 0 && <span className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-400">{decreased} decreased</span>}
          {closed > 0 && <span className="rounded-md bg-red-500/10 px-2 py-1 text-red-400">{closed} closed</span>}
        </div>
      )}

      {/* Performance chart */}
      {chartTickers && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Portfolio vs SPY</p>
            <TimeframePicker value={tf} onChange={setTf} />
          </div>
          <PortfolioChart portfolioId={investor.id} color={styleColor} timeframe={tf} tickersOverride={chartTickers} />
        </div>
      )}

      {investor.holdings.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Holdings table */}
          <div className="lg:col-span-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5 text-zinc-600 uppercase tracking-wider">
                  <th className="pb-2 text-left w-6">#</th>
                  <th className="pb-2 text-left">Ticker</th>
                  <th className="pb-2 text-left hidden sm:table-cell">Company</th>
                  <th className="pb-2 text-right">% Port.</th>
                  <th className="pb-2 text-right">Value</th>
                  <th className="pb-2 text-right hidden sm:table-cell">Today</th>
                  <th className="pb-2 text-right">Qtr</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {investor.holdings.map((h) => {
                  const cs = CHANGE_STYLES[h.change];
                  const isUp = (h.changePercent ?? 0) >= 0;
                  return (
                    <tr key={`${h.ticker}-${h.rank}`} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-2 text-zinc-600">{h.rank}</td>
                      <td className="py-2 font-medium text-zinc-200">{h.ticker}</td>
                      <td className="py-2 text-zinc-500 max-w-[140px] truncate hidden sm:table-cell">{h.companyName}</td>
                      <td className="py-2 text-right text-zinc-300 tabular-nums">{h.portfolioPct.toFixed(1)}%</td>
                      <td className="py-2 text-right text-zinc-400 tabular-nums">{fmtMoney(h.value * 1000)}</td>
                      <td className={`py-2 text-right tabular-nums font-medium hidden sm:table-cell ${h.changePercent != null ? pctColor(h.changePercent) : "text-zinc-600"}`}>
                        {h.changePercent != null ? pct(h.changePercent, 2) : "—"}
                      </td>
                      <td className="py-2 text-right">
                        <span className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-semibold ${cs.bg} ${cs.text}`}>
                          {cs.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Right: radar + AI */}
          <div className="space-y-4">
            {radarData.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1">Allocation Shape</p>
                <ResponsiveContainer width="100%" height={180}>
                  <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                    <PolarGrid stroke="rgba(255,255,255,0.06)" />
                    <PolarAngleAxis dataKey="ticker" tick={{ fontSize: 9, fill: "#71717a" }} />
                    <PolarRadiusAxis tick={false} axisLine={false} />
                    <Radar
                      name="% of Portfolio"
                      dataKey="value"
                      stroke={styleColor}
                      fill={styleColor}
                      fillOpacity={0.25}
                      strokeWidth={1.5}
                    />
                    <Tooltip
                      contentStyle={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 10 }}
                      formatter={(v, _n, props) => {
                        const raw = (props as { payload?: { raw?: number | null } }).payload?.raw;
                        return [`${(v as number).toFixed(1)}% portfolio${raw != null ? ` · ${pct(raw, 2)} today` : ""}`, ""];
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}

            <AIAnalysisCard
              type="famous"
              name={investor.name}
              style={investor.style}
              holdings={investor.holdings.map((h) => ({ ticker: h.ticker, companyName: h.companyName, portfolioPct: h.portfolioPct, change: h.change, changePercent: h.changePercent }))}
              filingPeriod={investor.filingPeriod}
            />
          </div>
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-zinc-600">
          13F data not yet available — SEC EDGAR parsing in progress.
        </div>
      )}
    </div>
  );
}

function FamousTab({ investors, loading }: { investors: FamousInvestor[]; loading: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => (prev === id ? null : id));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {investors.map((investor) => (
        <>
          <InvestorCard
            key={investor.id}
            investor={investor}
            isExpanded={expanded === investor.id}
            onToggle={() => toggle(investor.id)}
          />
          {expanded === investor.id && (
            <InvestorDetail key={`detail-${investor.id}`} investor={investor} />
          )}
        </>
      ))}
    </div>
  );
}

// ─── Comparison Tool ──────────────────────────────────────────────────────────

function ComparisonTool({
  thematic,
  famous,
}: {
  thematic: ThematicPortfolio[];
  famous: FamousInvestor[];
}) {
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");

  function getPortfolioData(id: string) {
    if (id.startsWith("t:")) {
      const p = thematic.find((t) => t.id === id.slice(2));
      if (!p) return null;
      return { name: p.name, color: p.color, dayChange: p.dayChangePct, topTickers: p.tickers.slice(0, 5) };
    }
    const inv = famous.find((f) => f.id === id.slice(2));
    if (!inv) return null;
    return {
      name: inv.name,
      color: STYLE_COLORS[inv.style] ?? "#71717a",
      dayChange: null as number | null,
      topTickers: inv.holdings.slice(0, 5).map((h) => h.ticker),
    };
  }

  const left = leftId ? getPortfolioData(leftId) : null;
  const right = rightId ? getPortfolioData(rightId) : null;
  const overlap = left && right ? left.topTickers.filter((t) => right.topTickers.includes(t)) : [];

  const selectClass = "rounded-lg border border-white/10 bg-[#0d1120] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-white/20 transition-colors appearance-none";

  return (
    <div className="rounded-2xl border border-white/10 bg-[#050713] p-5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-color)]/70 mb-1">Compare Portfolios</p>
      <h3 className="text-sm font-semibold text-zinc-200 mb-4">Side-by-side comparison</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <select value={leftId} onChange={(e) => setLeftId(e.target.value)} className={selectClass} style={{ colorScheme: "dark" }}>
          <option value="">Select first portfolio...</option>
          <optgroup label="Thematic">
            {thematic.map((p) => <option key={p.id} value={`t:${p.id}`}>{p.name}</option>)}
          </optgroup>
          <optgroup label="Famous Investors">
            {famous.map((i) => <option key={i.id} value={`f:${i.id}`}>{i.name}</option>)}
          </optgroup>
        </select>

        <select value={rightId} onChange={(e) => setRightId(e.target.value)} className={selectClass} style={{ colorScheme: "dark" }}>
          <option value="">Select second portfolio...</option>
          <optgroup label="Thematic">
            {thematic.map((p) => <option key={p.id} value={`t:${p.id}`}>{p.name}</option>)}
          </optgroup>
          <optgroup label="Famous Investors">
            {famous.map((i) => <option key={i.id} value={`f:${i.id}`}>{i.name}</option>)}
          </optgroup>
        </select>
      </div>

      {left && right ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border p-3 text-center" style={{ borderColor: left.color + "44" }}>
            <p className="text-xs font-medium" style={{ color: left.color }}>{left.name}</p>
            {left.dayChange != null && (
              <p className={`text-lg font-bold tabular-nums mt-1 ${pctColor(left.dayChange)}`}>{pct(left.dayChange)}</p>
            )}
            <div className="flex flex-wrap gap-1 justify-center mt-2">
              {left.topTickers.map((t) => (
                <span key={t} className="text-[10px] rounded bg-white/5 px-1.5 py-0.5 text-zinc-400">{t}</span>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-center justify-center gap-2">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Overlap</p>
            {overlap.length > 0 ? (
              <div className="flex flex-wrap gap-1 justify-center">
                {overlap.map((t) => (
                  <span key={t} className="text-[10px] rounded bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/20 px-1.5 py-0.5 text-[var(--accent-color)]">{t}</span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">No overlap</p>
            )}
          </div>

          <div className="rounded-xl border p-3 text-center" style={{ borderColor: right.color + "44" }}>
            <p className="text-xs font-medium" style={{ color: right.color }}>{right.name}</p>
            {right.dayChange != null && (
              <p className={`text-lg font-bold tabular-nums mt-1 ${pctColor(right.dayChange)}`}>{pct(right.dayChange)}</p>
            )}
            <div className="flex flex-wrap gap-1 justify-center mt-2">
              {right.topTickers.map((t) => (
                <span key={t} className="text-[10px] rounded bg-white/5 px-1.5 py-0.5 text-zinc-400">{t}</span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-zinc-600">
          Select two portfolios above to compare them.
        </div>
      )}
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export default function PortfoliosView() {
  const [tab, setTab] = useState<"thematic" | "famous">("thematic");
  const [thematicData, setThematicData] = useState<ThematicPortfolio[]>([]);
  const [famousData, setFamousData] = useState<FamousInvestor[]>([]);
  const [thematicLoading, setThematicLoading] = useState(true);
  const [famousLoading, setFamousLoading] = useState(true);
  const fetchedRef = useRef({ thematic: false, famous: false });

  useEffect(() => {
    if (!fetchedRef.current.thematic) {
      fetchedRef.current.thematic = true;
      fetch("/api/portfolios/thematic")
        .then((r) => r.json())
        .then((d: { portfolios?: ThematicPortfolio[] }) => setThematicData(d.portfolios ?? []))
        .catch(() => setThematicData([]))
        .finally(() => setThematicLoading(false));
    }
  }, []);

  useEffect(() => {
    if (tab === "famous" && !fetchedRef.current.famous) {
      fetchedRef.current.famous = true;
      fetch("/api/portfolios/famous")
        .then((r) => r.json())
        .then((d: { investors?: FamousInvestor[] }) => setFamousData(d.investors ?? []))
        .catch(() => setFamousData([]))
        .finally(() => setFamousLoading(false));
    }
  }, [tab]);

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-1 w-fit">
        {(["thematic", "famous"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t === "thematic" ? "Thematic Portfolios" : "Famous Investors"}
          </button>
        ))}
      </div>

      {tab === "thematic" && <ThematicTab portfolios={thematicData} loading={thematicLoading} />}
      {tab === "famous" && <FamousTab investors={famousData} loading={famousLoading} />}

      {(thematicData.length > 0 || famousData.length > 0) && (
        <ComparisonTool thematic={thematicData} famous={famousData} />
      )}
    </div>
  );
}
