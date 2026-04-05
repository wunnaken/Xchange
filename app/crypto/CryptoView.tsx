"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ResponsiveContainer,
  PieChart,
  Pie,
  Treemap,
  ReferenceLine,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CoinMarket {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  market_cap_change_24h: number;
  total_volume: number;
  price_change_percentage_1h_in_currency: number;
  price_change_percentage_24h_in_currency: number;
  price_change_percentage_7d_in_currency: number;
  sparkline_in_7d: { price: number[] };
  circulating_supply: number;
  ath: number;
  ath_change_percentage: number;
}

interface GlobalData {
  total_market_cap: Record<string, number>;
  total_volume: Record<string, number>;
  market_cap_percentage: Record<string, number>;
  market_cap_change_percentage_24h_usd: number;
  active_cryptocurrencies: number;
  markets: number;
}

interface TrendingCoin {
  item: {
    id: string;
    name: string;
    symbol: string;
    thumb: string;
    market_cap_rank: number;
    data: { price_change_percentage_24h: { usd: number }; price: string };
  };
}

interface FearGreedPoint {
  value: string;
  value_classification: string;
  timestamp: string;
}

interface DefiProtocol {
  name: string;
  tvl: number;
  change1d: number;
  change7d: number;
  category: string;
  chains: string[];
}

interface DefiHistoryPoint {
  date: number;
  tvl: number;
}

interface DomHistPoint {
  date: string;
  value: number;
}

interface NewsArticle {
  id: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: number;
  image: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2) {
  if (n === undefined || n === null || isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtCompact(n: number) {
  if (!n) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toFixed(2)}`;
}

function fmtPrice(n: number) {
  if (!n) return "—";
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(8)}`;
}

function pctColor(v: number) {
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-zinc-400";
}

function pctArrow(v: number) {
  return v > 0 ? "▲" : v < 0 ? "▼" : "";
}

function fngColor(v: number) {
  if (v >= 75) return "#22c55e";
  if (v >= 55) return "#86efac";
  if (v >= 45) return "#facc15";
  if (v >= 25) return "#f97316";
  return "#ef4444";
}

// ─── GlobalStatsBar ──────────────────────────────────────────────────────────

function GlobalStatsBar({ global }: { global: GlobalData | null }) {
  if (!global) return null;
  const mcap = global.total_market_cap?.usd ?? 0;
  const vol = global.total_volume?.usd ?? 0;
  const change = global.market_cap_change_percentage_24h_usd ?? 0;
  const btcDom = global.market_cap_percentage?.btc ?? 0;
  const ethDom = global.market_cap_percentage?.eth ?? 0;

  const stats = [
    { label: "Total Market Cap", value: fmtCompact(mcap), sub: `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`, subColor: pctColor(change) },
    { label: "24h Volume", value: fmtCompact(vol), sub: null, subColor: "" },
    { label: "BTC Dominance", value: `${btcDom.toFixed(1)}%`, sub: null, subColor: "" },
    { label: "ETH Dominance", value: `${ethDom.toFixed(1)}%`, sub: null, subColor: "" },
    { label: "Active Coins", value: (global.active_cryptocurrencies ?? 0).toLocaleString(), sub: null, subColor: "" },
    { label: "Markets", value: (global.markets ?? 0).toLocaleString(), sub: null, subColor: "" },
  ];

  return (
    <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
      {stats.map((s) => (
        <div key={s.label} className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">{s.label}</p>
          <p className="mt-0.5 text-sm font-semibold text-zinc-100">{s.value}</p>
          {s.sub && <p className={`text-[10px] font-medium ${s.subColor}`}>{s.sub}</p>}
        </div>
      ))}
    </div>
  );
}

// ─── FearGreedCard ────────────────────────────────────────────────────────────

function FearGreedCard({ data }: { data: FearGreedPoint[] }) {
  const current = data[0];
  const score = current ? parseInt(current.value) : 50;
  const label = current?.value_classification ?? "Neutral";
  const color = fngColor(score);

  const history = [...data].reverse().slice(-14).map((d, i) => ({
    i,
    v: parseInt(d.value),
  }));

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Fear & Greed Index</p>
      <div className="flex items-center gap-4">
        <div className="relative flex h-24 w-24 flex-shrink-0 items-center justify-center">
          <PieChart width={96} height={96}>
            <Pie
              data={[{ v: score }, { v: 100 - score }]}
              startAngle={180}
              endAngle={0}
              innerRadius={30}
              outerRadius={44}
              dataKey="v"
              strokeWidth={0}
            >
              <Cell fill={color} />
              <Cell fill="rgba(255,255,255,0.05)" />
            </Pie>
          </PieChart>
          <div className="absolute inset-0 flex flex-col items-center justify-center pt-4">
            <span className="text-xl font-bold text-zinc-50">{score}</span>
          </div>
        </div>
        <div>
          <p className="text-lg font-semibold" style={{ color }}>{label}</p>
          <p className="text-xs text-zinc-500">14-day trend</p>
          <ResponsiveContainer width={120} height={32}>
            <LineChart data={history}>
              <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── TrendingRow ──────────────────────────────────────────────────────────────

function TrendingRow({ coins }: { coins: TrendingCoin[] }) {
  if (!coins.length) return null;
  return (
    <div className="mb-4 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Trending</p>
      <div className="flex flex-wrap gap-2">
        {coins.map((c) => {
          const chg = c.item.data?.price_change_percentage_24h?.usd ?? 0;
          return (
            <div
              key={c.item.id}
              className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.04] px-3 py-1.5"
            >
              <img src={c.item.thumb} alt={c.item.name} className="h-5 w-5 rounded-full" />
              <span className="text-xs font-medium text-zinc-200">{c.item.symbol.toUpperCase()}</span>
              <span className={`text-[10px] font-medium ${pctColor(chg)}`}>
                {pctArrow(chg)}{Math.abs(chg).toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MiniSparkline ────────────────────────────────────────────────────────────

function MiniSparkline({ prices, positive }: { prices: number[]; positive: boolean }) {
  if (!prices?.length) return <div className="h-8 w-20" />;
  const data = prices.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width={80} height={32}>
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={positive ? "#22c55e" : "#ef4444"}
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── MarketsTab ───────────────────────────────────────────────────────────────

function MarketsTab({ coins }: { coins: CoinMarket[] }) {
  const [sort, setSort] = useState<"rank" | "price" | "change24h" | "mcap" | "volume">("rank");
  const [dir, setDir] = useState<1 | -1>(1);
  const [search, setSearch] = useState("");

  const toggle = (col: typeof sort) => {
    if (sort === col) setDir((d) => (d === 1 ? -1 : 1));
    else { setSort(col); setDir(col === "rank" ? 1 : -1); }
  };

  const filtered = coins
    .filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.symbol.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const map: Record<string, number> = {
        rank: a.market_cap_rank - b.market_cap_rank,
        price: a.current_price - b.current_price,
        change24h: (a.price_change_percentage_24h_in_currency ?? 0) - (b.price_change_percentage_24h_in_currency ?? 0),
        mcap: a.market_cap - b.market_cap,
        volume: a.total_volume - b.total_volume,
      };
      return map[sort] * dir;
    });

  const Th = ({ col, label }: { col: typeof sort; label: string }) => (
    <th
      className="cursor-pointer select-none px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
      onClick={() => toggle(col)}
    >
      {label}{sort === col ? (dir === 1 ? " ▲" : " ▼") : ""}
    </th>
  );

  return (
    <div>
      <div className="mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search coins…"
          className="w-full max-w-xs rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-[var(--accent-color)]/50"
        />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-white/5">
        <table className="w-full min-w-[700px]">
          <thead className="border-b border-white/5 bg-white/[0.02]">
            <tr>
              <Th col="rank" label="#" />
              <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Name</th>
              <Th col="price" label="Price" />
              <Th col="change24h" label="24h %" />
              <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">1h %</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">7d %</th>
              <Th col="mcap" label="Market Cap" />
              <Th col="volume" label="Volume" />
              <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">7d Chart</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const chg24 = c.price_change_percentage_24h_in_currency ?? 0;
              const chg1h = c.price_change_percentage_1h_in_currency ?? 0;
              const chg7d = c.price_change_percentage_7d_in_currency ?? 0;
              return (
                <tr key={c.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="px-3 py-2 text-xs text-zinc-500">{c.market_cap_rank}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <img src={c.image} alt={c.name} className="h-5 w-5 rounded-full" />
                      <span className="text-xs font-medium text-zinc-200">{c.name}</span>
                      <span className="text-[10px] text-zinc-500">{c.symbol.toUpperCase()}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs font-medium text-zinc-100">{fmtPrice(c.current_price)}</td>
                  <td className={`px-3 py-2 text-xs font-medium ${pctColor(chg24)}`}>
                    {pctArrow(chg24)}{Math.abs(chg24).toFixed(2)}%
                  </td>
                  <td className={`px-3 py-2 text-xs ${pctColor(chg1h)}`}>
                    {pctArrow(chg1h)}{Math.abs(chg1h).toFixed(2)}%
                  </td>
                  <td className={`px-3 py-2 text-xs ${pctColor(chg7d)}`}>
                    {pctArrow(chg7d)}{Math.abs(chg7d).toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-300">{fmtCompact(c.market_cap)}</td>
                  <td className="px-3 py-2 text-xs text-zinc-400">{fmtCompact(c.total_volume)}</td>
                  <td className="px-3 py-2">
                    <MiniSparkline prices={c.sparkline_in_7d?.price ?? []} positive={chg7d >= 0} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── DeFiTab ──────────────────────────────────────────────────────────────────

function DeFiTab({ protocols, history }: { protocols: DefiProtocol[]; history: DefiHistoryPoint[] }) {
  const histData = history.map((d) => ({
    date: new Date(d.date * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    tvl: d.tvl / 1e9,
  }));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Total DeFi TVL (90d)</p>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={histData}>
            <defs>
              <linearGradient id="defiGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-color)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--accent-color)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#71717a" }} tickLine={false} axisLine={false} interval={14} />
            <YAxis tick={{ fontSize: 9, fill: "#71717a" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v.toFixed(0)}B`} />
            <Tooltip
              contentStyle={{ background: "#0a0b14", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 11 }}
              formatter={(v) => [`$${(v as number).toFixed(2)}B`, "TVL"]}
            />
            <Area type="monotone" dataKey="tvl" stroke="var(--accent-color)" fill="url(#defiGrad)" strokeWidth={1.5} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/5">
        <table className="w-full min-w-[500px]">
          <thead className="border-b border-white/5 bg-white/[0.02]">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Protocol</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Category</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">TVL</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">1d %</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">7d %</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Chains</th>
            </tr>
          </thead>
          <tbody>
            {protocols.map((p) => (
              <tr key={p.name} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                <td className="px-3 py-2 text-xs font-medium text-zinc-200">{p.name}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">{p.category}</span>
                </td>
                <td className="px-3 py-2 text-xs text-zinc-100">{fmtCompact(p.tvl)}</td>
                <td className={`px-3 py-2 text-xs ${pctColor(p.change1d ?? 0)}`}>
                  {p.change1d != null ? `${pctArrow(p.change1d)}${Math.abs(p.change1d).toFixed(2)}%` : "—"}
                </td>
                <td className={`px-3 py-2 text-xs ${pctColor(p.change7d ?? 0)}`}>
                  {p.change7d != null ? `${pctArrow(p.change7d)}${Math.abs(p.change7d).toFixed(2)}%` : "—"}
                </td>
                <td className="px-3 py-2 text-[10px] text-zinc-500">{(p.chains ?? []).slice(0, 3).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── DominanceTab ─────────────────────────────────────────────────────────────

const DOM_COLORS = ["#f7931a", "#627eea", "#26a17b", "#e84142", "#2775ca", "#a855f7", "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b"];

function DominanceTab({
  dominance,
  history,
  coins,
}: {
  dominance: Record<string, number>;
  history: DomHistPoint[];
  coins: CoinMarket[];
}) {
  const sorted = Object.entries(dominance)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const pieData = sorted.map(([sym, pct]) => ({ name: sym.toUpperCase(), value: parseFloat(pct.toFixed(2)) }));

  // Market cap gain/loss 24h for top 10 coins by rank
  const gainLoss = coins
    .slice(0, 10)
    .map((c) => ({
      name: c.symbol.toUpperCase(),
      change: c.market_cap_change_24h ?? 0,
    }))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  const histMin = history.length ? Math.min(...history.map((d) => d.value)) * 0.98 : 0;
  const histMax = history.length ? Math.max(...history.map((d) => d.value)) * 1.02 : undefined;

  return (
    <div className="space-y-4">
      {/* 30-day total market cap chart */}
      <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Total Crypto Market Cap — 30 Days</p>
        {history.length ? (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={history}>
              <defs>
                <linearGradient id="domGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent-color)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--accent-color)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#71717a" }} tickLine={false} axisLine={false} interval={4} />
              <YAxis
                tick={{ fontSize: 9, fill: "#71717a" }}
                tickLine={false}
                axisLine={false}
                domain={[histMin, histMax ?? "auto"]}
                tickFormatter={(v) => `$${(v / 1e12).toFixed(2)}T`}
              />
              <Tooltip
                contentStyle={{ background: "#0a0b14", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 11 }}
                formatter={(v) => [`$${((v as number) / 1e12).toFixed(3)}T`, "Market Cap"]}
              />
              <Area type="monotone" dataKey="value" stroke="var(--accent-color)" fill="url(#domGrad)" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[180px] items-center justify-center text-xs text-zinc-600">No history data</div>
        )}
      </div>

      {/* Pie + breakdown */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Market Cap Dominance</p>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={110} dataKey="value" strokeWidth={1} stroke="rgba(0,0,0,0.3)" isAnimationActive={false}>
                {pieData.map((_, i) => (
                  <Cell key={i} fill={DOM_COLORS[i % DOM_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "#0a0b14", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 11 }}
                formatter={(v) => [`${v}%`, ""]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Breakdown</p>
          <div className="space-y-2">
            {sorted.map(([sym, pct], i) => (
              <div key={sym} className="flex items-center gap-3">
                <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: DOM_COLORS[i % DOM_COLORS.length] }} />
                <span className="w-12 text-xs font-medium text-zinc-200">{sym.toUpperCase()}</span>
                <div className="flex-1 rounded-full bg-white/5">
                  <div
                    className="h-1.5 rounded-full"
                    style={{ width: `${Math.min(pct, 100)}%`, background: DOM_COLORS[i % DOM_COLORS.length] }}
                  />
                </div>
                <span className="w-14 text-right text-xs text-zinc-400">{pct.toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 24h market cap gain / loss */}
      <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">24h Market Cap Gain / Loss — Top 10</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={gainLoss} barCategoryGap="30%">
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#71717a" }} tickLine={false} axisLine={false} />
            <YAxis
              tick={{ fontSize: 9, fill: "#71717a" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => {
                const abs = Math.abs(v);
                if (abs >= 1e9) return `${v < 0 ? "-" : ""}$${(abs / 1e9).toFixed(1)}B`;
                if (abs >= 1e6) return `${v < 0 ? "-" : ""}$${(abs / 1e6).toFixed(0)}M`;
                return `$${v.toFixed(0)}`;
              }}
            />
            <Tooltip
              contentStyle={{ background: "#0a0b14", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 11 }}
              formatter={(v) => {
                const n = v as number;
                const abs = Math.abs(n);
                const fmt = abs >= 1e9 ? `${n < 0 ? "-" : "+"}$${(abs / 1e9).toFixed(2)}B` : `${n < 0 ? "-" : "+"}$${(abs / 1e6).toFixed(0)}M`;
                return [fmt, "24h Change"];
              }}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
            <Bar dataKey="change" isAnimationActive={false} radius={[3, 3, 0, 0]}>
              {gainLoss.map((d, i) => (
                <Cell key={i} fill={d.change >= 0 ? "#22c55e" : "#ef4444"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── HeatmapTab ───────────────────────────────────────────────────────────────

interface HeatmapNode {
  name: string;
  size: number;
  change: number;
}

interface HeatmapContentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  change?: number;
}

function HeatmapContent(props: HeatmapContentProps) {
  const { x = 0, y = 0, width = 0, height = 0, name = "", change = 0 } = props;
  const color = change > 5 ? "#166534" : change > 2 ? "#15803d" : change > 0 ? "#16a34a" : change > -2 ? "#dc2626" : change > -5 ? "#b91c1c" : "#991b1b";
  const textColor = "#e4e4e7";

  if (width < 30 || height < 20) return <g />;

  return (
    <g>
      <rect x={x + 1} y={y + 1} width={width - 2} height={height - 2} rx={4} fill={color} />
      {height > 30 && (
        <>
          <text x={x + width / 2} y={y + height / 2 - 5} textAnchor="middle" fill={textColor} fontSize={Math.min(12, width / 4)} fontWeight={600}>
            {name}
          </text>
          <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill={textColor} fontSize={Math.min(10, width / 5)} opacity={0.8}>
            {change >= 0 ? "+" : ""}{change.toFixed(2)}%
          </text>
        </>
      )}
    </g>
  );
}

type HeatmapTf = "1h" | "24h" | "7d";
type HeatmapSize = 25 | 50 | 100;

function HeatmapTab({ coins }: { coins: CoinMarket[] }) {
  const [tf, setTf] = useState<HeatmapTf>("24h");
  const [size, setSize] = useState<HeatmapSize>(50);

  const changeField: Record<HeatmapTf, keyof CoinMarket> = {
    "1h": "price_change_percentage_1h_in_currency",
    "24h": "price_change_percentage_24h_in_currency",
    "7d": "price_change_percentage_7d_in_currency",
  };

  const data: HeatmapNode[] = coins.slice(0, size).map((c) => ({
    name: c.symbol.toUpperCase(),
    size: Math.max(c.market_cap, 1),
    change: (c[changeField[tf]] as number) ?? 0,
  }));

  const btnBase = "rounded-lg px-2.5 py-1 text-[10px] font-medium transition-colors";
  const btnActive = "bg-[var(--accent-color)]/15 text-[var(--accent-color)]";
  const btnInactive = "text-zinc-500 hover:text-zinc-300";

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
      {/* Filters row */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Market Cap Heatmap</p>
        <div className="flex items-center gap-3">
          {/* Timeframe */}
          <div className="flex gap-1 rounded-lg border border-white/5 bg-white/[0.02] p-0.5">
            {(["1h", "24h", "7d"] as HeatmapTf[]).map((t) => (
              <button key={t} onClick={() => setTf(t)} className={`${btnBase} ${tf === t ? btnActive : btnInactive}`}>{t}</button>
            ))}
          </div>
          {/* Size */}
          <div className="flex gap-1 rounded-lg border border-white/5 bg-white/[0.02] p-0.5">
            {([25, 50, 100] as HeatmapSize[]).map((s) => (
              <button key={s} onClick={() => setSize(s)} className={`${btnBase} ${size === s ? btnActive : btnInactive}`}>Top {s}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-2 flex items-center gap-4 text-[10px] text-zinc-500">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-green-800" /> &gt;+5%</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-green-600" /> 0–5%</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-red-600" /> 0–(−5)%</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-red-900" /> &lt;−5%</span>
      </div>

      <ResponsiveContainer width="100%" height={500}>
        <Treemap data={data} dataKey="size" isAnimationActive={false} content={<HeatmapContent />} />
      </ResponsiveContainer>
    </div>
  );
}

// ─── NewsTab ──────────────────────────────────────────────────────────────────

function NewsTab({ articles }: { articles: NewsArticle[] }) {
  if (!articles.length) {
    return (
      <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-8 text-center text-sm text-zinc-500">
        No news available.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {articles.map((a) => (
        <a
          key={a.id}
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.06]"
        >
          {a.image && (
            <img
              src={a.image}
              alt=""
              className="h-14 w-20 flex-shrink-0 rounded-lg object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-medium text-zinc-200">{a.headline}</p>
            <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{a.summary}</p>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-600">
              <span>{a.source}</span>
              <span>·</span>
              <span>{new Date(a.datetime * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

type TabId = "markets" | "defi" | "dominance" | "heatmap" | "news";

const TABS: { id: TabId; label: string }[] = [
  { id: "markets", label: "Markets" },
  { id: "defi", label: "DeFi" },
  { id: "dominance", label: "Dominance" },
  { id: "heatmap", label: "Heatmap" },
  { id: "news", label: "News" },
];

export default function CryptoView() {
  const [tab, setTab] = useState<TabId>("markets");

  const [markets, setMarkets] = useState<{ global: GlobalData | null; coins: CoinMarket[]; trending: TrendingCoin[] } | null>(null);
  const [fng, setFng] = useState<FearGreedPoint[]>([]);
  const [defi, setDefi] = useState<{ protocols: DefiProtocol[]; history: DefiHistoryPoint[] } | null>(null);
  const [domHistory, setDomHistory] = useState<DomHistPoint[] | null>(null);
  const [news, setNews] = useState<NewsArticle[]>([]);

  const [loadingMarkets, setLoadingMarkets] = useState(true);
  const [loadingFng, setLoadingFng] = useState(true);
  const [loadingDefi, setLoadingDefi] = useState(false);
  const [loadingDom, setLoadingDom] = useState(false);
  const [loadingNews, setLoadingNews] = useState(false);

  useEffect(() => {
    fetch("/api/crypto/markets")
      .then((r) => r.json())
      .then(setMarkets)
      .catch(console.error)
      .finally(() => setLoadingMarkets(false));

    fetch("/api/crypto/fear-greed")
      .then((r) => r.json())
      .then((d) => setFng(d.data ?? []))
      .catch(console.error)
      .finally(() => setLoadingFng(false));
  }, []);

  const loadDefi = useCallback(() => {
    if (defi) return;
    setLoadingDefi(true);
    fetch("/api/crypto/defi")
      .then((r) => r.json())
      .then(setDefi)
      .catch(console.error)
      .finally(() => setLoadingDefi(false));
  }, [defi]);

  const loadDom = useCallback(() => {
    if (domHistory !== null) return;
    setLoadingDom(true);
    fetch("/api/crypto/dominance")
      .then((r) => r.json())
      .then((d) => setDomHistory(d.history ?? []))
      .catch(console.error)
      .finally(() => setLoadingDom(false));
  }, [domHistory]);

  const loadNews = useCallback(() => {
    if (news.length) return;
    setLoadingNews(true);
    fetch("/api/crypto/news")
      .then((r) => r.json())
      .then((d) => setNews(d.articles ?? []))
      .catch(console.error)
      .finally(() => setLoadingNews(false));
  }, [news]);

  useEffect(() => {
    if (tab === "defi") loadDefi();
    if (tab === "dominance") loadDom();
    if (tab === "news") loadNews();
  }, [tab, loadDefi, loadDom, loadNews]);

  return (
    <div>
      {/* Top row: global stats + fear greed */}
      <GlobalStatsBar global={markets?.global ?? null} />

      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          {loadingMarkets ? (
            <div className="h-20 rounded-2xl bg-white/5 animate-pulse" />
          ) : (
            <TrendingRow coins={markets?.trending ?? []} />
          )}
        </div>
        <div>
          {loadingFng ? (
            <div className="h-36 rounded-2xl bg-white/5 animate-pulse" />
          ) : (
            <FearGreedCard data={fng} />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-xl border border-white/5 bg-white/[0.02] p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t.id
                ? "bg-[var(--accent-color)]/15 text-[var(--accent-color)]"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "markets" && (
        loadingMarkets ? (
          <div className="h-96 rounded-2xl bg-white/5 animate-pulse" />
        ) : (
          <MarketsTab coins={markets?.coins ?? []} />
        )
      )}

      {tab === "defi" && (
        loadingDefi ? (
          <div className="h-96 rounded-2xl bg-white/5 animate-pulse" />
        ) : defi ? (
          <DeFiTab protocols={defi.protocols} history={defi.history} />
        ) : null
      )}

      {tab === "dominance" && (
        (loadingMarkets || loadingDom || domHistory === null) ? (
          <div className="h-96 rounded-2xl bg-white/5 animate-pulse" />
        ) : (
          <DominanceTab
            dominance={markets?.global?.market_cap_percentage ?? {}}
            history={domHistory}
            coins={markets?.coins ?? []}
          />
        )
      )}

      {tab === "heatmap" && (
        loadingMarkets ? (
          <div className="h-96 rounded-2xl bg-white/5 animate-pulse" />
        ) : (
          <HeatmapTab coins={markets?.coins ?? []} />
        )
      )}

      {tab === "news" && (
        loadingNews ? (
          <div className="h-96 rounded-2xl bg-white/5 animate-pulse" />
        ) : (
          <NewsTab articles={news} />
        )
      )}
    </div>
  );
}
