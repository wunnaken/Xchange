"use client";

import { useState, useMemo, useEffect } from "react";
import type { EarningsItem as ApiEarnings, EconomicItem as ApiEconomic } from "../api/calendar/route";
import { EconomicDetailModal } from "./EconomicDetailModal";

const CARD_BG = "#0F1520";

/** Approx SPY move on event day (for mini chart) */
const EVENT_AVG_MOVE: Record<string, number> = {
  "cpi": 1.2, "consumer price": 1.2, "core cpi": 1.2,
  "nfp": 0.8, "jobs": 0.8, "payroll": 0.8, "nonfarm": 0.8,
  "fomc": 1.5, "fed ": 1.5, "federal reserve": 1.5,
  "gdp": 0.6,
};
function getAvgMove(name: string): number {
  const n = name.toLowerCase();
  for (const [key, pct] of Object.entries(EVENT_AVG_MOVE)) {
    if (n.includes(key)) return pct;
  }
  return 0.5;
}

type EarningsWithDay = ApiEarnings & { dayIndex: number };
type EconomicWithDay = ApiEconomic & { dayIndex: number; description: string };

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDates(monday: Date): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function formatWeekRange(dates: Date[]): string {
  const m = dates[0];
  const f = dates[4];
  return `${m.toLocaleDateString("en-US", { month: "short" })} ${m.getDate()} – ${f.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function formatDayShort(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

type HeatmapDayType = "fed" | "high" | "medium" | "low";

/** Last Wednesday of month (0-indexed month) */
function lastWednesday(year: number, month0: number): number {
  const last = new Date(year, month0 + 1, 0).getDate();
  for (let d = last; d >= Math.max(1, last - 6); d--) {
    if (new Date(year, month0, d).getDay() === 3) return d;
  }
  return last;
}

/** Known recurring dates: FOMC = blue, NFP/CPI = high (red), GDP = medium (amber), jobless claims proxy = low (green). */
function getYearEventMap(year: number): Map<string, HeatmapDayType> {
  const map = new Map<string, HeatmapDayType>();
  const fomcDays: [number, number][] = [
    [1, 28], [1, 29], [3, 18], [3, 19], [4, 29], [4, 30], [6, 17], [6, 18],
    [7, 29], [7, 30], [9, 16], [9, 17], [10, 28], [10, 29], [12, 16], [12, 17],
  ];
  fomcDays.forEach(([m, d]) => map.set(`${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, "fed"));
  for (let m = 1; m <= 12; m++) {
    const first = new Date(year, m - 1, 1).getDay();
    const firstFriday = ((5 - first + 1 + 7) % 7) || 7;
    map.set(`${year}-${String(m).padStart(2, "0")}-${String(firstFriday).padStart(2, "0")}`, "high");
    const cpiDay = 12;
    if (cpiDay <= new Date(year, m, 0).getDate()) map.set(`${year}-${String(m).padStart(2, "0")}-${String(cpiDay).padStart(2, "0")}`, "high");
    const lowDay = 8;
    if (lowDay <= new Date(year, m, 0).getDate()) map.set(`${year}-${String(m).padStart(2, "0")}-${String(lowDay).padStart(2, "0")}`, "low");
  }
  for (const month0 of [0, 3, 6, 9]) {
    const d = lastWednesday(year, month0);
    const m = month0 + 1;
    map.set(`${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, "medium");
  }
  return map;
}

function getEventLabel(type: HeatmapDayType | null): string | null {
  if (type === "fed") return "FOMC / Fed meeting";
  if (type === "high") return "High impact (e.g. NFP, CPI)";
  if (type === "medium") return "Medium impact (e.g. GDP release)";
  if (type === "low") return "Low impact (e.g. jobless claims)";
  return null;
}

function YearHeatmap({ year }: { year: number }) {
  const [hovered, setHovered] = useState<{ date: string; type: HeatmapDayType | null; x: number; y: number } | null>(null);
  const eventMap = useMemo(() => getYearEventMap(year), [year]);
  const months = useMemo(() => {
    const m: { name: string; firstDow: number; days: { date: string; type: HeatmapDayType | null }[] }[] = [];
    const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    for (let mi = 0; mi < 12; mi++) {
      const date = new Date(year, mi, 1);
      const daysInMonth = new Date(year, mi + 1, 0).getDate();
      const firstDow = date.getDay();
      const days: { date: string; type: HeatmapDayType | null }[] = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(mi + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        days.push({ date: dateStr, type: eventMap.get(dateStr) ?? null });
      }
      m.push({ name: names[mi], firstDow, days });
    }
    return m;
  }, [year, eventMap]);

  const todayStr = useMemo(() => {
    const t = new Date();
    if (t.getFullYear() !== year) return null;
    return `${year}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }, [year]);

  const getColor = (d: { type: HeatmapDayType | null }) => {
    if (d.type === "fed") return "#3B82F6";
    if (d.type === "high") return "#EF4444";
    if (d.type === "medium") return "#F59E0B";
    if (d.type === "low") return "#1a3a2a";
    return "#0F1520";
  };

  return (
    <div className="relative inline-flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {months.map((month) => (
          <div key={month.name} className="min-w-[140px]">
            <p className="mb-2 text-center text-xs font-medium text-zinc-400">{month.name}</p>
            <div className="grid grid-cols-7 gap-0.5 text-[10px]">
              {["S", "M", "T", "W", "T", "F", "S"].map((h) => (
                <span key={h} className="text-center text-zinc-500">{h}</span>
              ))}
              {Array.from({ length: month.firstDow }, (_, i) => <span key={`pad-${i}`} />)}
              {month.days.map((day) => {
                const isToday = todayStr === day.date;
                const eventLabel = getEventLabel(day.type);
                return (
                  <span
                    key={day.date}
                    className={`h-4 w-4 rounded-sm transition cursor-default ${isToday ? "ring-1 ring-white" : ""}`}
                    style={{ backgroundColor: getColor(day) }}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHovered({ date: day.date, type: day.type, x: rect.left + rect.width / 2, y: rect.top });
                    }}
                    onMouseLeave={() => setHovered(null)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {hovered && (
        <div
          className="pointer-events-none fixed z-[100] -translate-x-1/2 -translate-y-full rounded-lg border border-white/20 bg-[#1a2535] px-2.5 py-1.5 text-xs text-zinc-100 shadow-xl"
          style={{ left: hovered.x, top: hovered.y - 6 }}
        >
          {getEventLabel(hovered.type) ? `${hovered.date}: ${getEventLabel(hovered.type)}` : hovered.date}
        </div>
      )}
    </div>
  );
}

function YearHeatmapSummary({ year }: { year: number }) {
  const eventMap = useMemo(() => getYearEventMap(year), [year]);
  const stats = useMemo(() => {
    const byMonth = new Map<number, number>();
    let fedCount = 0;
    let highCount = 0;
    for (const [, type] of eventMap) {
      if (type === "fed") fedCount++;
      if (type === "high") highCount++;
    }
    for (let m = 1; m <= 12; m++) {
      let n = 0;
      const daysInMonth = new Date(year, m, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const key = `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        if (eventMap.get(key)) n++;
      }
      byMonth.set(m, n);
    }
    let busiest = 1;
    let quietest = 1;
    for (let m = 2; m <= 12; m++) {
      if ((byMonth.get(m) ?? 0) > (byMonth.get(busiest) ?? 0)) busiest = m;
      if ((byMonth.get(m) ?? 0) < (byMonth.get(quietest) ?? 0)) quietest = m;
    }
    const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const today = new Date();
    let nextEvent = "";
    if (year === today.getFullYear()) {
      const todayStr = `${year}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const sorted = Array.from(eventMap.entries()).filter(([date]) => date >= todayStr).sort(([a], [b]) => a.localeCompare(b));
      if (sorted.length > 0) nextEvent = sorted[0][0];
    }
    return { fedCount, highCount, busiest: monthNames[busiest], quietest: monthNames[quietest], nextEvent };
  }, [year, eventMap]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
      <p className="mb-2 font-semibold text-zinc-200">{year} at a glance</p>
      <ul className="space-y-1 text-xs text-zinc-400">
        <li>Total high-impact event days: {stats.highCount}</li>
        <li>Fed meetings: {stats.fedCount}</li>
        <li>Jobs reports (first Fri): 12</li>
        <li>Busiest month: {stats.busiest}</li>
        <li>Quietest month: {stats.quietest}</li>
        {stats.nextEvent && (
          <li>Next major event day: {stats.nextEvent}</li>
        )}
      </ul>
    </div>
  );
}

function parseDateToDayIndex(dateStr: string, monday: Date): number {
  if (!dateStr || !monday) return -1;
  const d = new Date(dateStr.trim());
  if (Number.isNaN(d.getTime())) return -1;
  const m = new Date(monday);
  m.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - m.getTime()) / (24 * 60 * 60 * 1000));
  if (diff < 0 || diff > 4) return -1;
  return diff;
}

/** Earnings card border: beat/miss vs estimates; null = no actuals yet */
function getEarningsBorderClass(item: EarningsWithDay): string {
  const hasEps = item.epsActual != null && item.epsEstimate != null;
  const hasRev = item.revenueActual != null && item.revenueEstimate != null;
  if (!hasEps && !hasRev) return "border-white/10";
  const epsBeat = hasEps ? item.epsActual! >= item.epsEstimate! : true;
  const revBeat = hasRev ? item.revenueActual! >= item.revenueEstimate! : true;
  if (epsBeat && revBeat) return "border-emerald-400/60";
  return "border-red-400/60";
}

/** Short explanation of what an economic event is (for tooltip or breakdown) */
function getEconomicEventBreakdown(name: string, country: string): string {
  const n = name.toLowerCase();
  const c = country ? `${country} ` : "";
  if (n.includes("cpi") || n.includes("consumer price")) return `${c}Consumer Price Index: measures inflation. Key for interest-rate expectations and equity valuations.`;
  if (n.includes("ppi") || n.includes("producer price")) return `${c}Producer Price Index: inflation at the wholesale level. Often a leading indicator for CPI.`;
  if (n.includes("fomc") || n.includes("fed ") || n.includes("federal reserve")) return `${c}Federal Reserve policy: rate decisions and guidance. Directly moves rates and risk sentiment.`;
  if (n.includes("retail sales")) return `${c}Retail sales: consumer spending strength. Drives GDP and earnings expectations.`;
  if (n.includes("jobless") || n.includes("claims") || n.includes("employment")) return `${c}Labor market data: jobless claims or employment. Affects Fed policy and recession risk views.`;
  if (n.includes("gdp")) return `${c}Gross Domestic Product: broad economic growth. Revisions and surprises move markets.`;
  if (n.includes("pmi") || n.includes("manufacturing") || n.includes("services")) return `${c}Survey-based activity indicator. Above 50 = expansion; below = contraction.`;
  if (n.includes("housing") || n.includes("home sales")) return `${c}Housing data: sector health and consumer confidence.`;
  if (n.includes("consumer sentiment") || n.includes("confidence")) return `${c}Consumer confidence/sentiment: forward-looking spending and growth indicator.`;
  if (n.includes("trade") || n.includes("balance")) return `${c}Trade balance: exports vs imports. Affects currency and growth views.`;
  return `${c}Macro release. Compare actual to estimate and previous to gauge surprise.`;
}

export default function CalendarPage() {
  const [activeTab, setActiveTab] = useState<"earnings" | "economic" | "year">("earnings");
  const [selectedEconomicEvent, setSelectedEconomicEvent] = useState<EconomicWithDay | null>(null);
  const [yearViewYear, setYearViewYear] = useState(new Date().getFullYear());
  const [weekOffset, setWeekOffset] = useState(0);
  const [earnings, setEarnings] = useState<EarningsWithDay[]>([]);
  const [economic, setEconomic] = useState<EconomicWithDay[]>([]);
  const [economicFallback, setEconomicFallback] = useState(false);
  const [economicSample, setEconomicSample] = useState(false);
  const [loading, setLoading] = useState(true);

  const monday = useMemo(() => {
    const today = new Date();
    const baseMonday = getMondayOfWeek(today);
    const m = new Date(baseMonday);
    m.setDate(baseMonday.getDate() + weekOffset * 7);
    return m;
  }, [weekOffset]);

  const weekDates = useMemo(() => getWeekDates(monday), [monday]);
  const toFriday = useMemo(() => {
    const t = new Date(monday);
    t.setDate(monday.getDate() + 4);
    return t;
  }, [monday]);
  const fromStr = useMemo(() => {
    const y = monday.getFullYear();
    const m = String(monday.getMonth() + 1).padStart(2, "0");
    const d = String(monday.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, [monday]);
  const toStr = useMemo(() => {
    const y = toFriday.getFullYear();
    const m = String(toFriday.getMonth() + 1).padStart(2, "0");
    const d = String(toFriday.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, [toFriday]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/calendar?from=${fromStr}&to=${toStr}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { earnings?: ApiEarnings[]; economic?: ApiEconomic[]; economicFallback?: boolean; economicSample?: boolean }) => {
        const m = monday;
        const earn: EarningsWithDay[] = (data.earnings ?? []).map((e) => ({
          ...e,
          dayIndex: parseDateToDayIndex(e.date, m),
        }));
        const econ: EconomicWithDay[] = (data.economic ?? []).map((e) => ({
          ...e,
          dayIndex: parseDateToDayIndex(e.date, m),
          description: `${e.country ? e.country + " — " : ""}${e.previous != null ? `Prev ${e.previous}. ` : ""}${e.estimate != null ? `Est ${e.estimate}.` : ""}`,
        }));
        setEarnings(earn.filter((e) => e.dayIndex >= 0 && e.dayIndex < 5));
        setEconomic(econ.filter((e) => e.dayIndex >= 0 && e.dayIndex < 5));
        setEconomicFallback(Boolean(data.economicFallback));
        setEconomicSample(Boolean(data.economicSample));
      })
      .catch(() => {
        setEarnings([]);
        setEconomic([]);
        setEconomicFallback(false);
        setEconomicSample(false);
      })
      .finally(() => setLoading(false));
  }, [fromStr, toStr, monday]);

  const earningsByDay = useMemo(() => {
    const byDay: EarningsWithDay[][] = [[], [], [], [], []];
    for (const e of earnings) {
      if (e.dayIndex >= 0 && e.dayIndex < 5) byDay[e.dayIndex].push(e);
    }
    return byDay;
  }, [earnings]);

  const eventsByDay = useMemo(() => {
    const byDay: EconomicWithDay[][] = [[], [], [], [], []];
    for (const ev of economic) {
      if (ev.dayIndex >= 0 && ev.dayIndex < 5) byDay[ev.dayIndex].push(ev);
    }
    return byDay;
  }, [economic]);

  const totalEarnings = earnings.length;
  const highImpactCount = economic.filter((e) => e.impact === "HIGH").length;
  const anticipatedEvents = economic.filter((e) => e.impact === "HIGH").slice(0, 3);

  /** Countdown for upcoming event (updates every minute) */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  function countdownTo(dateStr: string): string {
    const d = new Date(dateStr + "T12:00:00Z");
    if (d.getTime() <= now.getTime()) return "Released";
    const ms = d.getTime() - now.getTime();
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    return `In ${days}d ${hours}h`;
  }

  function consensusLabel(ev: EconomicWithDay): "BEAT" | "MISS" | "IN LINE" | null {
    if (ev.actual == null || ev.estimate == null) return null;
    const a = parseFloat(String(ev.actual).replace(/%/g, ""));
    const e = parseFloat(String(ev.estimate).replace(/%/g, ""));
    if (Number.isNaN(a) || Number.isNaN(e)) return null;
    const pct = e !== 0 ? Math.abs((a - e) / e) * 100 : 0;
    if (pct <= 0.1) return "IN LINE";
    return a > e ? "BEAT" : "MISS";
  }

  return (
    <div className="flex">
      {selectedEconomicEvent && (
        <EconomicDetailModal
          event={{
            id: selectedEconomicEvent.id,
            name: selectedEconomicEvent.name,
            description: selectedEconomicEvent.description,
            date: selectedEconomicEvent.date,
            previous: selectedEconomicEvent.previous,
            estimate: selectedEconomicEvent.estimate,
            actual: selectedEconomicEvent.actual,
          }}
          onClose={() => setSelectedEconomicEvent(null)}
        />
      )}
      <main className="min-h-screen flex-1">
          <div className="mx-auto max-w-5xl px-4 py-6">
            {/* Tabs + Week selector */}
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5">
                <button
                  type="button"
                  onClick={() => setActiveTab("earnings")}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === "earnings" ? "bg-[var(--accent-color)]/20 text-[var(--accent-color)]" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Earnings
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("economic")}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === "economic" ? "bg-[var(--accent-color)]/20 text-[var(--accent-color)]" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Economic Events
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("year")}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === "year" ? "bg-[var(--accent-color)]/20 text-[var(--accent-color)]" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Year View
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setWeekOffset((o) => o - 1)}
                  className="rounded-lg border border-white/10 p-2 text-zinc-400 transition-colors hover:border-[var(--accent-color)]/30 hover:bg-white/5 hover:text-[var(--accent-color)]"
                  aria-label="Previous week"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="min-w-[200px] text-center text-sm font-medium text-zinc-200">
                  {formatWeekRange(weekDates)}
                </span>
                <button
                  type="button"
                  onClick={() => setWeekOffset((o) => o + 1)}
                  className="rounded-lg border border-white/10 p-2 text-zinc-400 transition-colors hover:border-[var(--accent-color)]/30 hover:bg-white/5 hover:text-[var(--accent-color)]"
                  aria-label="Next week"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            {activeTab === "year" && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h2 className="text-lg font-semibold text-zinc-100">Full year heatmap</h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setYearViewYear((y) => Math.max(2020, y - 1))}
                      className="rounded-lg border border-white/10 p-2 text-zinc-400 hover:border-[var(--accent-color)]/30 hover:text-[var(--accent-color)]"
                      aria-label="Previous year"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <span className="min-w-[4rem] text-center font-medium text-zinc-200">{yearViewYear}</span>
                    <button
                      type="button"
                      onClick={() => setYearViewYear((y) => Math.min(new Date().getFullYear(), y + 1))}
                      className="rounded-lg border border-white/10 p-2 text-zinc-400 hover:border-[var(--accent-color)]/30 hover:text-[var(--accent-color)]"
                      aria-label="Next year"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <YearHeatmap year={yearViewYear} />
                </div>
                <div className="flex flex-wrap gap-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-xs">
                  <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ backgroundColor: "#0F1520" }} /> No events</span>
                  <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#1a3a2a]" /> Low impact</span>
                  <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#166534]" /> Medium</span>
                  <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#F59E0B]" /> High impact</span>
                  <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#3B82F6]" /> Fed meeting</span>
                  <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#EF4444]" /> Multiple high</span>
                </div>
                <YearHeatmapSummary year={yearViewYear} />
                <p className="text-center text-xs text-zinc-500">
                  {yearViewYear} at a glance: Hover a day for events. Click to open details. Data from economic calendar.
                </p>
              </div>
            )}

            {activeTab === "earnings" && (
              <>
                {loading && (
                  <p className="mb-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-zinc-400">
                    Loading earnings…
                  </p>
                )}
                {!loading && totalEarnings === 0 && (
                  <p className="mb-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-zinc-400">
                    No major events scheduled for this week.
                  </p>
                )}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {weekDates.map((d, dayIndex) => (
                  <div key={dayIndex} className="flex flex-col rounded-xl border border-white/5 bg-white/[0.02] p-3">
                    <h3 className="mb-3 text-center text-sm font-semibold text-zinc-300">
                      {formatDayShort(d)}
                      <span className="ml-1 text-zinc-500">{d.getDate()}</span>
                    </h3>
                    <div className="flex flex-1 flex-col gap-3">
                      {earningsByDay[dayIndex].length === 0 ? (
                        <p className="py-4 text-center text-xs text-zinc-500">No major earnings</p>
                      ) : (
                        earningsByDay[dayIndex].map((item) => (
                          <div
                            key={item.id}
                            className={`rounded-xl border p-3 transition-all duration-200 hover:border-[var(--accent-color)]/40 ${getEarningsBorderClass(item)}`}
                            style={{ backgroundColor: CARD_BG }}
                          >
                            <div className="flex items-start gap-2">
                              <div
                                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                                style={{ backgroundColor: `hsl(${(item.ticker.charCodeAt(0) * 17) % 360}, 50%, 40%)` }}
                              >
                                {item.ticker.slice(0, 2)}
                              </div>
                              <div className="min-w-0 flex-1 overflow-hidden">
                                <p className="truncate font-semibold text-zinc-100" title={item.name}>{item.name}</p>
                                <p className="truncate text-xs text-zinc-500">{item.ticker}</p>
                              </div>
                            </div>
                            <dl className="mt-2 space-y-0.5 text-xs">
                              <div className="flex justify-between">
                                <span className="text-zinc-500">EPS</span>
                                <span className="text-zinc-200">
                                  {item.epsActual != null ? `${item.epsActual.toFixed(2)}` : item.epsEstimate != null ? item.epsEstimate.toFixed(2) : "—"}
                                  {item.epsActual != null && item.epsEstimate != null && (
                                    <span className={item.epsActual >= item.epsEstimate ? "text-emerald-400" : "text-red-400"}> ({item.epsActual >= item.epsEstimate ? "beat" : "miss"})</span>
                                  )}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-zinc-500">Rev.</span>
                                <span className="text-zinc-200">
                                  {item.revenueActual != null ? `${(item.revenueActual / 1e9).toFixed(2)}B` : item.revenueEstimate != null ? `${(item.revenueEstimate / 1e9).toFixed(2)}B` : "—"}
                                  {item.revenueActual != null && item.revenueEstimate != null && (
                                    <span className={item.revenueActual >= item.revenueEstimate ? "text-emerald-400" : "text-red-400"}> ({item.revenueActual >= item.revenueEstimate ? "beat" : "miss"})</span>
                                  )}
                                </span>
                              </div>
                            </dl>
                            <div className="mt-2 flex flex-wrap items-center gap-1">
                              {item.bmoAmc && (
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                    item.bmoAmc === "BMO" ? "bg-blue-500/20 text-blue-300" : "bg-purple-500/20 text-purple-300"
                                  }`}
                                >
                                  {item.bmoAmc}
                                </span>
                              )}
                              {item.epsActual != null && (
                                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${item.epsActual >= (item.epsEstimate ?? 0) ? "bg-[var(--accent-color)]/20 text-[var(--accent-color)]" : "bg-red-500/20 text-red-400"}`}>
                                  {item.epsActual >= (item.epsEstimate ?? 0) ? "BEAT" : "MISS"}
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
                </div>
              </>
            )}

            {activeTab === "economic" && (
              <div className="space-y-6">
                {economicFallback && economic.length > 0 && (
                  <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-center text-xs text-amber-200/90">
                    {economicSample
                      ? "Sample events — provider returned no data. Dates are approximate."
                      : "Showing economic events for this week (fallback date range)."}
                  </p>
                )}
                {!loading && economic.length === 0 && (
                  <p className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-zinc-400">
                    No economic events scheduled for this week.
                  </p>
                )}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {weekDates.map((d, dayIndex) => {
                  const events = eventsByDay[dayIndex];
                  return (
                    <div key={dayIndex} className="flex flex-col rounded-xl border border-white/5 bg-white/[0.02] p-3">
                      <h3 className="mb-3 text-center text-sm font-semibold text-zinc-300">
                        {formatDayShort(d)}
                        <span className="ml-1 text-zinc-500">{d.getDate()}</span>
                      </h3>
                      <div className="flex flex-1 flex-col gap-3">
                        {events.length === 0 ? (
                          <p className="py-4 text-center text-xs text-zinc-500">No events this day</p>
                        ) : (
                          events.map((ev) => {
                            const consensus = consensusLabel(ev);
                            const avgMove = getAvgMove(ev.name);
                            return (
                          <div
                            key={ev.id}
                            className={`flex rounded-xl overflow-hidden transition-all duration-200 ${
                              ev.impact === "HIGH" ? "border-l-4 border-l-red-500" : ev.impact === "MEDIUM" ? "border-l-4 border-l-amber-500" : "border-l-4 border-l-zinc-500"
                            }`}
                          >
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedEconomicEvent(ev)}
                              onKeyDown={(e) => e.key === "Enter" && setSelectedEconomicEvent(ev)}
                              className="flex-1 cursor-pointer rounded-r-xl border border-t border-r border-b border-white/10 p-4 transition-colors hover:border-white/20"
                              style={{ backgroundColor: CARD_BG }}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="font-semibold text-zinc-100">{ev.name}</h4>
                                <span className="text-xs text-zinc-500">{ev.dateTimeET}</span>
                                <span
                                  className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                                    ev.impact === "HIGH" ? "bg-red-500/20 text-red-400" : ev.impact === "MEDIUM" ? "bg-amber-500/20 text-amber-400" : "bg-zinc-500/20 text-zinc-400"
                                  }`}
                                >
                                  {ev.impact}
                                </span>
                                {ev.actual != null && (
                                  <span className="rounded px-2 py-0.5 text-[10px] font-medium bg-emerald-500/20 text-emerald-400">
                                    Released
                                  </span>
                                )}
                                {consensus && (
                                  <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                                    consensus === "BEAT" ? "bg-emerald-500/20 text-emerald-400" : consensus === "MISS" ? "bg-red-500/20 text-red-400" : "bg-zinc-500/20 text-zinc-400"
                                  }`}>
                                    {consensus}
                                  </span>
                                )}
                              </div>
                              {(ev.previous != null || ev.estimate != null || ev.actual != null) && (
                                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                                  {ev.previous != null && (
                                    <span>
                                      <span className="text-zinc-500">Prev </span>
                                      <span className="text-zinc-300">{ev.previous}</span>
                                    </span>
                                  )}
                                  {ev.estimate != null && (
                                    <span>
                                      <span className="text-zinc-500">Est </span>
                                      <span className="text-zinc-300">{ev.estimate}</span>
                                    </span>
                                  )}
                                  {ev.actual != null && (
                                    <span>
                                      <span className="text-zinc-500">Actual </span>
                                      <span className="text-[var(--accent-color)]">{ev.actual}</span>
                                    </span>
                                  )}
                                </div>
                              )}
                              {ev.date && (
                                <p className="mt-1 text-[10px] text-zinc-500">⏱ {countdownTo(ev.date)}</p>
                              )}
                              {avgMove > 0 && (
                                <p className="mt-0.5 text-[10px] text-zinc-500">SPY avg ±{avgMove}% on this event day</p>
                              )}
                              <p className="mt-2 text-xs text-zinc-500">{ev.description}</p>
                              <p className="mt-1.5 text-xs text-zinc-500 italic">{getEconomicEventBreakdown(ev.name, ev.country)}</p>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedEconomicEvent(ev); }} className="mt-2 text-xs font-medium text-[var(--accent-color)] hover:underline">
                                View 10-year history →
                              </button>
                            </div>
                          </div>
                          );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Right panel */}
        <aside className="hidden w-80 flex-shrink-0 border-l border-white/5 lg:block">
          <div className="sticky top-0 space-y-6 p-4">
            <section
              className="rounded-2xl border border-white/10 p-4 transition-colors duration-200"
              style={{ backgroundColor: CARD_BG }}
            >
              <h2 className="text-sm font-semibold text-zinc-100">This Week at a Glance</h2>
              <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                <li>Total earnings: {totalEarnings} companies</li>
                <li>High impact events: {highImpactCount}</li>
              </ul>
              <p className="mt-3 text-xs font-medium text-zinc-400">Most anticipated</p>
              <ul className="mt-1 space-y-1 text-xs text-zinc-400">
                {anticipatedEvents.map((e) => (
                  <li key={e.id}>
                    {e.name} — {e.dateTimeET}
                  </li>
                ))}
              </ul>
            </section>
            <section
              className="rounded-2xl border border-white/10 p-4 transition-colors duration-200"
              style={{ backgroundColor: CARD_BG }}
            >
              <h2 className="text-sm font-semibold text-zinc-100">Market Moving Events</h2>
              <ul className="mt-3 space-y-3 text-xs text-zinc-400">
                <li>
                  <span className="font-medium text-red-400">Core CPI</span> — Sets tone for rates; beats/misses drive equity and bond volatility.
                </li>
                <li>
                  <span className="font-medium text-red-400">FOMC Minutes</span> — Traders look for hints on cut timing and balance-sheet plans.
                </li>
                <li>
                  <span className="font-medium text-amber-400">Nike (NKE)</span> — AMC Thursday; consumer and China exposure in focus.
                </li>
              </ul>
            </section>
          </div>
        </aside>
    </div>
  );
}
