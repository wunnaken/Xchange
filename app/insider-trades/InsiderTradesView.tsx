"use client";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { LegislatorEntry } from "../api/legislators/route";

// ─── Types ────────────────────────────────────────────────────────────────────

type Party = "D" | "R" | "I";

type CongressTrade = {
  id: string;
  politician: string;
  bioguideId: string;
  party: Party;
  state: string;
  chamber: "House" | "Senate";
  ticker: string;
  company: string;
  transaction: string;
  amountRange: string;
  tradeDate: string;
  disclosedDate: string;
  daysToDisclose: number;
  excessReturn: number | null;
  priceChange: number | null;
  committee?: string;
  isNotable?: boolean;
};

type StatFilter = "all" | "notable" | "purchases" | "delay" | "ticker";
type ReturnRange = "3m" | "6m" | "ytd" | "1y" | "all";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PARTY_BG: Record<Party, string> = { D: "#3B82F6", R: "#EF4444", I: "#8B5CF6" };

function PartyBadge({ party }: { party: Party }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white"
      style={{ backgroundColor: PARTY_BG[party] }}
    >
      {party}
    </span>
  );
}

function fmtDate(d: string) {
  if (!d) return "–";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

function fmtDollars(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function parseRangeMidpoint(range: string): number {
  const nums = range.replace(/\$|,|\+/g, "").match(/\d+/g)?.map(Number) ?? [];
  if (nums.length >= 2) return (nums[0] + nums[1]) / 2;
  if (nums.length === 1) return nums[0] * 1.5; // "X+" ranges
  return 0;
}

function bioPhoto(id: string) {
  if (!id) return null;
  return `https://bioguide.congress.gov/bioguide/photo/${id[0]}/${id}.jpg`;
}

// ─── Politician Modal ─────────────────────────────────────────────────────────

type PolProfile = {
  name: string;
  bioguideId: string;
  party: Party;
  chamber: string;
  state: string;
  trades: CongressTrade[];
};

function PoliticianModal({ profile, onClose }: { profile: PolProfile; onClose: () => void }) {
  const [range, setRange] = useState<ReturnRange>("all");

  const now = Date.now();
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();

  const cutoffMs: Record<ReturnRange, number> = {
    "3m": now - 90 * 86400000,
    "6m": now - 180 * 86400000,
    "ytd": yearStart,
    "1y": now - 365 * 86400000,
    "all": 0,
  };

  const chartData = useMemo(() => {
    const cutoff = cutoffMs[range];
    const sorted = profile.trades
      .filter((t) => new Date(t.tradeDate).getTime() >= cutoff && t.priceChange != null)
      .sort((a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime());

    // Cumulative return — both lines start at 0
    let polCum = 0;
    let spyCum = 0;
    const points: { date: string; politician: number; spy: number }[] = [{ date: "Start", politician: 0, spy: 0 }];
    for (const t of sorted) {
      polCum += t.priceChange ?? 0;
      spyCum += (t.priceChange ?? 0) - (t.excessReturn ?? 0);
      points.push({
        date: fmtDate(t.tradeDate),
        politician: parseFloat(polCum.toFixed(2)),
        spy: parseFloat(spyCum.toFixed(2)),
      });
    }
    return points;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.trades, range]);

  const tradeCount = chartData.length - 1; // subtract the "Start" baseline point
  const avgExcess = tradeCount > 0
    ? (profile.trades
        .filter((t) => new Date(t.tradeDate).getTime() >= cutoffMs[range] && t.excessReturn != null)
        .reduce((a, t) => a + (t.excessReturn ?? 0), 0) / tradeCount
      ).toFixed(1)
    : "0";

  const totalBuys = profile.trades.filter((t) => t.transaction === "Purchase").length;
  const totalSells = profile.trades.length - totalBuys;
  const photo = bioPhoto(profile.bioguideId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0A0F1A] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-4">
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt={profile.name}
              className="h-16 w-16 shrink-0 rounded-xl object-cover border border-white/10"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-zinc-100">{profile.name}</h2>
              <PartyBadge party={profile.party} />
              <span className="text-[10px] text-zinc-500">{profile.chamber} · {profile.state}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-500">
              <span><span className="text-zinc-300 font-medium">{profile.trades.length}</span> total trades</span>
              <span><span className="text-emerald-400 font-medium">{totalBuys}</span> buys</span>
              <span><span className="text-red-400 font-medium">{totalSells}</span> sells</span>
              <span>
                Avg excess:{" "}
                <span className={parseFloat(avgExcess) >= 0 ? "text-emerald-400 font-medium" : "text-red-400 font-medium"}>
                  {parseFloat(avgExcess) >= 0 ? "+" : ""}{avgExcess}%
                </span>
              </span>
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-200 transition-colors">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Range selector */}
        <div className="mt-4 flex gap-1 flex-wrap">
          {(["3m", "6m", "ytd", "1y", "all"] as ReturnRange[]).map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                range === r ? "bg-[var(--accent-color)] text-[#020308]" : "border border-white/10 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {r === "ytd" ? "YTD" : r === "all" ? "All" : r.toUpperCase()}
            </button>
          ))}
          <span className="ml-auto self-center text-[10px] text-zinc-600">
            {tradeCount} trade{tradeCount !== 1 ? "s" : ""} shown
          </span>
        </div>

        {/* Cumulative return line chart: politician vs S&P 500 */}
        <div className="mt-3 rounded-xl border border-white/10 bg-[#060B14] p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-4 text-[10px]">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded" style={{ backgroundColor: "var(--accent-color)" }} />
                {profile.name.split(" ").pop()} (cumulative)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-px w-4 border-t-2 border-dashed border-zinc-500" />
                S&amp;P 500
              </span>
            </div>
            <span className="text-[10px] text-zinc-600">cumulative return %</span>
          </div>
          {tradeCount === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-600">No trade data for this period</p>
          ) : (
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#52525b", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0F1520", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                  formatter={(val: unknown, name: unknown) => [`${val}%`, name === "politician" ? `${profile.name.split(" ").pop()} total` : "S&P 500 total"]}
                  labelStyle={{ color: "#71717a", marginBottom: 4 }}
                />
                <Line type="monotone" dataKey="politician" stroke="var(--accent-color)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--accent-color)", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="spy" stroke="#52525b" strokeWidth={1.5} strokeDasharray="5 3" dot={false} activeDot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Trade history */}
        <div className="mt-3 space-y-1.5">
          <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Trade history</p>
          <div className="max-h-44 overflow-y-auto space-y-1">
            {profile.trades
              .filter((t) => new Date(t.tradeDate).getTime() >= cutoffMs[range])
              .sort((a, b) => new Date(b.tradeDate).getTime() - new Date(a.tradeDate).getTime())
              .map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-1.5 text-xs">
                  <span className="font-bold text-zinc-200 w-12 shrink-0">{t.ticker}</span>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${t.transaction === "Purchase" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                    {t.transaction === "Purchase" ? "▲ Buy" : "▼ Sell"}
                  </span>
                  <span className="text-zinc-500 flex-1 truncate">{t.amountRange}</span>
                  <span className="text-zinc-600 shrink-0">{fmtDate(t.tradeDate)}</span>
                  {t.priceChange != null && (
                    <span className={`shrink-0 font-medium w-12 text-right ${t.priceChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {t.priceChange >= 0 ? "+" : ""}{t.priceChange.toFixed(1)}%
                    </span>
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Party Pie Chart ──────────────────────────────────────────────────────────

function PartyPieChart({
  legislators,
  traderBioguides,
  traderNames,
  ytdVolume,
}: {
  legislators: LegislatorEntry[];
  traderBioguides: Set<string>;
  traderNames: Set<string>;
  ytdVolume: number;
}) {
  const { data, traderCount } = useMemo(() => {
    const counts = { D_trader: 0, R_trader: 0, I_trader: 0, D_none: 0, R_none: 0, I_none: 0 };
    let tc = 0;
    for (const leg of legislators) {
      // Use bioguide-based match first, fall back to name
      const hasTrades = traderBioguides.has(leg.bioguide) || traderNames.has(leg.name);
      if (hasTrades) tc++;
      if (leg.party === "D") hasTrades ? counts.D_trader++ : counts.D_none++;
      else if (leg.party === "R") hasTrades ? counts.R_trader++ : counts.R_none++;
      else hasTrades ? counts.I_trader++ : counts.I_none++;
    }
    return {
      traderCount: tc,
      data: [
        { name: "Dem · trades", value: counts.D_trader, color: "#3B82F6" },
        { name: "Dem · no trades", value: counts.D_none, color: "#1D4ED8" },
        { name: "Rep · trades", value: counts.R_trader, color: "#EF4444" },
        { name: "Rep · no trades", value: counts.R_none, color: "#7F1D1D" },
        { name: "Ind", value: counts.I_trader + counts.I_none, color: "#8B5CF6" },
      ].filter((d) => d.value > 0),
    };
  }, [legislators, traderBioguides, traderNames]);

  const total = legislators.length;
  const pct = total ? ((traderCount / total) * 100).toFixed(0) : "0";

  return (
    <div className="rounded-xl border border-white/10 bg-[var(--app-card)] p-4 space-y-3">
      {/* YTD Volume tracker */}
      <div className="rounded-lg border border-[var(--accent-color)]/20 bg-[var(--accent-color)]/5 px-3 py-2">
        <p className="text-[9px] font-semibold uppercase tracking-widest text-[var(--accent-color)]/70">
          Congress trades {new Date().getFullYear()} YTD
        </p>
        <p className="mt-0.5 text-lg font-bold text-[var(--accent-color)]">
          {ytdVolume > 0 ? fmtDollars(ytdVolume) : "–"}
        </p>
        <p className="text-[9px] text-zinc-600">estimated total volume (range midpoints)</p>
      </div>

      {/* Pie chart */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Party Breakdown</p>
        <p className="mt-0.5 text-[10px] text-zinc-600">
          {traderCount} of {total} members ({pct}%) have disclosed trades
        </p>
        <ResponsiveContainer width="100%" height={150}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2} dataKey="value">
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} opacity={entry.name.includes("no trades") ? 0.3 : 0.9} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: "#0F1520", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-1.5 text-[10px] text-zinc-500">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: d.color, opacity: d.name.includes("no trades") ? 0.4 : 0.9 }} />
              <span className="truncate">{d.name}: {d.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InsiderTradesView() {
  const [activeTab, setActiveTab] = useState<"congress" | "corporate" | "cabinet">("congress");
  const [congressTrades, setCongressTrades] = useState<CongressTrade[]>([]);
  const [legislators, setLegislators] = useState<LegislatorEntry[]>([]);
  const [dataSource, setDataSource] = useState<"loading" | "live" | "error">("loading");
  const [dateRange, setDateRange] = useState<{ from: string; to: string } | null>(null);

  // Independent toggles — empty = show all
  const [showBuys, setShowBuys] = useState(false);
  const [showSells, setShowSells] = useState(false);
  const [showHouse, setShowHouse] = useState(false);
  const [showSenate, setShowSenate] = useState(false);

  const [search, setSearch] = useState("");
  const [statFilter, setStatFilter] = useState<StatFilter>("all");
  const [selectedPol, setSelectedPol] = useState<PolProfile | null>(null);

  const isAllActive = !showBuys && !showSells && !showHouse && !showSenate;

  function clearFilters() {
    setShowBuys(false); setShowSells(false); setShowHouse(false); setShowSenate(false);
  }

  useEffect(() => {
    fetch("/api/insider-trades/congress")
      .then((r) => r.json())
      .then((d: { trades: CongressTrade[]; source: string; dateRange: { from: string; to: string } | null }) => {
        setCongressTrades(d.trades ?? []);
        setDataSource(d.source === "live" ? "live" : "error");
        if (d.dateRange) setDateRange(d.dateRange);
      })
      .catch(() => setDataSource("error"));

    fetch("/api/legislators")
      .then((r) => r.json())
      .then((d: LegislatorEntry[]) => setLegislators(d ?? []))
      .catch(() => {});
  }, []);

  const traderMap = useMemo(() => {
    const map = new Map<string, CongressTrade[]>();
    for (const t of congressTrades) {
      if (!map.has(t.politician)) map.set(t.politician, []);
      map.get(t.politician)!.push(t);
    }
    return map;
  }, [congressTrades]);

  const traderNames = useMemo(() => new Set(traderMap.keys()), [traderMap]);

  // bioguide-based match for accurate pie chart counts
  const traderBioguides = useMemo(
    () => new Set(congressTrades.map((t) => t.bioguideId).filter(Boolean)),
    [congressTrades]
  );

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of congressTrades) counts[t.ticker] = (counts[t.ticker] ?? 0) + 1;
    const topTicker = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "–";
    const avgDays = congressTrades.length
      ? Math.round(congressTrades.reduce((a, t) => a + t.daysToDisclose, 0) / congressTrades.length)
      : 0;
    return {
      total: congressTrades.length,
      notable: congressTrades.filter((t) => t.isNotable).length,
      buys: congressTrades.filter((t) => t.transaction === "Purchase").length,
      avgDays,
      topTicker,
    };
  }, [congressTrades]);

  const ytdVolume = useMemo(() => {
    const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
    return congressTrades
      .filter((t) => new Date(t.tradeDate).getTime() >= yearStart)
      .reduce((sum, t) => sum + parseRangeMidpoint(t.amountRange), 0);
  }, [congressTrades]);

  // Merged search results: traders first (sorted by trade count), non-traders last
  const searchUnified = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();

    // Find matching trader names
    const matchedTraderNames = new Set(
      congressTrades
        .filter(
          (t) =>
            t.politician.toLowerCase().includes(q) ||
            t.ticker.toLowerCase().includes(q) ||
            t.company.toLowerCase().includes(q)
        )
        .map((t) => t.politician)
    );

    // Find matching legislators with no trades
    const noTradeLegs = legislators.filter(
      (l) =>
        !traderBioguides.has(l.bioguide) &&
        !traderNames.has(l.name) &&
        l.name.toLowerCase().includes(q)
    );

    return { matchedTraderNames, noTradeLegs };
  }, [search, congressTrades, legislators, traderNames, traderBioguides]);

  const filtered = useMemo(() => {
    let t = congressTrades;

    // If searching, scope to matched trader names only
    if (searchUnified) {
      t = t.filter((x) => searchUnified.matchedTraderNames.has(x.politician));
    }

    // Stat panel filter
    if (statFilter === "notable") t = t.filter((x) => x.isNotable);
    else if (statFilter === "purchases") t = t.filter((x) => x.transaction === "Purchase");
    else if (statFilter === "delay") t = [...t].sort((a, b) => b.daysToDisclose - a.daysToDisclose);
    else if (statFilter === "ticker") t = t.filter((x) => x.ticker === stats.topTicker);

    // Combinable tx + chamber filters
    if (showBuys || showSells) {
      t = t.filter((x) =>
        (showBuys && x.transaction === "Purchase") ||
        (showSells && x.transaction.startsWith("Sale"))
      );
    }
    if (showHouse || showSenate) {
      t = t.filter((x) => (showHouse && x.chamber === "House") || (showSenate && x.chamber === "Senate"));
    }

    return t;
  }, [congressTrades, searchUnified, showBuys, showSells, showHouse, showSenate, statFilter, stats.topTicker]);

  const leaderboard = useMemo(() => {
    return Array.from(traderMap.entries())
      .map(([name, trades]) => {
        const first = trades[0];
        const counts: Record<string, number> = {};
        for (const tr of trades) counts[tr.ticker] = (counts[tr.ticker] ?? 0) + 1;
        const topTicker = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "–";
        return {
          name, party: first.party, state: first.state, chamber: first.chamber,
          bioguideId: first.bioguideId, trades, tradeCount: trades.length, topTicker,
        };
      })
      .sort((a, b) => b.tradeCount - a.tradeCount)
      .slice(0, 12);
  }, [traderMap]);

  const allTimeMostReturn = useMemo(() => {
    return Array.from(traderMap.entries())
      .map(([name, trades]) => {
        const first = trades[0];
        const withData = trades.filter((t) => t.excessReturn != null);
        if (!withData.length) return null;
        const avgExcess = withData.reduce((a, t) => a + (t.excessReturn ?? 0), 0) / withData.length;
        return { name, party: first.party, bioguideId: first.bioguideId, chamber: first.chamber, state: first.state, trades, avgExcess };
      })
      .filter(Boolean)
      .sort((a, b) => b!.avgExcess - a!.avgExcess)
      .slice(0, 5) as Array<{ name: string; party: Party; bioguideId: string; chamber: string; state: string; trades: CongressTrade[]; avgExcess: number }>;
  }, [traderMap]);

  const tickerChart = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of congressTrades) counts[t.ticker] = (counts[t.ticker] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([ticker, count]) => ({ ticker, count }));
  }, [congressTrades]);

  const monthChart = useMemo(() => {
    const months: Record<string, { buys: number; sells: number }> = {};
    for (const t of congressTrades) {
      const m = t.tradeDate.slice(0, 7);
      if (!months[m]) months[m] = { buys: 0, sells: 0 };
      if (t.transaction === "Purchase") months[m].buys++;
      else months[m].sells++;
    }
    return Object.entries(months)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([m, d]) => ({ month: m.slice(2), ...d }));
  }, [congressTrades]);

  const statPanels = [
    { key: "all" as StatFilter, label: "Total Disclosed", value: stats.total, active: statFilter === "all" },
    { key: "notable" as StatFilter, label: "Notable Trades", value: stats.notable, active: statFilter === "notable", amber: true },
    { key: "purchases" as StatFilter, label: "Purchases", value: stats.buys, active: statFilter === "purchases" },
    { key: "delay" as StatFilter, label: "Avg Delay", value: dataSource === "loading" ? "–" : `${stats.avgDays}d`, active: statFilter === "delay" },
    { key: "ticker" as StatFilter, label: "Most Traded", value: dataSource === "loading" ? "–" : stats.topTicker, active: statFilter === "ticker" },
  ];

  function openPol(name: string, bioguideId: string, party: Party, chamber: string, state: string, trades: CongressTrade[]) {
    setSelectedPol({ name, bioguideId, party, chamber, state, trades });
  }

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {statPanels.map((s) => (
          <button key={s.key} type="button"
            onClick={() => setStatFilter(s.active ? "all" : s.key)}
            className={`rounded-xl border p-3 text-left transition-all ${
              s.active ? "border-[var(--accent-color)]/60 bg-[var(--accent-color)]/10" : "border-white/10 bg-[var(--app-card)] hover:border-white/20"
            }`}
          >
            <p className="text-[10px] text-zinc-500">{s.label}</p>
            <p className={`mt-0.5 text-lg font-semibold ${s.active ? "text-[var(--accent-color)]" : s.amber && (s.value as number) > 0 ? "text-amber-400" : "text-zinc-100"}`}>
              {s.value}
            </p>
          </button>
        ))}
      </div>

      {/* Status bar */}
      {dataSource === "loading" && (
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[var(--app-card)] px-3 py-2 text-xs text-zinc-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-600" />
          Loading congressional trade data…
        </div>
      )}
      {dataSource === "error" && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">
          <svg className="h-3.5 w-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Could not load trade data — disclosure APIs may be temporarily unavailable.
        </div>
      )}
      {dataSource === "live" && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-400">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live STOCK Act filings — House &amp; Senate disclosures
          </div>
          {dateRange && (
            <span className="text-emerald-400/70 shrink-0">
              {fmtDate(dateRange.from)} — {fmtDate(dateRange.to)} · {congressTrades.length} trades
            </span>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-white/10 bg-[var(--app-card)] p-1">
        {(["congress", "corporate", "cabinet"] as const).map((tab) => (
          <button key={tab} type="button" onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
              activeTab === tab ? "bg-[var(--accent-color)] text-[#020308]" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {tab === "congress" ? "Congress" : tab === "corporate" ? "Corporate" : "Cabinet"}
          </button>
        ))}
      </div>

      {/* ── Congress Tab ── */}
      {activeTab === "congress" && (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Trade feed */}
            <div className="space-y-3 lg:col-span-2">
              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Search any member, ticker…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="min-w-[160px] flex-1 rounded-lg border border-white/10 bg-[var(--app-card)] px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[var(--accent-color)]/50"
                />
                {/* All clears everything */}
                <button
                  type="button"
                  onClick={clearFilters}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    isAllActive ? "bg-[var(--accent-color)] text-[#020308]" : "border border-white/10 bg-[var(--app-card)] text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  All
                </button>
                <button type="button" onClick={() => setShowBuys((v) => !v)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors border ${
                    showBuys ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400" : "border-white/10 bg-[var(--app-card)] text-zinc-400 hover:text-zinc-200"
                  }`}
                >Buys</button>
                <button type="button" onClick={() => setShowSells((v) => !v)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors border ${
                    showSells ? "border-red-500/60 bg-red-500/10 text-red-400" : "border-white/10 bg-[var(--app-card)] text-zinc-400 hover:text-zinc-200"
                  }`}
                >Sells</button>
                <button type="button" onClick={() => setShowHouse((v) => !v)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors border ${
                    showHouse ? "border-[var(--accent-color)]/60 text-[var(--accent-color)]" : "border-white/10 bg-[var(--app-card)] text-zinc-400 hover:text-zinc-200"
                  }`}
                >House</button>
                <button type="button" onClick={() => setShowSenate((v) => !v)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors border ${
                    showSenate ? "border-[var(--accent-color)]/60 text-[var(--accent-color)]" : "border-white/10 bg-[var(--app-card)] text-zinc-400 hover:text-zinc-200"
                  }`}
                >Senate</button>
              </div>

              {statFilter !== "all" && (
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span>
                    Filtered by:{" "}
                    <span className="text-[var(--accent-color)]">
                      {statFilter === "notable" ? "Notable Trades" : statFilter === "purchases" ? "Purchases" : statFilter === "delay" ? "Highest Delay" : `Most Traded (${stats.topTicker})`}
                    </span>
                  </span>
                  <button onClick={() => setStatFilter("all")} className="text-zinc-600 hover:text-zinc-300">✕ clear</button>
                </div>
              )}

              {/* Non-trader search results — shown at bottom */}
              {filtered.length === 0 && dataSource === "loading" && (
                <p className="py-10 text-center text-sm text-zinc-600">Loading trades…</p>
              )}
              {filtered.length === 0 && dataSource !== "loading" && !searchUnified?.noTradeLegs.length && (
                <p className="py-10 text-center text-sm text-zinc-600">No trades match your filters.</p>
              )}

              <div className="space-y-2">
                {filtered.map((trade) => (
                  <div
                    key={trade.id}
                    onClick={() => openPol(trade.politician, trade.bioguideId, trade.party, trade.chamber, trade.state, traderMap.get(trade.politician) ?? [trade])}
                    className={`cursor-pointer rounded-xl border bg-[var(--app-card)] p-3 transition-colors hover:border-white/25 hover:bg-white/[0.02] ${
                      trade.isNotable ? "border-amber-500/30 bg-amber-500/[0.03]" : "border-white/10"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {trade.isNotable && (
                            <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-400">⚡ Notable</span>
                          )}
                          <span className="text-sm font-medium text-zinc-100">{trade.politician}</span>
                          <PartyBadge party={trade.party} />
                          <span className="text-[10px] text-zinc-500">{trade.chamber}</span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-bold text-zinc-100">{trade.ticker}</span>
                          <span className="text-xs text-zinc-400 truncate">{trade.company}</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${trade.transaction === "Purchase" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                          {trade.transaction === "Purchase" ? "▲ Buy" : "▼ Sell"}
                        </span>
                        <p className="mt-1 text-[11px] text-zinc-400">{trade.amountRange}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-zinc-600">
                      <span>Traded: {fmtDate(trade.tradeDate)}</span>
                      <span>Disclosed: {fmtDate(trade.disclosedDate)}</span>
                      <span className={trade.daysToDisclose >= 44 ? "text-amber-500" : ""}>
                        {trade.daysToDisclose}d to disclose{trade.daysToDisclose >= 44 ? " ⚠" : ""}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Non-traders at the bottom of search results */}
                {searchUnified?.noTradeLegs.map((leg) => (
                  <button
                    key={leg.bioguide}
                    type="button"
                    onClick={() => openPol(leg.name, leg.bioguide, leg.party, leg.chamber, leg.state, [])}
                    className="w-full rounded-xl border border-white/5 bg-[var(--app-card)]/60 p-3 text-left hover:border-white/15 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-500">{leg.name}</span>
                      <PartyBadge party={leg.party} />
                      <span className="text-[10px] text-zinc-600">{leg.chamber} · {leg.state}</span>
                      <span className="ml-auto text-[10px] text-zinc-700 italic">No trades recorded</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right sidebar */}
            <div className="space-y-4">
              {/* Most Active Traders */}
              <div className="space-y-2">
                <h3 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Most Active Traders</h3>
                <div className="space-y-1.5">
                  {leaderboard.map((p, i) => (
                    <button key={p.name} type="button"
                      onClick={() => openPol(p.name, p.bioguideId, p.party, p.chamber, p.state, p.trades)}
                      className="w-full flex items-center gap-2 rounded-xl border border-white/10 bg-[var(--app-card)] px-3 py-2 hover:border-[var(--accent-color)]/30 hover:bg-[var(--accent-color)]/5 transition-all text-left"
                    >
                      <span className="w-5 shrink-0 text-center text-[10px] text-zinc-600">#{i + 1}</span>
                      {bioPhoto(p.bioguideId) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={bioPhoto(p.bioguideId)!} alt=""
                          className="h-6 w-6 shrink-0 rounded-full object-cover border border-white/10"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="truncate text-xs font-medium text-zinc-200">{p.name}</span>
                          <PartyBadge party={p.party} />
                        </div>
                        <p className="text-[10px] text-zinc-600">{p.chamber}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-semibold text-[var(--accent-color)]">{p.tradeCount}</p>
                        <p className="text-[10px] text-zinc-600">{p.topTicker}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* All-Time Most Return */}
              {allTimeMostReturn.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">All-Time Most Return</h3>
                  <div className="space-y-1.5">
                    {allTimeMostReturn.map((p, i) => (
                      <button key={p.name} type="button"
                        onClick={() => openPol(p.name, p.bioguideId, p.party, p.chamber, p.state, p.trades)}
                        className="w-full flex items-center gap-2 rounded-xl border border-white/10 bg-[var(--app-card)] px-3 py-2 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all text-left"
                      >
                        <span className="w-5 shrink-0 text-center text-[10px] text-zinc-600">#{i + 1}</span>
                        {bioPhoto(p.bioguideId) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={bioPhoto(p.bioguideId)!} alt=""
                            className="h-6 w-6 shrink-0 rounded-full object-cover border border-white/10"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <span className="truncate text-xs font-medium text-zinc-200">{p.name}</span>
                            <PartyBadge party={p.party} />
                          </div>
                          <p className="text-[10px] text-zinc-600">{p.trades.length} trades</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={`text-xs font-semibold ${p.avgExcess >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {p.avgExcess >= 0 ? "+" : ""}{p.avgExcess.toFixed(1)}%
                          </p>
                          <p className="text-[10px] text-zinc-600">avg excess</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Party pie + YTD tracker */}
              {legislators.length > 0 && (
                <PartyPieChart
                  legislators={legislators}
                  traderBioguides={traderBioguides}
                  traderNames={traderNames}
                  ytdVolume={ytdVolume}
                />
              )}

              <div className="rounded-xl border border-white/10 bg-[var(--app-card)] p-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Notable Trade Criteria</p>
                <ul className="space-y-1 text-[10px] text-zinc-600">
                  <li>• Disclosed amount &gt; $1M</li>
                  <li>• Filed at or near the 45-day limit</li>
                  <li>• Trade near major legislation vote</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-[var(--app-card)] p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Most Traded Tickers (Congress)</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={tickerChart} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <XAxis dataKey="ticker" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "#0F1520", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                  <Bar dataKey="count" name="Trades" fill="var(--accent-color)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-xl border border-white/10 bg-[var(--app-card)] p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Trade Activity by Month</p>
              <div className="mb-2 flex gap-4 text-[10px]">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" />Purchases</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-red-500" />Sales</span>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={monthChart} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "#0F1520", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                  <Bar dataKey="buys" name="Purchases" fill="#10B981" radius={[2,2,0,0]} stackId="a" />
                  <Bar dataKey="sells" name="Sales" fill="#EF4444" radius={[2,2,0,0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* ── Corporate Tab ── */}
      {activeTab === "corporate" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-[var(--accent-color)]/20 bg-[var(--accent-color)]/5 px-3 py-2 text-xs text-[var(--accent-color)]">
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            SEC Form 4 filings — executives &amp; directors must disclose within 2 business days of the trade.
          </div>
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-[var(--app-card)] py-16 text-center">
            <div className="rounded-full bg-white/5 p-5">
              <svg className="h-8 w-8 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="mt-3 text-sm font-medium text-zinc-400">Corporate Insider Filings</h3>
            <p className="mt-1 max-w-xs text-xs text-zinc-600">
              SEC Form 4 data integration coming soon.
            </p>
          </div>
        </div>
      )}

      {/* ── Cabinet Tab ── */}
      {activeTab === "cabinet" && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-[var(--app-card)] py-16 text-center">
          <div className="rounded-full bg-white/5 p-5">
            <svg className="h-8 w-8 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h3 className="mt-3 text-sm font-medium text-zinc-400">Cabinet Disclosures</h3>
          <p className="mt-1 max-w-xs text-xs text-zinc-600">
            Executive branch financial disclosures via the Office of Government Ethics. Coming soon.
          </p>
        </div>
      )}

      <p className="text-center text-[10px] text-zinc-700">
        Data sourced from public STOCK Act filings via Quiver Quantitative. For informational purposes only — not investment advice.
      </p>

      {selectedPol && <PoliticianModal profile={selectedPol} onClose={() => setSelectedPol(null)} />}
    </div>
  );
}
