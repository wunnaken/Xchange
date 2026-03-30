"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addTrade,
  updateTrade,
  deleteTrade,
  saveTrades,
  formatCurrency,
  formatPercent,
  getTrades,
  computePnL,
  JOURNAL_STORAGE_KEY,
  type JournalTrade,
  type Direction,
  type Strategy,
  STRATEGIES,
  type JournalTradeInput,
} from "../../lib/journal";
import { tickJournalStreak } from "../../lib/engagement/streaks";
import { addXPFromTrade } from "../../lib/engagement/xp";
import { useToast } from "../../components/ToastContext";
import type { JournalInsightsResponse } from "../api/journal-insights/route";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";

const BG = "#0A0E1A";
const GRID_COLOR = "#1a2535";
const MAX_TRADES_PER_DAY = 10;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type TabId = "trades" | "analytics" | "insights";

function getCalendarDays(year: number, month: number): { date: string; day: number; isCurrentMonth: boolean }[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const daysInMonth = last.getDate();
  const out: { date: string; day: number; isCurrentMonth: boolean }[] = [];
  for (let i = 0; i < startPad; i++) {
    const d = new Date(year, month, -startPad + i + 1);
    out.push({
      date: d.toISOString().slice(0, 10),
      day: d.getDate(),
      isCurrentMonth: false,
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    out.push({ date: dateStr, day: d, isCurrentMonth: true });
  }
  const remainder = out.length % 7;
  if (remainder !== 0) {
    const nextMonth = month + 1;
    const nextYear = nextMonth > 11 ? year + 1 : year;
    const nextM = nextMonth % 12;
    for (let d = 1; d <= 7 - remainder; d++) {
      const dateStr = `${nextYear}-${String(nextM + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      out.push({ date: dateStr, day: d, isCurrentMonth: false });
    }
  }
  return out;
}

const INSIGHTS_CACHE_KEY = "quantivtrade-journal-insights";
const INSIGHTS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export default function JournalView() {
  const [activeTab, setActiveTab] = useState<TabId>("trades");
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [tradesLoading, setTradesLoading] = useState(true);
  const [tradesError, setTradesError] = useState<string | null>(null);
  const [failedLocalTrades, setFailedLocalTrades] = useState<JournalTrade[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<JournalTrade | null>(null);
  const [insights, setInsights] = useState<JournalInsightsResponse | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const insightsCacheRef = useRef<{ data: JournalInsightsResponse; at: number } | null>(null);
  const migratedRef = useRef(false);
  const toast = useToast();
  const [openPrices, setOpenPrices] = useState<Record<string, number>>({});

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // Filters
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "closed">("all");
  const [filterAsset, setFilterAsset] = useState("");
  const [filterDirection, setFilterDirection] = useState<"all" | "LONG" | "SHORT">("all");
  const [filterOutcome, setFilterOutcome] = useState<"all" | "winners" | "losers">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "pnl" | "asset">("date");

  const loadTrades = useCallback(async () => {
    setTradesLoading(true);
    setTradesError(null);
    try {
      const res = await fetch("/api/trades", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { trades: JournalTrade[] };
        const list = Array.isArray(data.trades) ? data.trades : [];
        setTrades(list);
        if (!migratedRef.current && typeof window !== "undefined") {
          migratedRef.current = true;
          const raw = window.localStorage.getItem(JOURNAL_STORAGE_KEY);
          if (raw) {
            try {
              const local = JSON.parse(raw) as JournalTrade[];
              if (Array.isArray(local) && local.length > 0) {
                let migrated = 0;
                for (const t of local) {
                  const body = {
                    asset: t.asset,
                    direction: t.direction,
                    entry_price: t.entryPrice,
                    exit_price: t.exitPrice,
                    position_size: t.positionSize,
                    entry_date: t.entryDate.slice(0, 10),
                    exit_date: t.exitDate ? t.exitDate.slice(0, 10) : null,
                    strategy: t.strategy,
                    notes: t.notes,
                    tags: t.tags,
                  };
                  const r = await fetch("/api/trades", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                  if (r.ok) migrated++;
                }
                window.localStorage.removeItem(JOURNAL_STORAGE_KEY);
                if (migrated > 0) {
                  const refetch = await fetch("/api/trades", { cache: "no-store" });
                  if (refetch.ok) {
                    const d = (await refetch.json()) as { trades: JournalTrade[] };
                    setTrades(Array.isArray(d.trades) ? d.trades : []);
                  }
                }
              }
            } catch {
              // keep localStorage as fallback
            }
          }
        }
      } else {
        const local = getTrades();
        setTrades(local);
      }
    } catch {
      setTrades(getTrades());
    } finally {
      setTradesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrades();
  }, [loadTrades]);

  const displayTrades = useMemo(() => {
    const byId = new Map<string, JournalTrade>();
    trades.forEach((t) => byId.set(t.id, t));
    failedLocalTrades.forEach((t) => byId.set(t.id, t));
    return Array.from(byId.values()).sort((a, b) => (b.entryDate + b.id).localeCompare(a.entryDate + a.id));
  }, [trades, failedLocalTrades]);

  const openTradeAssets = useMemo(
    () => [...new Set(displayTrades.filter((t) => t.exitPrice == null).map((t) => t.asset.trim().toUpperCase()).filter(Boolean))].slice(0, 15),
    [displayTrades]
  );
  useEffect(() => {
    if (openTradeAssets.length === 0) {
      setOpenPrices({});
      return;
    }
    const map: Record<string, number> = {};
    let done = 0;
    openTradeAssets.forEach((symbol) => {
      fetch(`/api/ticker-quote?ticker=${encodeURIComponent(symbol)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (d?.price != null) map[symbol] = Number(d.price);
        })
        .finally(() => {
          done++;
          if (done === openTradeAssets.length) setOpenPrices((prev) => ({ ...prev, ...map }));
        });
    });
  }, [openTradeAssets.join(",")]);

  const filteredTrades = useMemo(() => {
    let list = [...displayTrades];
    if (filterStatus === "open") list = list.filter((t) => t.exitPrice == null);
    if (filterStatus === "closed") list = list.filter((t) => t.exitPrice != null);
    if (filterAsset.trim()) {
      const q = filterAsset.trim().toLowerCase();
      list = list.filter((t) => t.asset.toLowerCase().includes(q));
    }
    if (filterDirection !== "all") list = list.filter((t) => t.direction === filterDirection);
    if (filterOutcome !== "all" && filterStatus !== "open") {
      list = list.filter((t) => {
        const pnl = computePnL(t);
        if (!pnl) return false;
        if (filterOutcome === "winners") return pnl.pnlDollars >= 0;
        return pnl.pnlDollars < 0;
      });
    }
    if (dateFrom) list = list.filter((t) => t.entryDate >= dateFrom);
    if (dateTo) list = list.filter((t) => (t.exitDate || t.entryDate) <= dateTo);
    if (sortBy === "date") list.sort((a, b) => (b.entryDate + b.id).localeCompare(a.entryDate + a.id));
    else if (sortBy === "asset") list.sort((a, b) => a.asset.localeCompare(b.asset));
    else if (sortBy === "pnl") {
      list.sort((a, b) => {
        const pa = computePnL(a)?.pnlDollars ?? -Infinity;
        const pb = computePnL(b)?.pnlDollars ?? -Infinity;
        return pb - pa;
      });
    }
    return list;
  }, [displayTrades, filterStatus, filterAsset, filterDirection, filterOutcome, dateFrom, dateTo, sortBy]);

  const closedTrades = useMemo(() => displayTrades.filter((t) => t.exitPrice != null), [displayTrades]);
  const analyticsTrades = useMemo(() => closedTrades.slice(0, 100), [closedTrades]);

  const stats = useMemo(() => {
    const total = displayTrades.length;
    const closed = closedTrades.length;
    const winners = closedTrades.filter((t) => (computePnL(t)?.pnlDollars ?? 0) >= 0).length;
    const winRate = closed > 0 ? (winners / closed) * 100 : 0;
    let totalPnl = 0;
    let sumReturn = 0;
    let countReturn = 0;
    closedTrades.forEach((t) => {
      const p = computePnL(t);
      if (p) {
        totalPnl += p.pnlDollars;
        sumReturn += p.pnlPercent;
        countReturn += 1;
      }
    });
    const avgReturn = countReturn > 0 ? sumReturn / countReturn : 0;
    return { total, closed, winRate, totalPnl, avgReturn, winners, losers: closed - winners };
  }, [displayTrades, closedTrades]);

  const cumulativeData = useMemo(() => {
    const sorted = [...closedTrades].sort((a, b) => (a.exitDate || a.entryDate).localeCompare(b.exitDate || b.entryDate));
    let running = 0;
    return sorted.map((t) => {
      const p = computePnL(t);
      if (p) running += p.pnlDollars;
      return { date: t.exitDate || t.entryDate, pnl: running, label: t.exitDate?.slice(0, 10) || t.entryDate.slice(0, 10) };
    });
  }, [closedTrades]);

  const pnlByAsset = useMemo(() => {
    const map = new Map<string, number>();
    closedTrades.forEach((t) => {
      const p = computePnL(t);
      if (p) map.set(t.asset, (map.get(t.asset) ?? 0) + p.pnlDollars);
    });
    return Array.from(map.entries())
      .map(([asset, pnl]) => ({ asset, pnl }))
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 10);
  }, [closedTrades]);

  const bestWorst = useMemo(() => {
    const withPnl = closedTrades
      .map((t) => ({ trade: t, pnl: computePnL(t) }))
      .filter((x): x is { trade: JournalTrade; pnl: { pnlDollars: number; pnlPercent: number; optionPl: number | null } } => x.pnl != null);
    if (withPnl.length === 0) return { best: null, worst: null };
    const sorted = [...withPnl].sort((a, b) => b.pnl.pnlDollars - a.pnl.pnlDollars);
    return { best: sorted[0] ?? null, worst: sorted[sorted.length - 1] ?? null };
  }, [closedTrades]);

  const patterns = useMemo(() => {
    const byStrategy = new Map<string, { wins: number; total: number; pnl: number }>();
    closedTrades.forEach((t) => {
      const p = computePnL(t);
      if (!p) return;
      const cur = byStrategy.get(t.strategy) ?? { wins: 0, total: 0, pnl: 0 };
      cur.total += 1;
      cur.pnl += p.pnlDollars;
      if (p.pnlDollars >= 0) cur.wins += 1;
      byStrategy.set(t.strategy, cur);
    });
    let bestStrategy = "—";
    let bestRate = 0;
    byStrategy.forEach((v, k) => {
      if (v.total >= 2 && v.wins / v.total > bestRate) {
        bestRate = v.wins / v.total;
        bestStrategy = k;
      }
    });

    const byDay = new Map<number, { wins: number; total: number }>();
    closedTrades.forEach((t) => {
      const d = new Date(t.entryDate).getDay();
      const cur = byDay.get(d) ?? { wins: 0, total: 0 };
      cur.total += 1;
      const p = computePnL(t);
      if (p && p.pnlDollars >= 0) cur.wins += 1;
      byDay.set(d, cur);
    });
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    let bestDay = "—";
    let bestDayRate = 0;
    byDay.forEach((v, d) => {
      if (v.total >= 1 && v.wins / v.total > bestDayRate) {
        bestDayRate = v.wins / v.total;
        bestDay = days[d];
      }
    });

    let totalHoldMs = 0;
    let holdCount = 0;
    closedTrades.forEach((t) => {
      if (t.exitDate) {
        totalHoldMs += new Date(t.exitDate).getTime() - new Date(t.entryDate).getTime();
        holdCount += 1;
      }
    });
    const avgHoldDays = holdCount > 0 ? totalHoldMs / holdCount / (24 * 60 * 60 * 1000) : 0;

    const longPnl = closedTrades.filter((t) => t.direction === "LONG").reduce((s, t) => s + (computePnL(t)?.pnlDollars ?? 0), 0);
    const shortPnl = closedTrades.filter((t) => t.direction === "SHORT").reduce((s, t) => s + (computePnL(t)?.pnlDollars ?? 0), 0);

    return { bestStrategy, bestDay, avgHoldDays, longPnl, shortPnl };
  }, [closedTrades]);

  const fetchInsights = useCallback(async (forceRefresh = false) => {
    if (displayTrades.length < 5) return;
    setInsightsLoading(true);
    setInsightsError(null);
    if (forceRefresh) insightsCacheRef.current = null;
    try {
      const cached = insightsCacheRef.current;
      if (!forceRefresh && cached && Date.now() - cached.at < INSIGHTS_CACHE_TTL_MS) {
        setInsights(cached.data);
        setInsightsLoading(false);
        return;
      }
      const last20 = displayTrades.slice(0, 20);
      const userMessage = `Analyze my trading journal:
Total trades: ${displayTrades.length}
Win rate: ${stats.winRate.toFixed(1)}%
Total P&L: $${stats.totalPnl.toFixed(2)}
Average return: ${stats.avgReturn.toFixed(2)}%
Best trade: ${bestWorst.best ? `${bestWorst.best.trade.asset} +${bestWorst.best.pnl.pnlPercent.toFixed(2)}%` : "—"}
Worst trade: ${bestWorst.worst ? `${bestWorst.worst.trade.asset} ${bestWorst.worst.pnl.pnlPercent.toFixed(2)}%` : "—"}
Most used strategy: ${displayTrades.length ? (() => { const m = new Map<string, number>(); displayTrades.forEach(t => m.set(t.strategy, (m.get(t.strategy) ?? 0) + 1)); let max = 0, out = ""; m.forEach((c, s) => { if (c > max) { max = c; out = s; } }); return out; })() : "—"}
Trades data: ${JSON.stringify(last20)}`;

      const res = await fetch("/api/journal-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || res.statusText);
      }
      const data = (await res.json()) as JournalInsightsResponse;
      setInsights(data);
      insightsCacheRef.current = { data, at: Date.now() };
    } catch (e) {
      setInsightsError(e instanceof Error ? e.message : "Failed to load insights");
    } finally {
      setInsightsLoading(false);
    }
  }, [displayTrades, stats.winRate, stats.totalPnl, stats.avgReturn, bestWorst]);

  useEffect(() => {
    if (activeTab === "insights" && displayTrades.length >= 5 && !insights && !insightsLoading && !insightsError) {
      queueMicrotask(() => fetchInsights());
    }
  }, [activeTab, displayTrades.length, insights, insightsLoading, insightsError, fetchInsights]);

  const handleDelete = useCallback(async (id: string) => {
    const isLocalId = id.startsWith("tj_");
    if (isLocalId) {
      deleteTrade(id);
      setFailedLocalTrades((prev) => prev.filter((t) => t.id !== id));
      setTrades((prev) => prev.filter((t) => t.id !== id));
      if (insights) setInsights(null);
      toast.showToast("Trade deleted", "info");
      return;
    }
    try {
      const res = await fetch(`/api/trades?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) {
        setTrades((prev) => prev.filter((t) => t.id !== id));
        if (insights) setInsights(null);
        toast.showToast("Trade deleted", "info");
      } else {
        toast.showToast("Delete failed", "error");
      }
    } catch {
      toast.showToast("Delete failed", "error");
    }
  }, [insights, toast]);

  const tabs: { id: TabId; label: string }[] = [
    { id: "trades", label: `My Trades (${displayTrades.length})` },
    { id: "analytics", label: "Analytics" },
    { id: "insights", label: "AI Insights" },
  ];

  const tradesByDate = useMemo(() => {
    const map = new Map<string, JournalTrade[]>();
    filteredTrades.forEach((t) => {
      const key = t.entryDate.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return map;
  }, [filteredTrades]);

  const [calYear, calMonth] = useMemo(() => {
    const [y, m] = calendarMonth.split("-").map(Number);
    return [y, m - 1];
  }, [calendarMonth]);

  const calendarDays = useMemo(() => getCalendarDays(calYear, calMonth), [calYear, calMonth]);

  return (
    <div className="journal-page min-h-screen font-[&quot;Times_New_Roman&quot;,serif]" style={{ backgroundColor: BG }}>
      <div className="mx-auto max-w-6xl px-6 py-8 lg:px-8 lg:py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
            Trade Journal
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Log trades, track performance, and get AI-powered insights.
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-white/10">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="relative px-4 py-3 text-sm font-medium transition-colors"
                style={{
                  color: activeTab === tab.id ? "var(--accent-color)" : "var(--app-text-muted, #71717a)",
                }}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full transition-all"
                    style={{ backgroundColor: "var(--accent-color)" }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* My Trades */}
        {activeTab === "trades" && (
          <div className="mt-6">
            {tradesLoading ? (
              <div className="space-y-3">
                <div className="h-10 w-48 animate-pulse rounded-lg bg-white/10" />
                <div className="grid gap-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex h-14 animate-pulse items-center gap-4 rounded-xl bg-white/5 px-4">
                      <div className="h-4 w-20 rounded bg-white/10" />
                      <div className="h-4 w-16 rounded bg-white/10" />
                      <div className="h-4 flex-1 rounded bg-white/10" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
            <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as "all" | "open" | "closed")}
                  className="rounded-lg border border-white/10 bg-[#0F1520] px-3 py-1.5 text-xs text-zinc-200"
                >
                  <option value="all">All</option>
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </select>
                <input
                  type="text"
                  placeholder="Filter by asset"
                  value={filterAsset}
                  onChange={(e) => setFilterAsset(e.target.value)}
                  className="w-32 rounded-lg border border-white/10 bg-[#0F1520] px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500"
                />
                <select
                  value={filterDirection}
                  onChange={(e) => setFilterDirection(e.target.value as "all" | "LONG" | "SHORT")}
                  className="rounded-lg border border-white/10 bg-[#0F1520] px-3 py-1.5 text-xs text-zinc-200"
                >
                  <option value="all">All</option>
                  <option value="LONG">Long</option>
                  <option value="SHORT">Short</option>
                </select>
                <select
                  value={filterOutcome}
                  onChange={(e) => setFilterOutcome(e.target.value as "all" | "winners" | "losers")}
                  className="rounded-lg border border-white/10 bg-[#0F1520] px-3 py-1.5 text-xs text-zinc-200"
                >
                  <option value="all">All</option>
                  <option value="winners">Winners</option>
                  <option value="losers">Losers</option>
                </select>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="rounded-lg border border-white/10 bg-[#0F1520] px-3 py-1.5 text-xs text-zinc-200"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="rounded-lg border border-white/10 bg-[#0F1520] px-3 py-1.5 text-xs text-zinc-200"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                setEditingTrade(null);
                setModalOpen(true);
              }}
                className="shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold text-[#020308] transition hover:opacity-90"
                style={{ backgroundColor: "var(--accent-color)" }}
              >
                Log a trade
              </button>
            </div>

            {filteredTrades.length === 0 ? (
              <div className="mt-16 flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-white/[0.02] py-16 text-center">
                <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-white/5 text-4xl">
                  📓
                </div>
                <p className="text-lg font-medium text-zinc-200">Start logging your trades</p>
                <p className="mt-2 max-w-sm text-sm text-zinc-400">
                  Track every entry and exit to understand your performance over time.
                </p>
                <button
                  type="button"
                  onClick={() => {
                  setEditingTrade(null);
                  setModalOpen(true);
                }}
                  className="mt-6 rounded-full px-6 py-2.5 text-sm font-semibold text-[#020308] transition hover:opacity-90"
                  style={{ backgroundColor: "var(--accent-color)" }}
                >
                  Log your first trade
                </button>
              </div>
            ) : (
              <div className="mt-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-zinc-200">
                    {new Date(calYear, calMonth, 1).toLocaleString("default", { month: "long", year: "numeric" })}
                  </h2>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(calYear, calMonth - 1, 1);
                        setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
                      }}
                      className="rounded-lg border border-white/10 bg-[#0F1520] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
                    >
                      ← Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(calYear, calMonth + 1, 1);
                        setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
                      }}
                      className="rounded-lg border border-white/10 bg-[#0F1520] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
                    >
                      Next →
                    </button>
                  </div>
                </div>
                <div className="rounded-xl border border-white/5 overflow-hidden">
                  <div className="grid grid-cols-7 border-b border-white/10 bg-white/5">
                    {WEEKDAYS.map((w) => (
                      <div key={w} className="p-2 text-center text-[10px] font-medium uppercase text-zinc-500">
                        {w}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {calendarDays.map((cell) => {
                      const dayTrades = (tradesByDate.get(cell.date) ?? []).slice(0, MAX_TRADES_PER_DAY);
                      const hasMore = (tradesByDate.get(cell.date)?.length ?? 0) > MAX_TRADES_PER_DAY;
                      return (
                        <div
                          key={cell.date}
                          className={`min-h-[100px] border-b border-r border-white/5 p-1.5 last:border-r-0 ${!cell.isCurrentMonth ? "bg-white/[0.02]" : ""}`}
                        >
                          <p className={`text-right text-[11px] font-medium ${cell.isCurrentMonth ? "text-zinc-400" : "text-zinc-600"}`}>
                            {cell.day}
                          </p>
                          <ul className="mt-1 space-y-0.5">
                            {dayTrades.map((t) => {
                              const pnl = computePnL(t);
                              const entryDateOnly = t.entryDate.slice(0, 10);
                              const today = new Date().toISOString().slice(0, 10);
                              const canEdit = entryDateOnly <= today;
                              return (
                                <li key={t.id} className="group flex items-center justify-between gap-0.5 rounded bg-white/5 px-1 py-0.5 text-[10px]">
                                  <span className="flex items-center gap-1 truncate">
                                    <span className="font-medium text-[var(--accent-color)]">{t.asset}</span>
                                    {t.exitPrice == null && (
                                      <span className="shrink-0 rounded bg-blue-500/20 px-1 py-0.5 text-[9px] font-medium text-blue-400">Open</span>
                                    )}
                                  </span>
                                  <span className={`shrink-0 ${pnl != null ? (pnl.pnlDollars >= 0 ? "text-emerald-400" : "text-red-400") : "text-zinc-500"}`}>
                                    {pnl != null
                                      ? formatCurrency(pnl.pnlDollars)
                                      : (() => {
                                          const cur = openPrices[t.asset.trim().toUpperCase()];
                                          if (cur == null) return "—";
                                          const mult = t.direction === "LONG" ? 1 : -1;
                                          const un = (cur - t.entryPrice) * mult * t.positionSize;
                                          return (
                                            <span className={un >= 0 ? "text-emerald-400" : "text-red-400"}>
                                              Unreal. {formatCurrency(un)}
                                            </span>
                                          );
                                        })()}
                                  </span>
                                  <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                                    {canEdit && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingTrade(t);
                                          setModalOpen(true);
                                        }}
                                        className="rounded p-0.5 text-zinc-500 hover:bg-[var(--accent-color)]/20 hover:text-[var(--accent-color)]"
                                        aria-label="Edit trade"
                                      >
                                        ✏
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(t.id)}
                                      className="rounded p-0.5 text-zinc-500 hover:bg-red-500/20 hover:text-red-400"
                                      aria-label="Delete"
                                    >
                                      🗑
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                          {hasMore && (
                            <p className="mt-0.5 text-[9px] text-zinc-500">
                              +{(tradesByDate.get(cell.date)?.length ?? 0) - MAX_TRADES_PER_DAY} more
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            </>
            )}
          </div>
        )}

        {/* Analytics */}
        {activeTab === "analytics" && (
          <div className="mt-6 space-y-8">
            {analyticsTrades.length < 3 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-white/[0.02] py-16 text-center">
                <p className="text-lg font-medium text-zinc-200">Log more trades to see analytics</p>
                <p className="mt-2 text-sm text-zinc-400">Close at least 3 trades to unlock charts and patterns.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab("trades")}
                  className="mt-6 rounded-full border border-white/10 px-5 py-2 text-sm font-medium text-zinc-300 hover:bg-white/5"
                >
                  Go to My Trades
                </button>
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Total Trades</p>
                    <p className="mt-1 text-2xl font-semibold text-zinc-100">{stats.total}</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Win Rate</p>
                    <p className="mt-1 text-2xl font-semibold text-zinc-100">{stats.winRate.toFixed(1)}%</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Total P&L</p>
                    <p className={`mt-1 text-2xl font-semibold ${stats.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {formatCurrency(stats.totalPnl)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Avg Return / Trade</p>
                    <p className={`mt-1 text-2xl font-semibold ${stats.avgReturn >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {formatPercent(stats.avgReturn)}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <h3 className="mb-4 text-sm font-semibold text-zinc-200">Cumulative P&L</h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={cumulativeData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                        <XAxis dataKey="label" tick={{ fill: "#71717a", fontSize: 10 }} stroke={GRID_COLOR} />
                        <YAxis tick={{ fill: "#71717a", fontSize: 10 }} stroke={GRID_COLOR} tickFormatter={(v) => `$${v}`} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#0F1520", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                          labelStyle={{ color: "#a1a1aa" }}
                          formatter={(value: unknown) => [formatCurrency(Number(value ?? 0)), "P&L"]}
                        />
                        <Line type="monotone" dataKey="pnl" stroke="var(--accent-color)" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <h3 className="mb-4 text-sm font-semibold text-zinc-200">Win / Loss</h3>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[{ name: "Winners", count: stats.winners, fill: "#34d399" }, { name: "Losers", count: stats.losers, fill: "#f87171" }]}>
                          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                          <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 10 }} stroke={GRID_COLOR} />
                          <YAxis tick={{ fill: "#71717a", fontSize: 10 }} stroke={GRID_COLOR} />
                          <Bar dataKey="count" radius={4} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <h3 className="mb-4 text-sm font-semibold text-zinc-200">P&L by Asset</h3>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={pnlByAsset} layout="vertical" margin={{ left: 40 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                          <XAxis type="number" tick={{ fill: "#71717a", fontSize: 10 }} stroke={GRID_COLOR} tickFormatter={(v) => `$${v}`} />
                          <YAxis type="category" dataKey="asset" width={50} tick={{ fill: "#71717a", fontSize: 10 }} stroke={GRID_COLOR} />
                          <Bar dataKey="pnl" radius={4}>
                            {pnlByAsset.map((_, i) => (
                              <Cell key={i} fill={pnlByAsset[i].pnl >= 0 ? "#34d399" : "#f87171"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {bestWorst.best && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                      <p className="text-xs font-medium uppercase tracking-wider text-emerald-400/80">Best trade</p>
                      <p className="mt-1 font-semibold text-zinc-100">{bestWorst.best.trade.asset}</p>
                      <p className="text-emerald-400">{formatPercent(bestWorst.best.pnl.pnlPercent)} · {formatCurrency(bestWorst.best.pnl.pnlDollars)}</p>
                    </div>
                  )}
                  {bestWorst.worst && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                      <p className="text-xs font-medium uppercase tracking-wider text-red-400/80">Worst trade</p>
                      <p className="mt-1 font-semibold text-zinc-100">{bestWorst.worst.trade.asset}</p>
                      <p className="text-red-400">{formatPercent(bestWorst.worst.pnl.pnlPercent)} · {formatCurrency(bestWorst.worst.pnl.pnlDollars)}</p>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <h3 className="mb-4 text-sm font-semibold text-zinc-200">Patterns</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                    <div>
                      <p className="text-xs text-zinc-500">Best strategy</p>
                      <p className="font-medium text-zinc-200">{patterns.bestStrategy}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Best day of week</p>
                      <p className="font-medium text-zinc-200">{patterns.bestDay}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Avg hold time</p>
                      <p className="font-medium text-zinc-200">{patterns.avgHoldDays.toFixed(1)} days</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Long vs Short P&L</p>
                      <p className="font-medium text-zinc-200">
                        Long {formatCurrency(patterns.longPnl)} · Short {formatCurrency(patterns.shortPnl)}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* AI Insights */}
        {activeTab === "insights" && (
          <div className="mt-6">
            {displayTrades.length < 5 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-white/[0.02] py-16 text-center">
                <p className="text-lg font-medium text-zinc-200">Log at least 5 trades to unlock AI insights</p>
                <div className="mt-4 w-64 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (displayTrades.length / 5) * 100)}%`,
                      backgroundColor: "var(--accent-color)",
                    }}
                  />
                </div>
                <p className="mt-2 text-sm text-zinc-400">{displayTrades.length}/5 trades logged</p>
              </div>
            ) : insightsLoading ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-white/[0.02] py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-color)] border-t-transparent" />
                <p className="mt-4 text-sm text-zinc-400">Analyzing your {displayTrades.length} trades...</p>
              </div>
            ) : insightsError ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center">
                <p className="text-red-400">{insightsError}</p>
                <button
                  type="button"
                  onClick={() => fetchInsights()}
                  className="mt-4 rounded-full bg-[var(--accent-color)] px-5 py-2 text-sm font-semibold text-[#020308]"
                >
                  Retry
                </button>
              </div>
            ) : insights ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-zinc-100">Your analysis</h2>
                  <button
                    type="button"
                    onClick={() => fetchInsights(true)}
                    className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/5"
                  >
                    Re-analyze my trades
                  </button>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center">
                  <span
                    className={`inline-block text-5xl font-bold ${insights.overallGrade.startsWith("A") ? "text-emerald-400" : insights.overallGrade.startsWith("B") ? "text-blue-400" : insights.overallGrade.startsWith("C") ? "text-amber-400" : "text-red-400"}`}
                  >
                    {insights.overallGrade}
                  </span>
                  <p className="mt-2 text-sm text-zinc-400">{insights.gradeSummary}</p>
                </div>

                <section>
                  <h3 className="mb-2 text-sm font-semibold text-zinc-200">Strengths</h3>
                  <ul className="space-y-1">
                    {insights.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                        <span className="text-emerald-400">✓</span> {s}
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h3 className="mb-2 text-sm font-semibold text-zinc-200">Weaknesses</h3>
                  <ul className="space-y-1">
                    {insights.weaknesses.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                        <span className="text-amber-400">⚠</span> {w}
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h3 className="mb-2 text-sm font-semibold text-zinc-200">Patterns noticed</h3>
                  <ul className="space-y-1">
                    {insights.patterns.map((p, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                        <span className="text-blue-400">ℹ</span> {p}
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h3 className="mb-2 text-sm font-semibold text-zinc-200">Action items</h3>
                  <ol className="list-inside list-decimal space-y-1 text-sm text-zinc-300">
                    {insights.actionItems.map((a, i) => (
                      <li key={i}>
                        <span style={{ color: "var(--accent-color)" }}>{i + 1}.</span> {a}
                      </li>
                    ))}
                  </ol>
                </section>

                <div className="rounded-xl border-l-4 border-amber-500/60 bg-amber-500/5 p-4">
                  <h3 className="text-sm font-semibold text-zinc-200">Risk assessment</h3>
                  <p className="mt-1 text-sm text-zinc-300">{insights.riskAssessment}</p>
                </div>

                <div className="rounded-xl border-2 p-4" style={{ borderColor: "var(--accent-color)", borderImage: "linear-gradient(to right, var(--accent-color), #6366f1) 1" }}>
                  <p className="text-lg">🎯</p>
                  <h3 className="mt-1 text-sm font-semibold text-zinc-200">Coaching tip</h3>
                  <p className="mt-1 text-sm text-zinc-300">{insights.coachingTip}</p>
                </div>

                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
                  <p className="text-lg">💪</p>
                  <h3 className="mt-1 text-sm font-semibold text-zinc-200">Weekly challenge</h3>
                  <p className="mt-1 text-sm text-zinc-300">{insights.weeklyChallenge}</p>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {modalOpen && (
        <LogTradeModal
          initialTrade={editingTrade}
          onClose={() => {
            setModalOpen(false);
            setEditingTrade(null);
          }}
          onSaved={(savedTrade) => {
            if (savedTrade) {
              if (editingTrade) {
                setTrades((prev) => prev.map((t) => (t.id === editingTrade.id ? savedTrade : t)));
                if (editingTrade.id.startsWith("tj_")) {
                  setFailedLocalTrades((prev) => prev.filter((t) => t.id !== editingTrade.id));
                }
              } else {
                setTrades((prev) => [savedTrade, ...prev]);
              }
            }
            setModalOpen(false);
            setEditingTrade(null);
            if (savedTrade) toast.showToast("Trade saved", "info");
          }}
          onSaveFailed={(localTrade) => {
            setFailedLocalTrades((prev) => [...prev, localTrade]);
            setModalOpen(false);
            setEditingTrade(null);
            toast.showToast("Save failed — trade kept locally", "error");
          }}
        />
      )}

      {failedLocalTrades.length > 0 && (
        <div className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200 shadow-lg">
          <span>{failedLocalTrades.length} trade(s) saved locally. Save to cloud?</span>
          <button
            type="button"
            onClick={async () => {
              for (const t of [...failedLocalTrades]) {
                const body: Record<string, unknown> = {
                  asset: t.asset,
                  direction: t.direction,
                  entry_price: t.entryPrice,
                  exit_price: t.exitPrice,
                  position_size: t.positionSize,
                  entry_date: t.entryDate.slice(0, 10),
                  exit_date: t.exitDate ? t.exitDate.slice(0, 10) : null,
                  strategy: t.strategy,
                  notes: t.notes,
                  tags: t.tags,
                };
                if (t.pnlDollars != null || t.pnlPercent != null) {
                  body.pnl_dollars = t.pnlDollars ?? undefined;
                  body.pnl_percent = t.pnlPercent ?? undefined;
                }
                const res = await fetch("/api/trades", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                if (res.ok) {
                  const saved = (await res.json()) as JournalTrade;
                  setTrades((prev) => [saved, ...prev]);
                  setFailedLocalTrades((prev) => prev.filter((x) => x.id !== t.id));
                  deleteTrade(t.id);
                }
              }
            }}
            className="rounded bg-amber-500 px-3 py-1 text-sm font-medium text-black hover:bg-amber-400"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

function LogTradeModal({
  initialTrade,
  onClose,
  onSaved,
  onSaveFailed,
}: {
  initialTrade: JournalTrade | null;
  onClose: () => void;
  onSaved: (savedTrade?: JournalTrade) => void;
  onSaveFailed?: (localTrade: JournalTrade) => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [asset, setAsset] = useState("");
  const [direction, setDirection] = useState<Direction>("LONG");
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [exitDate, setExitDate] = useState("");
  const [positionSize, setPositionSize] = useState("");
  const [strategy, setStrategy] = useState<Strategy>("Momentum");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [optionPl, setOptionPl] = useState("");
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [currentPriceLoading, setCurrentPriceLoading] = useState(false);
  const [manualOutcome, setManualOutcome] = useState(false);
  const [manualPnlDollars, setManualPnlDollars] = useState("");
  const [manualPnlPercent, setManualPnlPercent] = useState("");

  useEffect(() => {
    const sym = asset.trim().toUpperCase();
    if (sym.length < 2) {
      setCurrentPrice(null);
      return;
    }
    setCurrentPriceLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/ticker-quote?ticker=${encodeURIComponent(sym)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => setCurrentPrice(d?.price ?? null))
        .catch(() => setCurrentPrice(null))
        .finally(() => setCurrentPriceLoading(false));
    }, 400);
    return () => clearTimeout(t);
  }, [asset]);

  useEffect(() => {
    if (initialTrade) {
      setAsset(initialTrade.asset);
      setDirection(initialTrade.direction);
      setEntryPrice(initialTrade.entryPrice.toString());
      setExitPrice(initialTrade.exitPrice != null ? initialTrade.exitPrice.toString() : "");
      setEntryDate(initialTrade.entryDate.slice(0, 10));
      setExitDate(initialTrade.exitDate ? initialTrade.exitDate.slice(0, 10) : "");
      setPositionSize(initialTrade.positionSize.toString());
      setStrategy(initialTrade.strategy);
      setNotes(initialTrade.notes);
      setTags(initialTrade.tags.join(" "));
      setOptionPl(initialTrade.optionPl != null ? initialTrade.optionPl.toString() : "");
      const hasManual = initialTrade.pnlDollars != null || initialTrade.pnlPercent != null;
      setManualOutcome(hasManual);
      setManualPnlDollars(initialTrade.pnlDollars != null ? Number(initialTrade.pnlDollars).toFixed(2) : "");
      setManualPnlPercent(initialTrade.pnlPercent != null ? Number(initialTrade.pnlPercent).toFixed(2) : "");
    } else {
      setAsset("");
      setDirection("LONG");
      setEntryPrice("");
      setExitPrice("");
      setEntryDate(new Date().toISOString().slice(0, 10));
      setExitDate("");
      setPositionSize("");
      setStrategy("Momentum");
      setNotes("");
      setTags("");
      setOptionPl("");
      setManualOutcome(false);
      setManualPnlDollars("");
      setManualPnlPercent("");
    }
  }, [initialTrade]);

  const exitNum = exitPrice === "" ? null : parseFloat(exitPrice);
  const entryNum = parseFloat(entryPrice);
  const sizeNum = parseFloat(positionSize);
  const optionPlNum = optionPl === "" ? null : parseFloat(optionPl);
  const manualPnlDollarsNum = manualPnlDollars === "" ? null : parseFloat(manualPnlDollars);
  const manualPnlPercentNum = manualPnlPercent === "" ? null : parseFloat(manualPnlPercent);
  const pnl = useMemo(() => {
    if (manualOutcome) {
      if (Number.isFinite(manualPnlDollarsNum) || Number.isFinite(manualPnlPercentNum)) {
        const cost = entryNum * sizeNum;
        const dollars = manualPnlDollarsNum ?? (cost !== 0 && manualPnlPercentNum != null ? (manualPnlPercentNum / 100) * cost : 0);
        const percent = manualPnlPercentNum ?? (cost !== 0 ? (dollars / cost) * 100 : 0);
        return {
          pnlDollars: Math.round(dollars * 100) / 100,
          pnlPercent: Math.round(percent * 100) / 100,
        };
      }
      return null;
    }
    let pnlDollars = 0;
    let pnlPercent = 0;
    if (exitNum != null && Number.isFinite(entryNum) && Number.isFinite(sizeNum) && entryNum !== 0) {
      const mult = direction === "LONG" ? 1 : -1;
      pnlDollars = (exitNum - entryNum) * mult * sizeNum;
      pnlPercent = ((exitNum - entryNum) / entryNum) * 100 * mult;
    }
    if (optionPlNum != null && Number.isFinite(optionPlNum)) pnlDollars += optionPlNum;
    if (pnlDollars === 0 && pnlPercent === 0 && optionPlNum == null) return null;
    return {
      pnlDollars: Math.round(pnlDollars * 100) / 100,
      pnlPercent: Math.round(pnlPercent * 100) / 100,
    };
  }, [exitNum, entryNum, sizeNum, direction, optionPlNum, manualOutcome, manualPnlDollarsNum, manualPnlPercentNum]);

  const manualPnlPayload = useMemo(() => {
    if (!manualOutcome || (!Number.isFinite(manualPnlDollarsNum) && !Number.isFinite(manualPnlPercentNum))) return null;
    const cost = entryNum * sizeNum;
    const dollars = manualPnlDollarsNum ?? (cost !== 0 && manualPnlPercentNum != null ? (manualPnlPercentNum / 100) * cost : undefined);
    const percent = manualPnlPercentNum ?? (cost !== 0 && dollars !== undefined ? (dollars / cost) * 100 : undefined);
    return {
      pnl_dollars: dollars !== undefined ? Math.round(dollars * 100) / 100 : undefined,
      pnl_percent: percent !== undefined ? Math.round(percent * 100) / 100 : undefined,
    };
  }, [manualOutcome, manualPnlDollarsNum, manualPnlPercentNum, entryNum, sizeNum]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset.trim() || !Number.isFinite(entryNum) || entryNum <= 0 || !Number.isFinite(sizeNum) || sizeNum <= 0) return;
    const input: JournalTradeInput = {
      asset: asset.trim().toUpperCase(),
      direction,
      entryPrice: entryNum,
      exitPrice: exitNum ?? null,
      entryDate: new Date(entryDate).toISOString(),
      exitDate: exitDate ? new Date(exitDate).toISOString() : null,
      positionSize: sizeNum,
      strategy,
      notes: notes.trim(),
      tags: tags.split(/[\s,#]+/).filter(Boolean).map((t) => t.trim()),
      optionPl: optionPlNum,
      ...(manualPnlPayload && {
        pnlDollars: manualPnlPayload.pnl_dollars,
        pnlPercent: manualPnlPayload.pnl_percent,
      }),
    };
    setSaving(true);
    try {
      if (initialTrade) {
        const isLocalId = initialTrade.id.startsWith("tj_");
        if (isLocalId) {
          const body: Record<string, unknown> = {
            asset: input.asset,
            direction: input.direction,
            entry_price: input.entryPrice,
            exit_price: input.exitPrice,
            position_size: input.positionSize,
            entry_date: input.entryDate.slice(0, 10),
            exit_date: input.exitDate ? input.exitDate.slice(0, 10) : null,
            strategy: input.strategy,
            notes: input.notes,
            tags: input.tags,
          };
          if (manualPnlPayload) {
            body.pnl_dollars = manualPnlPayload.pnl_dollars;
            body.pnl_percent = manualPnlPayload.pnl_percent;
          }
          const res = await fetch("/api/trades", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          if (res.ok) {
            const saved = (await res.json()) as JournalTrade;
            deleteTrade(initialTrade.id);
            onSaved(saved);
          } else {
            throw new Error("Save failed");
          }
        } else {
          const putBody: Record<string, unknown> = {
            id: initialTrade.id,
            asset: input.asset,
            direction: input.direction,
            entry_price: input.entryPrice,
            exit_price: input.exitPrice,
            position_size: input.positionSize,
            entry_date: input.entryDate.slice(0, 10),
            exit_date: input.exitDate ? input.exitDate.slice(0, 10) : null,
            strategy: input.strategy,
            notes: input.notes,
            tags: input.tags,
          };
          if (manualPnlPayload) {
            putBody.pnl_dollars = manualPnlPayload.pnl_dollars;
            putBody.pnl_percent = manualPnlPayload.pnl_percent;
          }
          const res = await fetch("/api/trades", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(putBody),
          });
          if (res.ok) {
            const saved = (await res.json()) as JournalTrade;
            onSaved(saved);
          } else {
            throw new Error("Save failed");
          }
        }
      } else {
        const body: Record<string, unknown> = {
          asset: input.asset,
          direction: input.direction,
          entry_price: input.entryPrice,
          exit_price: input.exitPrice,
          position_size: input.positionSize,
          entry_date: input.entryDate.slice(0, 10),
          exit_date: input.exitDate ? input.exitDate.slice(0, 10) : null,
          strategy: input.strategy,
          notes: input.notes,
          tags: input.tags,
        };
        if (manualPnlPayload) {
          body.pnl_dollars = manualPnlPayload.pnl_dollars;
          body.pnl_percent = manualPnlPayload.pnl_percent;
        }
        const res = await fetch("/api/trades", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (res.ok) {
          const saved = (await res.json()) as JournalTrade;
          const { milestone } = tickJournalStreak();
          addXPFromTrade();
          if (milestone) {
            toast.showToast(`📓 ${milestone} Day Journal Streak! Keep logging.`, "celebration");
          }
          onSaved(saved);
        } else {
          throw new Error("Save failed");
        }
      }
    } catch {
      const localTrade = initialTrade
        ? (updateTrade(initialTrade.id, input) as JournalTrade)
        : addTrade(input);
      if (!initialTrade) {
        const { milestone } = tickJournalStreak();
        addXPFromTrade();
        if (milestone) {
          toast.showToast(`📓 ${milestone} Day Journal Streak! Keep logging.`, "celebration");
        }
      }
      onSaveFailed?.(localTrade);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Log a trade"
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/10 bg-[#0F1520] shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-white/10 bg-[#0F1520] px-6 py-4">
          <h2 className="text-lg font-semibold text-zinc-100">{initialTrade ? "Edit trade" : "Log a trade"}</h2>
          <button type="button" onClick={onClose} className="rounded p-2 text-zinc-400 hover:bg-white/10 hover:text-zinc-200">
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="journal-modal space-y-4 p-6">
          <div>
            <label className="block text-xs font-medium text-zinc-400">Asset</label>
            <input
              type="text"
              value={asset}
              onChange={(e) => setAsset(e.target.value)}
              placeholder="NVDA, BTC, EUR/USD"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400">Direction</label>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setDirection("LONG")}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${direction === "LONG" ? "bg-emerald-500/30 text-emerald-300" : "bg-white/5 text-zinc-400"}`}
              >
                LONG
              </button>
              <button
                type="button"
                onClick={() => setDirection("SHORT")}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${direction === "SHORT" ? "bg-red-500/30 text-red-300" : "bg-white/5 text-zinc-400"}`}
              >
                SHORT
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400">Entry price</label>
              <input
                type="number"
                step="any"
                min="0"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100"
                required
              />
              {currentPriceLoading && <p className="mt-1 text-[10px] text-zinc-500">Loading price…</p>}
              {!currentPriceLoading && currentPrice != null && (
                <p className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
                  <span>Current price: ${currentPrice >= 1 ? currentPrice.toFixed(2) : currentPrice.toFixed(4)}</span>
                  <button
                    type="button"
                    onClick={() => setEntryPrice(currentPrice >= 1 ? currentPrice.toFixed(2) : currentPrice.toFixed(4))}
                    className="text-[var(--accent-color)] hover:underline"
                  >
                    Use current
                  </button>
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400">Exit price (optional)</label>
              <input
                type="number"
                step="any"
                min="0"
                value={exitPrice}
                onChange={(e) => setExitPrice(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100"
                placeholder="Open trade"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400">Entry date</label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400">Exit date (optional)</label>
              <input
                type="date"
                value={exitDate}
                onChange={(e) => setExitDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400">Position size</label>
            <input
              type="number"
              step="any"
              min="0"
              value={positionSize}
              onChange={(e) => setPositionSize(e.target.value)}
              placeholder="Shares/units"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400">Strategy</label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as Strategy)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#0F1520] px-3 py-2 text-sm text-zinc-100"
            >
              {STRATEGIES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400">Option P/L (optional)</label>
            <input
              type="number"
              step="any"
              value={optionPl}
              onChange={(e) => setOptionPl(e.target.value)}
              placeholder="e.g. premium P/L in $"
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#0F1520] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="manual-outcome"
              checked={manualOutcome}
              onChange={(e) => setManualOutcome(e.target.checked)}
              className="size-4 rounded border-white/30 bg-white/5 accent-[var(--accent-color)]"
            />
            <label htmlFor="manual-outcome" className="text-xs font-medium text-zinc-400">
              Manual outcome (e.g. options) — override calculated P&L
            </label>
          </div>
          {manualOutcome && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400">P&L ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={manualPnlDollars}
                  onChange={(e) => {
                    const val = e.target.value;
                    setManualPnlDollars(val);
                    const num = parseFloat(val);
                    const cost = entryNum * sizeNum;
                    if (Number.isFinite(num) && Number.isFinite(cost) && cost !== 0) {
                      setManualPnlPercent(((num / cost) * 100).toFixed(2));
                    } else if (val.trim() === "") {
                      setManualPnlPercent("");
                    }
                  }}
                  placeholder="e.g. 150 or -50"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400">P&L (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={manualPnlPercent}
                  onChange={(e) => {
                    const val = e.target.value;
                    setManualPnlPercent(val);
                    const num = parseFloat(val);
                    const cost = entryNum * sizeNum;
                    if (Number.isFinite(num) && Number.isFinite(cost) && cost !== 0) {
                      setManualPnlDollars(((num / 100) * cost).toFixed(2));
                    } else if (val.trim() === "") {
                      setManualPnlDollars("");
                    }
                  }}
                  placeholder="e.g. 12.5 or -5"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
                />
              </div>
            </div>
          )}
          {pnl != null && (
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-zinc-500">Outcome</p>
              <p className={pnl.pnlDollars >= 0 ? "text-emerald-400" : "text-red-400"}>
                {formatCurrency(pnl.pnlDollars)}
                {pnl.pnlPercent !== 0 && ` (${formatPercent(pnl.pnlPercent)})`}
              </p>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-zinc-400">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
              placeholder="Trade reasoning..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400">Tags</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="#earnings #breakout"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border border-white/10 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-full py-2.5 text-sm font-semibold text-[#020308] transition hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: "var(--accent-color)" }}
            >
              {saving ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#020308] border-t-transparent" />
                  {initialTrade ? "Saving…" : "Logging…"}
                </span>
              ) : initialTrade ? "Save changes" : "Log trade"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
