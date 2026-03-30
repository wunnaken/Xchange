"use client";

import { useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FiscalContract } from "../api/fiscalwatch/route";

// ---------------------------------------------------------------------------
// Static fiscal data — FY2025 actuals / latest available (as of early 2026)
// Sources: US Treasury, CBO, OMB Historical Tables, IMF WEO April 2025
// ---------------------------------------------------------------------------

const DEBT_PER_SECOND = 65_000; // ~$2.05T FY2025 deficit ÷ 31,557,600 sec/yr
const TOTAL_SPENDING = 7050; // FY2025 $B
const TOTAL_REVENUE = 5000; // FY2025 $B
const ANNUAL_DEFICIT = TOTAL_SPENDING - TOTAL_REVENUE; // $2,050B
const ANNUAL_INTEREST = 1200; // FY2025 $B
const US_POPULATION = 340_000_000;
const DEBT_TO_GDP = 124; // FY2025 % estimate
const US_GDP = 36_500_000_000_000 / (DEBT_TO_GDP / 100); // ~$29.44T nominal GDP, derived from known ratio

const BUDGET_ITEMS = [
  { name: "Social Security", value: 1592, color: "#3B82F6" },
  { name: "Medicare & Medicaid", value: 1610, color: "#8B5CF6" },
  { name: "Net Interest", value: 1200, color: "#EF4444" },
  { name: "Defense", value: 920, color: "#F59E0B" },
  { name: "Income Security", value: 580, color: "#10B981" },
  { name: "Veterans Benefits", value: 365, color: "#6366F1" },
  { name: "Other", value: 783, color: "#6B7280" },
];

const REVENUE_ITEMS = [
  { name: "Individual Income Tax", value: 2600, color: "#3B82F6" },
  { name: "Payroll Taxes", value: 1750, color: "#10B981" },
  { name: "Corporate Income Tax", value: 480, color: "#8B5CF6" },
  { name: "Excise & Other", value: 170, color: "#6B7280" },
];

const REVENUE_VS_SPENDING = [
  { year: "2000", revenue: 2025, spending: 1789 },
  { year: "2002", revenue: 1853, spending: 2011 },
  { year: "2004", revenue: 1880, spending: 2293 },
  { year: "2006", revenue: 2407, spending: 2655 },
  { year: "2008", revenue: 2524, spending: 2983 },
  { year: "2009", revenue: 2105, spending: 3518 },
  { year: "2010", revenue: 2163, spending: 3457 },
  { year: "2012", revenue: 2450, spending: 3537 },
  { year: "2014", revenue: 3021, spending: 3506 },
  { year: "2016", revenue: 3268, spending: 3854 },
  { year: "2018", revenue: 3329, spending: 4108 },
  { year: "2020", revenue: 3421, spending: 6552 },
  { year: "2021", revenue: 4047, spending: 6818 },
  { year: "2022", revenue: 4896, spending: 6272 },
  { year: "2023", revenue: 4439, spending: 6134 },
  { year: "2024", revenue: 4918, spending: 6751 },
  { year: "2025", revenue: 5000, spending: 7050 },
];

// National debt by year in $T — US Treasury / OMB Historical Tables
// These are accurate annual values (no FRED, no unit conversion)
const DEBT_HISTORY = [
  { year: "1940", debt: 0.05 },
  { year: "1945", debt: 0.26 },
  { year: "1950", debt: 0.26 },
  { year: "1955", debt: 0.27 },
  { year: "1960", debt: 0.29 },
  { year: "1965", debt: 0.32 },
  { year: "1970", debt: 0.38 },
  { year: "1975", debt: 0.58 },
  { year: "1980", debt: 0.91 },
  { year: "1985", debt: 1.82 },
  { year: "1990", debt: 3.21 },
  { year: "1992", debt: 4.00 },
  { year: "1994", debt: 4.64 },
  { year: "1996", debt: 5.22 },
  { year: "1998", debt: 5.53 },
  { year: "2000", debt: 5.67 },
  { year: "2002", debt: 6.23 },
  { year: "2004", debt: 7.38 },
  { year: "2006", debt: 8.51 },
  { year: "2008", debt: 10.02 },
  { year: "2009", debt: 11.91 },
  { year: "2010", debt: 13.56 },
  { year: "2011", debt: 14.79 },
  { year: "2012", debt: 16.07 },
  { year: "2013", debt: 16.74 },
  { year: "2014", debt: 17.82 },
  { year: "2015", debt: 18.15 },
  { year: "2016", debt: 19.57 },
  { year: "2017", debt: 20.24 },
  { year: "2018", debt: 21.52 },
  { year: "2019", debt: 22.72 },
  { year: "2020", debt: 27.75 },
  { year: "2021", debt: 28.43 },
  { year: "2022", debt: 30.93 },
  { year: "2023", debt: 33.17 },
  { year: "2024", debt: 35.46 },
  { year: "2025", debt: 36.5 },
];

const COUNTRY_DEBT_GDP = [
  { country: "Japan", value: 258 },
  { country: "Greece", value: 159 },
  { country: "Italy", value: 139 },
  { country: "USA", value: 124, highlight: true },
  { country: "France", value: 113 },
  { country: "Canada", value: 108 },
  { country: "UK", value: 101 },
  { country: "China", value: 90 },
  { country: "Germany", value: 66 },
  { country: "Australia", value: 54 },
];

const CREDIT_RATINGS = [
  { agency: "Moody's", rating: "Aa1", outlook: "Negative", note: "Downgraded from Aaa", changed: "May 2025" },
  { agency: "S&P", rating: "AA+", outlook: "Stable", note: "Downgraded from AAA", changed: "Aug 2011" },
  { agency: "Fitch", rating: "AA+", outlook: "Stable", note: "Downgraded from AAA", changed: "Aug 2023" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFullDebt(n: number): string {
  return "$" + Math.floor(n).toLocaleString("en-US");
}

function formatT(billions: number): string {
  return `$${(billions / 1000).toFixed(2)}T`;
}

function formatB(n: number): string {
  return `$${n.toLocaleString()}B`;
}

function fmtAmount(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtAxisB(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}T`;
  return `$${v}B`;
}

function getContractCategory(agency: string): { label: string; color: string; bg: string } {
  const a = agency.toUpperCase();
  if (a.includes("DEFENSE") || a.includes("ARMY") || a.includes("NAVY") || a.includes("AIR FORCE") || a.includes("MARINE") || a.includes("MILITARY"))
    return { label: "Defense", color: "#F59E0B", bg: "bg-amber-400/10 border-amber-400/20 text-amber-400" };
  if (a.includes("HEALTH") || a.includes("VETERAN") || a.includes("HHS"))
    return { label: "Health & VA", color: "#10B981", bg: "bg-green-400/10 border-green-400/20 text-green-400" };
  if (a.includes("ENERGY") || a.includes("TRANSPORT") || a.includes("INTERIOR") || a.includes("INFRASTRUCTURE"))
    return { label: "Infrastructure", color: "#6366F1", bg: "bg-indigo-400/10 border-indigo-400/20 text-indigo-400" };
  if (a.includes("HOMELAND") || a.includes("JUSTICE") || a.includes("STATE"))
    return { label: "Security", color: "#EF4444", bg: "bg-red-400/10 border-red-400/20 text-red-400" };
  return { label: "Federal", color: "#71717a", bg: "bg-zinc-400/10 border-zinc-400/20 text-zinc-400" };
}

// ---------------------------------------------------------------------------
// Custom Tooltips (no default white box)
// ---------------------------------------------------------------------------

function DebtTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-[#0F1520] px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-zinc-200">{label}</p>
      <p className="text-red-400">${payload[0].value.toFixed(2)}T</p>
    </div>
  );
}

function BudgetTooltip({
  active,
  payload,
  label,
  total,
}: {
  active?: boolean;
  payload?: { value: number; fill?: string }[];
  label?: string;
  total: number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-[#0F1520] px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-zinc-200">{label}</p>
      <p style={{ color: payload[0].fill ?? "#fff" }}>
        {formatB(payload[0].value)} · {((payload[0].value / total) * 100).toFixed(1)}%
      </p>
    </div>
  );
}

function RevSpendTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; fill?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-[#0F1520] px-3 py-2 text-xs shadow-xl space-y-1">
      <p className="font-semibold text-zinc-200">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.fill ?? "#fff" }}>
          {p.name}: {formatB(p.value)}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ApiData = {
  currentDebt: number;
  debtDate: string;
};

type ContractsData = { contracts: FiscalContract[] };

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FiscalWatchView() {
  const [apiData, setApiData] = useState<ApiData | null>(null);
  const [liveDebt, setLiveDebt] = useState<number | null>(null);
  const [contractsByDate, setContractsByDate] = useState<FiscalContract[] | null>(null);
  const [contractsByAmount, setContractsByAmount] = useState<FiscalContract[] | null>(null);
  const [dateLoading, setDateLoading] = useState(true);
  const [amountLoading, setAmountLoading] = useState(false);
  const [contractSort, setContractSort] = useState<"recent" | "amount">("recent");
  const seededRef = useRef(false);

  // Fetch debt data
  useEffect(() => {
    fetch("/api/fiscalwatch")
      .then((r) => r.json())
      .then((d: ApiData) => {
        setApiData(d);
        if (!seededRef.current) {
          seededRef.current = true;
          const elapsed = (Date.now() - new Date(d.debtDate).getTime()) / 1000;
          setLiveDebt(d.currentDebt + elapsed * DEBT_PER_SECOND);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch contracts sorted by date on initial load
  useEffect(() => {
    fetch("/api/fiscalwatch/contracts?sort=date")
      .then((r) => r.json())
      .then((d: ContractsData) => {
        setContractsByDate(d.contracts ?? []);
        setDateLoading(false);
      })
      .catch(() => setDateLoading(false));
  }, []);

  // Lazy-fetch amount-sorted contracts when user first selects that tab
  const handleSortChange = (sort: "recent" | "amount") => {
    setContractSort(sort);
    if (sort === "amount" && contractsByAmount === null) {
      setAmountLoading(true);
      fetch("/api/fiscalwatch/contracts?sort=amount")
        .then((r) => r.json())
        .then((d: ContractsData) => {
          setContractsByAmount(d.contracts ?? []);
          setAmountLoading(false);
        })
        .catch(() => setAmountLoading(false));
    }
  };

  const contractsLoading = contractSort === "amount" ? amountLoading : dateLoading;

  // Tick every 100ms
  useEffect(() => {
    if (liveDebt === null) return;
    const id = setInterval(() => {
      setLiveDebt((p) => (p !== null ? p + DEBT_PER_SECOND / 10 : p));
    }, 100);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveDebt === null]);

  const debtPerCitizen = liveDebt !== null ? Math.floor(liveDebt / US_POPULATION) : null;
  const liveDebtToGDP = liveDebt !== null ? ((liveDebt / US_GDP) * 100).toFixed(3) : null;
  const interestPerSecond = Math.round((ANNUAL_INTEREST * 1e9) / 31_557_600);
  const contracts = contractSort === "amount"
    ? (contractsByAmount ?? [])
    : (contractsByDate ?? []);

  return (
    <main className="app-page min-h-screen pb-16">
      <div className="mx-auto max-w-6xl px-4 pt-6 sm:pt-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-100 sm:text-3xl">FiscalWatch</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Live US national debt, federal spending, real-time government contracts, and fiscal risk indicators.
            Data: US Treasury · USASpending.gov · OMB · IMF.
          </p>
        </div>

        {/* ── 1. Live Debt Counter ── */}
        <div className="mb-6 overflow-hidden rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-950/30 via-[#0A0E1A] to-[#0A0E1A]">
          <div className="px-6 py-8 text-center sm:py-10">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-red-400/80">
              US National Debt — Live
            </p>
            {liveDebt !== null ? (
              <p className="font-mono text-3xl font-bold tracking-tight text-red-400 sm:text-4xl md:text-5xl tabular-nums">
                {formatFullDebt(liveDebt)}
              </p>
            ) : (
              <div className="mx-auto h-12 w-96 animate-pulse rounded-lg bg-white/5" />
            )}
            <p className="mt-2 text-sm text-zinc-500">
              Growing ~<span className="font-semibold text-red-400">${DEBT_PER_SECOND.toLocaleString()}</span>/second ·{" "}
              <span className="font-semibold text-red-400">${(ANNUAL_DEFICIT / 1000).toFixed(2)}T</span> deficit/year (FY2025)
            </p>
          </div>
          <div className="grid grid-cols-2 border-t border-white/5 sm:grid-cols-4">
            {[
              { label: "Debt per Citizen", value: debtPerCitizen !== null ? `$${debtPerCitizen.toLocaleString()}` : "…", sub: "per American", color: "text-red-400" },
              { label: "Debt / GDP", value: liveDebtToGDP !== null ? `${liveDebtToGDP}%` : `${DEBT_TO_GDP}%`, sub: "vs nominal GDP", color: "text-orange-400" },
              { label: "Annual Interest", value: formatT(ANNUAL_INTEREST), sub: `$${interestPerSecond.toLocaleString()}/sec`, color: "text-yellow-400" },
              { label: "Annual Deficit", value: formatT(ANNUAL_DEFICIT), sub: "FY2025 actual", color: "text-amber-400" },
            ].map((s) => (
              <div key={s.label} className="border-b border-r border-white/5 px-4 py-4 last:border-r-0 sm:border-b-0">
                <p className="text-[11px] uppercase tracking-widest text-zinc-600">{s.label}</p>
                <p className={`mt-1 text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
                <p className="text-[11px] text-zinc-600">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── 2. Live Government Contracts ── */}
        <div className="mb-6 rounded-2xl border border-white/10 bg-[#0A0E1A] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-zinc-100">Live Government Contracts</h2>
                <span className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-semibold text-green-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                  Live
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                Federal contracts ≥$10M from the last 90 days
              </p>
            </div>
            {/* Sort toggle */}
            <div className="flex rounded-lg border border-white/10 overflow-hidden text-xs font-semibold">
              <button
                type="button"
                onClick={() => handleSortChange("recent")}
                className={`px-3 py-1.5 transition ${
                  contractSort === "recent"
                    ? "bg-[var(--accent-color)] text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Most Recent
              </button>
              <button
                type="button"
                onClick={() => handleSortChange("amount")}
                className={`border-l border-white/10 px-3 py-1.5 transition ${
                  contractSort === "amount"
                    ? "bg-[var(--accent-color)] text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Largest Amount
              </button>
            </div>
          </div>

          {contractsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-white/5" />
              ))}
            </div>
          ) : contracts.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-500">
              No contract data available. USASpending.gov may be temporarily unavailable.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {contracts.map((c) => {
                const cat = getContractCategory(c.agency);
                return (
                  <div
                    key={c.id}
                    className="flex items-start gap-4 py-3 transition hover:bg-white/[0.02]"
                  >
                    {/* Amount */}
                    <div className="w-24 shrink-0 text-right">
                      <p className="font-mono text-base font-bold" style={{ color: cat.color }}>
                        {fmtAmount(c.amount)}
                      </p>
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-zinc-200">
                          {titleCase(c.recipient)}
                        </p>
                        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${cat.bg}`}>
                          {cat.label}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-zinc-500">
                        {c.agency}
                        {c.description ? ` · ${c.description}` : ""}
                      </p>
                    </div>

                    {/* Date */}
                    {c.date && (
                      <p className="shrink-0 text-[11px] text-zinc-600">
                        {new Date(c.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <p className="mt-3 text-[11px] text-zinc-700">
            Includes definitive contracts, delivery orders, BPA calls, and purchase orders. Official government data updated within 1–3 days of award.
          </p>
        </div>

        {/* ── 3. Debt History Chart ── */}
        <div className="mb-6 rounded-2xl border border-white/10 bg-[#0A0E1A] p-5">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h2 className="text-base font-semibold text-zinc-100">National Debt History</h2>
              <p className="text-xs text-zinc-500">Total public debt in trillions USD — 1940 to present · US Treasury / OMB</p>
            </div>
            <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400">
              ${DEBT_HISTORY[DEBT_HISTORY.length - 1].debt.toFixed(1)}T
            </span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={DEBT_HISTORY} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="debtGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 11, fill: "#52525b" }}
                tickLine={false}
                axisLine={false}
                interval={4}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#52525b" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `$${v.toFixed(0)}T`}
                width={46}
              />
              <Tooltip
                cursor={{ stroke: "rgba(239,68,68,0.2)", strokeWidth: 1 }}
                content={<DebtTooltip />}
              />
              <Area
                type="monotone"
                dataKey="debt"
                stroke="#EF4444"
                strokeWidth={2}
                fill="url(#debtGrad)"
                dot={false}
                activeDot={{ r: 4, fill: "#EF4444" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* ── 4. Federal Budget + Tax Revenue ── */}
        <div className="mb-6 grid gap-6 lg:grid-cols-2">

          {/* Budget breakdown */}
          <div className="rounded-2xl border border-white/10 bg-[#0A0E1A] p-5">
            <h2 className="text-base font-semibold text-zinc-100">Federal Budget FY2025</h2>
            <p className="mb-3 text-xs text-zinc-500">
              Total outlays: <span className="font-medium text-zinc-300">{formatB(TOTAL_SPENDING)}</span>
            </p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={BUDGET_ITEMS}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 0, left: 120 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: "#52525b" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `$${v}B`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#a1a1aa" }}
                  tickLine={false}
                  axisLine={false}
                  width={118}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  content={<BudgetTooltip total={TOTAL_SPENDING} />}
                />
                <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                  {BUDGET_ITEMS.map((item) => (
                    <Cell key={item.name} fill={item.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5">
              <span className="mt-0.5 text-red-400">⚠</span>
              <p className="text-xs text-zinc-400">
                <span className="font-semibold text-red-400">Interest is now the #3 budget line</span> — at{" "}
                {formatB(ANNUAL_INTEREST)}/yr it exceeds defense and is growing faster than any other category.
                It represents {((ANNUAL_INTEREST / TOTAL_SPENDING) * 100).toFixed(0)}% of total outlays.
              </p>
            </div>
          </div>

          {/* Revenue breakdown */}
          <div className="rounded-2xl border border-white/10 bg-[#0A0E1A] p-5">
            <h2 className="text-base font-semibold text-zinc-100">Tax Revenue FY2025</h2>
            <p className="mb-3 text-xs text-zinc-500">
              Total receipts: <span className="font-medium text-zinc-300">{formatB(TOTAL_REVENUE)}</span>
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={REVENUE_ITEMS}
                margin={{ top: 4, right: 8, bottom: 40, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#52525b" }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-18}
                  textAnchor="end"
                  dy={8}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#52525b" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `$${v}B`}
                  width={48}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  content={<BudgetTooltip total={TOTAL_REVENUE} />}
                />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {REVENUE_ITEMS.map((item) => (
                    <Cell key={item.name} fill={item.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wide text-zinc-600">Revenue</p>
                <p className="text-sm font-bold text-green-400">{formatT(TOTAL_REVENUE)}</p>
              </div>
              <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wide text-zinc-600">Spending</p>
                <p className="text-sm font-bold text-red-400">{formatT(TOTAL_SPENDING)}</p>
              </div>
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wide text-zinc-600">Deficit</p>
                <p className="text-sm font-bold text-red-400">−{formatT(ANNUAL_DEFICIT)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── 5. Revenue vs Spending Historical ── */}
        <div className="mb-6 rounded-2xl border border-white/10 bg-[#0A0E1A] p-5">
          <h2 className="mb-1 text-base font-semibold text-zinc-100">Revenue vs. Spending</h2>
          <p className="mb-4 text-xs text-zinc-500">
            Annual federal receipts vs. outlays in billions USD — 2000 to 2025 · US Treasury / OMB
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={REVENUE_VS_SPENDING}
              margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
              barGap={2}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 11, fill: "#52525b" }}
                tickLine={false}
                axisLine={false}
                interval={2}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#52525b" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={fmtAxisB}
                width={52}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
                content={<RevSpendTooltip />}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
              <Bar dataKey="revenue" name="Revenue" fill="#10B981" radius={[2, 2, 0, 0]} />
              <Bar dataKey="spending" name="Spending" fill="#EF4444" radius={[2, 2, 0, 0]} fillOpacity={0.7} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 flex flex-wrap items-center gap-6 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-green-500" />Revenue
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-red-500/70" />Spending
            </span>
            <span className="ml-auto text-zinc-600">
              Every bar where red &gt; green adds to the national debt.
            </span>
          </div>
        </div>

        {/* ── 6. Fiscal Risk Dashboard ── */}
        <div className="mb-6 grid gap-6 lg:grid-cols-2">

          {/* Debt/GDP by country */}
          <div className="rounded-2xl border border-white/10 bg-[#0A0E1A] p-5">
            <h2 className="mb-1 text-base font-semibold text-zinc-100">Debt / GDP — Global Comparison</h2>
            <p className="mb-4 text-xs text-zinc-500">
              General government gross debt as % of GDP · IMF WEO April 2025
            </p>
            <div className="space-y-2.5">
              {COUNTRY_DEBT_GDP.map((c) => (
                <div key={c.country} className="flex items-center gap-3">
                  <span
                    className={`w-20 shrink-0 text-right text-xs font-medium ${
                      c.highlight ? "font-bold text-red-400" : "text-zinc-400"
                    }`}
                  >
                    {c.country}
                  </span>
                  <div className="relative h-5 flex-1 overflow-hidden rounded bg-white/5">
                    <div
                      className="h-full rounded transition-all"
                      style={{
                        width: `${(c.value / 265) * 100}%`,
                        background: c.highlight ? "rgba(239,68,68,0.55)" : "rgba(113,113,122,0.3)",
                      }}
                    />
                    <span
                      className={`absolute inset-y-0 right-2 flex items-center text-[10px] font-bold ${
                        c.highlight ? "text-red-400" : "text-zinc-500"
                      }`}
                    >
                      {c.value}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Risk ratios + credit ratings */}
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-white/10 bg-[#0A0E1A] p-5">
              <h2 className="mb-4 text-base font-semibold text-zinc-100">Fiscal Risk Indicators</h2>
              <div className="space-y-3.5">
                {[
                  {
                    label: "Interest as % of Revenue",
                    value: `${((ANNUAL_INTEREST / TOTAL_REVENUE) * 100).toFixed(1)}%`,
                    pct: (ANNUAL_INTEREST / TOTAL_REVENUE) * 100,
                    max: 40,
                    color: "#EF4444",
                    note: "$1 of every $4.2 collected goes to interest",
                  },
                  {
                    label: "Deficit as % of GDP",
                    value: "6.9%",
                    pct: 6.9,
                    max: 15,
                    color: "#F59E0B",
                    note: "2× the EU 3% stability pact threshold",
                  },
                  {
                    label: "Debt / GDP",
                    value: `${DEBT_TO_GDP}%`,
                    pct: DEBT_TO_GDP,
                    max: 150,
                    color: "#F97316",
                    note: "Surpassed 100% in 2012, accelerating since",
                  },
                  {
                    label: "Interest Coverage",
                    value: `${(TOTAL_REVENUE / ANNUAL_INTEREST).toFixed(1)}×`,
                    pct: Math.min(100, ((TOTAL_REVENUE / ANNUAL_INTEREST - 1) / 5) * 100),
                    max: 100,
                    color: "#8B5CF6",
                    note: "Revenue covers interest 4.2× — and falling",
                  },
                ].map((r) => (
                  <div key={r.label}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-zinc-400">{r.label}</span>
                      <span className="font-bold" style={{ color: r.color }}>{r.value}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5">
                      <div
                        className="h-1.5 rounded-full"
                        style={{ width: `${Math.min(100, (r.pct / r.max) * 100)}%`, background: r.color }}
                      />
                    </div>
                    <p className="mt-0.5 text-[10px] text-zinc-600">{r.note}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0A0E1A] p-5">
              <h2 className="mb-3 text-base font-semibold text-zinc-100">Sovereign Credit Ratings</h2>
              <div className="grid grid-cols-3 gap-3">
                {CREDIT_RATINGS.map((r) => (
                  <div
                    key={r.agency}
                    className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3 text-center"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{r.agency}</p>
                    <p className="mt-1 text-2xl font-bold text-yellow-400">{r.rating}</p>
                    <p className="text-[10px] text-zinc-500">{r.outlook}</p>
                    <p className="mt-1 text-[9px] text-zinc-600">{r.note}</p>
                    <p className="text-[9px] text-zinc-700">{r.changed}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-zinc-600">
                All three agencies have downgraded the US from AAA. No G7 nation holds a universal AAA rating.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-zinc-700">
          Sources: US Treasury Fiscal Data API · USASpending.gov API · Congressional Budget Office · OMB Historical Tables · IMF World Economic Outlook 2025. FY2025 data reflects fiscal year ending September 30, 2025.
        </p>

      </div>
    </main>
  );
}
