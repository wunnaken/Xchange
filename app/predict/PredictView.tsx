"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────

type Source = "polymarket" | "kalshi" | "manifold" | "predictit";
type TabId = "all" | "political" | "crypto" | "economics" | "sports" | "arbitrage" | "ai";
type SortKey = "volume" | "liquidity" | "endDate" | "probability";

interface PredictMarket {
  id: string;
  source: Source;
  question: string;
  probability: number;
  volume: number;
  liquidity: number;
  endDate: string | null;
  category: string;
  yesPrice: number;
  noPrice: number;
  url: string;
  resolution?: string;
}

interface MarketsData {
  markets: PredictMarket[];
  categories: string[];
  topByVolume: PredictMarket[];
  topByLiquidity: PredictMarket[];
  recentlyResolved: (PredictMarket & { resolution?: string })[];
  lastUpdated: string;
}

interface ArbOpp {
  question: string;
  sourceA: Source;
  priceA: number;
  urlA: string;
  sourceB: Source;
  priceB: number;
  urlB: string;
  spread: number;
  totalCost: number;
  potentialProfit: number;
}

interface RoundIssue {
  id: string;
  source: Source;
  question: string;
  yesPrice: number;
  noPrice: number;
  total: number;
  gap: number;
  type: "over" | "under";
  url: string;
}

interface AiAnalysis {
  fairValue: number | null;
  confidence: "low" | "medium" | "high";
  summary: string;
  bullishFactors: string[];
  bearishFactors: string[];
  baseRate: string;
  mispricing: number | null;
  keyRisks: string;
}

interface Mispricing {
  question: string;
  currentProbability: number;
  fairValue: number;
  reasoning: string;
  direction: "overpriced" | "underpriced";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SOURCE_COLORS: Record<Source, string> = {
  polymarket: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  kalshi: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  manifold: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  predictit: "bg-amber-500/15 text-amber-400 border-amber-500/20",
};

const SOURCE_LABELS: Record<Source, string> = {
  polymarket: "Polymarket",
  kalshi: "Kalshi",
  manifold: "Manifold",
  predictit: "PredictIt",
};

function probColor(p: number) {
  if (p >= 70) return "text-emerald-400";
  if (p >= 40) return "text-amber-400";
  return "text-red-400";
}

function probBarColor(p: number) {
  if (p >= 70) return "bg-emerald-500";
  if (p >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function fmtVol(n: number) {
  if (!n) return "—";
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function daysLeft(endDate: string | null) {
  if (!endDate) return null;
  const d = new Date(endDate).getTime() - Date.now();
  if (d < 0) return null;
  return Math.ceil(d / 86400000);
}

function useTracked() {
  const [tracked, setTracked] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("predict_tracked");
      if (saved) setTracked(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);
  const toggle = useCallback((id: string) => {
    setTracked((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem("predict_tracked", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);
  return { tracked, toggle };
}

// ─── SourceBadge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: Source }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${SOURCE_COLORS[source]}`}>
      {SOURCE_LABELS[source]}
    </span>
  );
}

// ─── ProbBar ─────────────────────────────────────────────────────────────────

function ProbBar({ prob }: { prob: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
      <div
        className={`h-full rounded-full ${probBarColor(prob)}`}
        style={{ width: `${prob}%` }}
      />
    </div>
  );
}

// ─── Stats Bar ───────────────────────────────────────────────────────────────

function StatsBar({ data }: { data: MarketsData | null }) {
  if (!data) return null;
  const { markets } = data;
  const totalVol = markets.reduce((s, m) => s + m.volume, 0);
  const catCounts: Record<string, number> = {};
  markets.forEach((m) => { catCounts[m.category] = (catCounts[m.category] ?? 0) + 1; });
  const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  const bigMover = [...markets].sort((a, b) => Math.abs(b.probability - 50) - Math.abs(a.probability - 50))[0];

  const stats = [
    { label: "Markets Tracked", value: markets.length.toString(), sub: "across all platforms" },
    { label: "24h Volume", value: fmtVol(totalVol), sub: "combined" },
    { label: "Top Category", value: topCat.charAt(0).toUpperCase() + topCat.slice(1), sub: `${catCounts[topCat] ?? 0} markets` },
    { label: "Highest Conviction", value: bigMover ? `${bigMover.probability}%` : "—", sub: bigMover ? bigMover.question.slice(0, 28) + "…" : "" },
  ];

  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-xl border border-white/5 bg-[#050713] px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">{s.label}</p>
          <p className="mt-0.5 text-sm font-semibold text-zinc-100">{s.value}</p>
          <p className="truncate text-[10px] text-zinc-600">{s.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Expanded Card ───────────────────────────────────────────────────────────

interface HistoryPoint { t: number; p: number }

function ExpandedCard({
  market,
  onClose,
  onAnalyze,
}: {
  market: PredictMarket;
  onClose: () => void;
  onAnalyze: (m: PredictMarket) => void;
}) {
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (market.source !== "polymarket") return;
    const rawId = market.id.replace("polymarket-", "");
    setLoadingHistory(true);
    fetch(`https://gamma-api.polymarket.com/markets/${rawId}/history`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const pts: HistoryPoint[] = Array.isArray(d)
          ? d.map((x: { t?: number; timestamp?: number; p?: number; price?: number }) => ({
              t: x.t ?? x.timestamp ?? 0,
              p: Math.round((x.p ?? x.price ?? 0) * 100),
            }))
          : [];
        setHistory(pts.filter((x) => x.t && x.p != null));
      })
      .catch(() => { /* no history */ })
      .finally(() => setLoadingHistory(false));
  }, [market]);

  const chartData = history.map((h) => ({
    date: new Date(h.t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    prob: h.p,
  }));

  return (
    <div className="col-span-full mt-1 rounded-2xl border border-[var(--accent-color)]/20 bg-[#050713] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <SourceBadge source={market.source} />
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">{market.category}</span>
          </div>
          <p className="text-sm font-medium text-zinc-100">{market.question}</p>
        </div>
        <button onClick={onClose} className="flex-shrink-0 text-zinc-600 hover:text-zinc-300">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { l: "YES", v: `${market.yesPrice}%`, c: probColor(market.yesPrice) },
          { l: "NO", v: `${market.noPrice}%`, c: "text-zinc-300" },
          { l: "Volume", v: fmtVol(market.volume), c: "text-zinc-300" },
          { l: "Days Left", v: daysLeft(market.endDate) != null ? `${daysLeft(market.endDate)}d` : "—", c: "text-zinc-300" },
        ].map((s) => (
          <div key={s.l} className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center">
            <p className="text-[10px] text-zinc-500">{s.l}</p>
            <p className={`text-lg font-bold ${s.c}`}>{s.v}</p>
          </div>
        ))}
      </div>

      {market.source === "polymarket" && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Probability History</p>
          {loadingHistory ? (
            <div className="h-24 animate-pulse rounded-xl bg-white/5" />
          ) : chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={chartData}>
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#71717a" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#71717a" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={{ background: "#0a0b14", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 11 }}
                  formatter={(v) => [`${v}%`, "Probability"]}
                />
                <ReferenceLine y={50} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="prob" stroke="var(--accent-color)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-zinc-600">No history data available for this market.</p>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={market.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-white/[0.08]"
        >
          Open on {SOURCE_LABELS[market.source]} ↗
        </a>
        <button
          onClick={() => onAnalyze(market)}
          className="rounded-lg border border-[var(--accent-color)]/30 bg-[var(--accent-color)]/10 px-3 py-1.5 text-xs text-[var(--accent-color)] transition-colors hover:bg-[var(--accent-color)]/20"
        >
          Analyze with AI
        </button>
      </div>
    </div>
  );
}

// ─── Market Card ─────────────────────────────────────────────────────────────

function MarketCard({
  market,
  expanded,
  onToggle,
  onAnalyze,
  tracked,
  onTrack,
}: {
  market: PredictMarket;
  expanded: boolean;
  onToggle: () => void;
  onAnalyze: (m: PredictMarket) => void;
  tracked: boolean;
  onTrack: () => void;
}) {
  const days = daysLeft(market.endDate);

  return (
    <div className={`rounded-2xl border bg-[#050713] transition-colors ${expanded ? "border-[var(--accent-color)]/30" : "border-white/10 hover:border-white/20"}`}>
      <div className="cursor-pointer p-4" onClick={onToggle}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <SourceBadge source={market.source} />
          {days != null && (
            <span className={`flex-shrink-0 text-[10px] font-medium ${days <= 7 ? "text-amber-400" : "text-zinc-500"}`}>
              {days}d left
            </span>
          )}
        </div>
        <p className="mb-3 line-clamp-2 text-sm font-medium leading-snug text-zinc-200">{market.question}</p>
        <div className="mb-2 flex items-baseline gap-2">
          <span className={`text-2xl font-bold tabular-nums ${probColor(market.probability)}`}>
            {market.probability}%
          </span>
          <span className="text-xs text-zinc-500">YES</span>
          <span className="ml-auto text-xs text-zinc-600">{100 - market.probability}% NO</span>
        </div>
        <ProbBar prob={market.probability} />
        <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-600">
          <span>Vol {fmtVol(market.volume)}</span>
          <span>Liq {fmtVol(market.liquidity)}</span>
        </div>
      </div>
      <div className="flex border-t border-white/5">
        <button
          onClick={() => onAnalyze(market)}
          className="flex-1 rounded-bl-2xl py-2 text-[10px] font-medium text-zinc-600 transition-colors hover:bg-white/[0.03] hover:text-zinc-300"
        >
          AI Analyze
        </button>
        <div className="w-px bg-white/5" />
        <button
          onClick={(e) => { e.stopPropagation(); onTrack(); }}
          className={`flex-1 rounded-br-2xl py-2 text-[10px] font-medium transition-colors ${
            tracked
              ? "bg-[var(--accent-color)]/5 text-[var(--accent-color)]"
              : "text-zinc-600 hover:bg-white/[0.03] hover:text-zinc-300"
          }`}
        >
          {tracked ? "Tracking ✓" : "Track"}
        </button>
      </div>
    </div>
  );
}

// ─── Markets Grid ─────────────────────────────────────────────────────────────

function MarketsGrid({
  markets,
  tracked,
  onTrack,
  onAnalyze,
}: {
  markets: PredictMarket[];
  tracked: string[];
  onTrack: (id: string) => void;
  onAnalyze: (m: PredictMarket) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState<"all" | Source>("all");
  const [sort, setSort] = useState<SortKey>("volume");

  const filtered = useMemo(() => {
    let list = markets;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((m) => m.question.toLowerCase().includes(q));
    }
    if (platform !== "all") list = list.filter((m) => m.source === platform);
    return [...list].sort((a, b) => {
      if (sort === "volume") return b.volume - a.volume;
      if (sort === "liquidity") return b.liquidity - a.liquidity;
      if (sort === "probability") return b.probability - a.probability;
      if (sort === "endDate") {
        const da = a.endDate ? new Date(a.endDate).getTime() : Infinity;
        const db = b.endDate ? new Date(b.endDate).getTime() : Infinity;
        return da - db;
      }
      return 0;
    });
  }, [markets, search, platform, sort]);

  const btnBase = "rounded-lg px-2.5 py-1 text-[10px] font-medium transition-colors";
  const btnActive = "bg-[var(--accent-color)]/15 text-[var(--accent-color)]";
  const btnInactive = "text-zinc-500 hover:text-zinc-300";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search markets…"
          className="w-full max-w-xs rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-[var(--accent-color)]/40"
        />
        <div className="flex flex-wrap gap-1 rounded-lg border border-white/5 bg-white/[0.02] p-0.5">
          {(["all", "polymarket", "kalshi", "manifold", "predictit"] as const).map((p) => (
            <button key={p} onClick={() => setPlatform(p)} className={`${btnBase} ${platform === p ? btnActive : btnInactive}`}>
              {p === "all" ? "All" : SOURCE_LABELS[p]}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg border border-white/5 bg-white/[0.02] p-0.5">
          {(["volume", "liquidity", "probability", "endDate"] as SortKey[]).map((s) => (
            <button key={s} onClick={() => setSort(s)} className={`${btnBase} ${sort === s ? btnActive : btnInactive}`}>
              {s === "endDate" ? "Expiry" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-[#050713] p-12 text-center text-sm text-zinc-600">
          No markets found.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((m) => (
            <React.Fragment key={m.id}>
              <MarketCard
                market={m}
                expanded={expandedId === m.id}
                onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)}
                onAnalyze={onAnalyze}
                tracked={tracked.includes(m.id)}
                onTrack={() => onTrack(m.id)}
              />
              {expandedId === m.id && (
                <ExpandedCard
                  market={m}
                  onClose={() => setExpandedId(null)}
                  onAnalyze={onAnalyze}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Arbitrage Tab ────────────────────────────────────────────────────────────

function ArbitrageTab() {
  const [data, setData] = useState<{ opportunities: ArbOpp[]; roundIssues: RoundIssue[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/predict/arbitrage")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-96 animate-pulse rounded-2xl bg-white/5" />;

  const opps = data?.opportunities ?? [];
  const rounds = data?.roundIssues ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
        <p className="text-xs font-semibold text-amber-400">How Arbitrage Works</p>
        <p className="mt-1 text-xs text-zinc-400">
          When the same event is priced differently across platforms, buy YES on the cheaper platform and NO on the more expensive one. If the combined cost is under 100¢, you lock in a guaranteed profit regardless of outcome. Gaps typically close within hours.
        </p>
      </div>

      <div>
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Cross-Platform Discrepancies</p>
        {opps.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-[#050713] p-8 text-center text-sm text-zinc-600">
            No significant cross-platform discrepancies detected right now.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/5">
            <table className="w-full min-w-[600px]">
              <thead className="border-b border-white/5 bg-white/[0.02]">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Question</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Buy YES</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Buy NO</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Spread</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Profit</th>
                </tr>
              </thead>
              <tbody>
                {opps.map((o, i) => {
                  const spreadColor = o.spread >= 5 ? "text-red-400" : o.spread >= 2 ? "text-amber-400" : "text-zinc-400";
                  return (
                    <tr key={i} className={`border-b border-white/[0.03] hover:bg-white/[0.02] ${o.potentialProfit > 0 ? "" : ""}`}>
                      <td className="max-w-xs px-3 py-2">
                        <span className="line-clamp-2 text-xs text-zinc-200">{o.question}</span>
                        {o.potentialProfit > 0 && (
                          <span className="mt-1 inline-block rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">⚡ Risk-free</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <SourceBadge source={o.sourceA} />
                        <p className="mt-1 text-xs font-medium text-emerald-400">{o.priceA}¢</p>
                        <a href={o.urlA} target="_blank" rel="noopener noreferrer" className="text-[10px] text-zinc-600 hover:text-zinc-400">View ↗</a>
                      </td>
                      <td className="px-3 py-2">
                        <SourceBadge source={o.sourceB} />
                        <p className="mt-1 text-xs font-medium text-red-400">{100 - o.priceB}¢</p>
                        <a href={o.urlB} target="_blank" rel="noopener noreferrer" className="text-[10px] text-zinc-600 hover:text-zinc-400">View ↗</a>
                      </td>
                      <td className={`px-3 py-2 text-sm font-bold tabular-nums ${spreadColor}`}>{o.spread}%</td>
                      <td className={`px-3 py-2 text-xs font-medium ${o.potentialProfit > 0 ? "text-emerald-400" : "text-zinc-500"}`}>
                        {o.potentialProfit > 0 ? `+${o.potentialProfit.toFixed(1)}¢` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rounds.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Round Anomalies — YES + NO ≠ 100%</p>
          <div className="overflow-x-auto rounded-2xl border border-white/5">
            <table className="w-full min-w-[500px]">
              <thead className="border-b border-white/5 bg-white/[0.02]">
                <tr>
                  {["Question", "Platform", "YES", "NO", "Total", "Type"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rounds.map((r) => (
                  <tr key={r.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="max-w-xs px-3 py-2">
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="line-clamp-1 text-xs text-zinc-200 hover:text-zinc-100">{r.question}</a>
                    </td>
                    <td className="px-3 py-2"><SourceBadge source={r.source} /></td>
                    <td className="px-3 py-2 text-xs text-zinc-300">{r.yesPrice}%</td>
                    <td className="px-3 py-2 text-xs text-zinc-300">{r.noPrice}%</td>
                    <td className={`px-3 py-2 text-xs font-medium ${r.type === "under" ? "text-emerald-400" : "text-red-400"}`}>{r.total}%</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${r.type === "under" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                        {r.type === "under" ? "Under-round" : "Over-round"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-zinc-600">Under-round (total &lt;100%): potentially profitable regardless of outcome (minus fees). Over-round: vig — the house wins in aggregate.</p>
        </div>
      )}
    </div>
  );
}

// ─── AI Analysis Tab ──────────────────────────────────────────────────────────

function AITab({ prefillMarket }: { prefillMarket: PredictMarket | null }) {
  const [question, setQuestion] = useState(prefillMarket?.question ?? "");
  const [currentProb, setCurrentProb] = useState(prefillMarket ? String(prefillMarket.probability) : "");
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  const [scanning, setScanning] = useState(false);
  const [mispricings, setMispricings] = useState<Mispricing[]>([]);
  const [scanError, setScanError] = useState("");

  // Auto-run if prefilled from market card
  useEffect(() => {
    if (prefillMarket) {
      setQuestion(prefillMarket.question);
      setCurrentProb(String(prefillMarket.probability));
    }
  }, [prefillMarket]);

  const runAnalysis = useCallback(async () => {
    if (!question.trim()) return;
    setLoadingAnalysis(true);
    setAnalysisError("");
    setAnalysis(null);
    try {
      const res = await fetch("/api/predict/ai-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: question.trim(), currentProbability: currentProb ? parseFloat(currentProb) : null }),
      });
      const d = await res.json();
      if (d.error) { setAnalysisError(d.error); return; }
      setAnalysis(d);
    } catch { setAnalysisError("Request failed"); }
    finally { setLoadingAnalysis(false); }
  }, [question, currentProb]);

  const runScan = useCallback(async () => {
    setScanning(true);
    setScanError("");
    setMispricings([]);
    try {
      const res = await fetch("/api/predict/ai-analysis");
      const d = await res.json();
      if (d.error) { setScanError(d.error); return; }
      setMispricings(d.mispricings ?? []);
    } catch { setScanError("Scan failed"); }
    finally { setScanning(false); }
  }, []);

  const confColor = (c?: string) =>
    c === "high" ? "text-emerald-400" : c === "medium" ? "text-amber-400" : "text-red-400";

  return (
    <div className="space-y-6">
      {/* Probability Scanner */}
      <div className="rounded-2xl border border-white/10 bg-[#050713] p-4">
        <p className="mb-1 text-sm font-semibold text-zinc-100">Probability Scanner</p>
        <p className="mb-4 text-xs text-zinc-500">Ask Claude to estimate a fair probability and analyze key factors for any question.</p>
        <div className="space-y-3">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder='e.g. "Will the Fed cut rates in September 2025?"'
            rows={3}
            className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-[var(--accent-color)]/40"
          />
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={currentProb}
              onChange={(e) => setCurrentProb(e.target.value)}
              placeholder="Current market % (optional)"
              type="number"
              min="0"
              max="100"
              className="max-w-[180px] rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-[var(--accent-color)]/40"
            />
            <button
              onClick={runAnalysis}
              disabled={!question.trim() || loadingAnalysis}
              className="rounded-xl bg-[var(--accent-color)] px-4 py-2 text-xs font-semibold text-black transition-opacity disabled:opacity-40 hover:opacity-90"
            >
              {loadingAnalysis ? "Analyzing…" : "Analyze"}
            </button>
          </div>
        </div>

        {analysisError && <p className="mt-3 text-xs text-red-400">{analysisError}</p>}

        {analysis && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-center">
                <p className="text-[10px] text-zinc-500">Fair Value</p>
                <p className={`text-2xl font-bold ${probColor(analysis.fairValue ?? 50)}`}>
                  {analysis.fairValue != null ? `${analysis.fairValue}%` : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-center">
                <p className="text-[10px] text-zinc-500">Confidence</p>
                <p className={`text-sm font-semibold capitalize ${confColor(analysis.confidence)}`}>{analysis.confidence ?? "—"}</p>
              </div>
              {analysis.mispricing != null && (
                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-center">
                  <p className="text-[10px] text-zinc-500">vs Market</p>
                  <p className={`text-sm font-semibold ${analysis.mispricing > 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {analysis.mispricing > 0 ? "+" : ""}{analysis.mispricing.toFixed(1)}%
                  </p>
                </div>
              )}
            </div>

            <p className="text-sm text-zinc-300">{analysis.summary}</p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-3">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-emerald-500">Bullish Factors</p>
                <ul className="space-y-1">
                  {(analysis.bullishFactors ?? []).map((f, i) => <li key={i} className="text-xs text-zinc-300">• {f}</li>)}
                </ul>
              </div>
              <div className="rounded-xl border border-red-500/10 bg-red-500/5 p-3">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-red-500">Bearish Factors</p>
                <ul className="space-y-1">
                  {(analysis.bearishFactors ?? []).map((f, i) => <li key={i} className="text-xs text-zinc-300">• {f}</li>)}
                </ul>
              </div>
            </div>

            {analysis.baseRate && (
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">Historical Base Rate</p>
                <p className="text-xs text-zinc-400">{analysis.baseRate}</p>
              </div>
            )}
            {analysis.keyRisks && (
              <div className="rounded-xl border border-amber-500/10 bg-amber-500/5 p-3">
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-amber-500">Key Risks</p>
                <p className="text-xs text-zinc-400">{analysis.keyRisks}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mispricing Scanner */}
      <div className="rounded-2xl border border-white/10 bg-[#050713] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-zinc-100">Market Inefficiency Finder</p>
            <p className="mt-1 text-xs text-zinc-500">Scans active markets and flags those where current probability seems off based on available information.</p>
          </div>
          <button
            onClick={runScan}
            disabled={scanning}
            className="flex-shrink-0 rounded-xl border border-[var(--accent-color)]/30 bg-[var(--accent-color)]/10 px-4 py-2 text-xs font-semibold text-[var(--accent-color)] transition-colors disabled:opacity-40 hover:bg-[var(--accent-color)]/20"
          >
            {scanning ? "Scanning…" : "Scan Markets"}
          </button>
        </div>

        {scanError && <p className="mt-3 text-xs text-red-400">{scanError}</p>}

        {mispricings.length > 0 && (
          <div className="mt-4 space-y-3">
            {mispricings.map((m, i) => (
              <div key={i} className={`rounded-xl border p-3 ${m.direction === "underpriced" ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                <div className="mb-1 flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-zinc-200">{m.question}</p>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${m.direction === "underpriced" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                      {m.direction === "underpriced" ? "Underpriced" : "Overpriced"}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      Market: {m.currentProbability}% → Fair: {m.fairValue}%
                    </span>
                  </div>
                </div>
                <p className="text-xs text-zinc-400">{m.reasoning}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tracked Panel ───────────────────────────────────────────────────────────

function TrackedPanel({ markets, tracked, onUntrack }: { markets: PredictMarket[]; tracked: string[]; onUntrack: (id: string) => void }) {
  const trackedMarkets = markets.filter((m) => tracked.includes(m.id));
  if (!trackedMarkets.length) return null;

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-[#050713] p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">My Tracked Markets ({trackedMarkets.length})</p>
      <div className="space-y-2">
        {trackedMarkets.map((m) => {
          const days = daysLeft(m.endDate);
          return (
            <div key={m.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-2">
              <SourceBadge source={m.source} />
              <p className="flex-1 truncate text-xs text-zinc-300">{m.question}</p>
              <span className={`text-sm font-bold tabular-nums ${probColor(m.probability)}`}>{m.probability}%</span>
              {days != null && <span className="text-[10px] text-zinc-600">{days}d</span>}
              <button onClick={() => onUntrack(m.id)} className="text-zinc-700 hover:text-zinc-400 text-sm">×</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Recently Resolved ────────────────────────────────────────────────────────

function ResolvedFeed({ resolved }: { resolved: (PredictMarket & { resolution?: string })[] }) {
  if (!resolved.length) return null;
  return (
    <div className="mt-6">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Recently Resolved</p>
      <div className="space-y-2">
        {resolved.map((m) => {
          const resolvedYes = m.resolution === "YES";
          return (
            <div key={m.id} className={`flex items-center gap-3 rounded-xl border p-2.5 ${resolvedYes ? "border-emerald-500/15 bg-emerald-500/5" : "border-red-500/15 bg-red-500/5"}`}>
              <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${resolvedYes ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                {m.resolution ?? "?"}
              </span>
              <p className="flex-1 truncate text-xs text-zinc-300">{m.question}</p>
              <span className="text-[10px] text-zinc-600">final {m.probability}%</span>
              <SourceBadge source={m.source} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "All Markets" },
  { id: "political", label: "Political" },
  { id: "crypto", label: "Crypto" },
  { id: "economics", label: "Economics" },
  { id: "sports", label: "Sports" },
  { id: "arbitrage", label: "Arbitrage" },
  { id: "ai", label: "AI Analysis" },
];

const MARKET_TABS: TabId[] = ["all", "political", "crypto", "economics", "sports"];

export default function PredictView() {
  const [tab, setTab] = useState<TabId>("all");
  const [data, setData] = useState<MarketsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiMarket, setAiMarket] = useState<PredictMarket | null>(null);
  const { tracked, toggle: toggleTracked } = useTracked();

  useEffect(() => {
    fetch("/api/predict/markets")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleAnalyze = useCallback((m: PredictMarket) => {
    setAiMarket(m);
    setTab("ai");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const filteredMarkets = useMemo(() => {
    if (!data) return [];
    if (tab === "all") return data.markets;
    return data.markets.filter((m) => m.category === tab);
  }, [data, tab]);

  return (
    <div>
      <StatsBar data={data} />

      {/* Tab bar */}
      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-white/5 bg-white/[0.02] p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t.id
                ? "bg-[var(--accent-color)]/15 text-[var(--accent-color)]"
                : t.id === "arbitrage"
                ? "border border-amber-500/20 text-amber-500/80 hover:text-amber-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "arbitrage" && <ArbitrageTab />}

      {tab === "ai" && <AITab prefillMarket={aiMarket} />}

      {MARKET_TABS.includes(tab) && (
        loading ? (
          <div className="h-96 animate-pulse rounded-2xl bg-white/5" />
        ) : (
          <MarketsGrid
            markets={filteredMarkets}
            tracked={tracked}
            onTrack={toggleTracked}
            onAnalyze={handleAnalyze}
          />
        )
      )}

      {data && (
        <>
          <TrackedPanel markets={data.markets} tracked={tracked} onUntrack={toggleTracked} />
          <ResolvedFeed resolved={data.recentlyResolved} />
        </>
      )}
    </div>
  );
}
