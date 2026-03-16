"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
type EconomicEventDetail = {
  id: string;
  name: string;
  description: string;
  date?: string;
  previous?: string;
  estimate?: string;
  actual?: string;
};

const CARD_BG = "#0F1520";
const GRID_COLOR = "#1a2535";
const RECESSION_FILL = "rgba(239,68,68,0.1)";

const RECESSION_PERIODS: [string, string][] = [
  ["2020-02-01", "2020-04-30"],
  ["2007-12-01", "2009-06-30"],
  ["2001-03-01", "2001-11-30"],
];

const FRED_CACHE_KEY = "xchange-calendar-fred-";
const CACHE_HOURS = 24;

function getCacheKey(seriesId: string, start: string, end: string) {
  return `${FRED_CACHE_KEY}${seriesId}-${start}-${end}`;
}

function loadCached(seriesId: string, start: string, end: string): { date: string; value: number }[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(getCacheKey(seriesId, start, end));
    if (!raw) return null;
    const { data, at } = JSON.parse(raw);
    if (Date.now() - at > CACHE_HOURS * 60 * 60 * 1000) return null;
    return data;
  } catch {
    return null;
  }
}

function saveCache(seriesId: string, start: string, end: string, data: { date: string; value: number }[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getCacheKey(seriesId, start, end), JSON.stringify({ data, at: Date.now() }));
  } catch {}
}

// Event name -> FRED series ID (same as API)
const EVENT_TO_FRED: Record<string, string> = {
  "cpi": "CPIAUCSL", "consumer price": "CPIAUCSL", "inflation": "CPIAUCSL",
  "core cpi": "CPILFESL", "fed funds": "FEDFUNDS", "fomc": "FEDFUNDS", "federal reserve": "FEDFUNDS",
  "unemployment": "UNRATE", "gdp": "A191RL1Q225SBEA", "nonfarm payroll": "PAYEMS", "nfp": "PAYEMS",
  "jobs report": "PAYEMS", "payrolls": "PAYEMS", "retail sales": "RSXFS", "ppi": "PPIACO",
  "producer price": "PPIACO", "consumer sentiment": "UMCSENT", "housing starts": "HOUST",
  "ism manufacturing": "MANEMP", "jobless claims": "ICSA", "10y": "DGS10", "10 year": "DGS10",
  "treasury 10": "DGS10", "2y": "DGS2", "2 year": "DGS2", "treasury 2": "DGS2",
  "yield curve": "T10Y2Y", "pce": "PCEPI", "pce inflation": "PCEPI", "core pce": "PCEPILFE",
};

function getSeriesId(eventName: string): string | null {
  const n = eventName.toLowerCase();
  for (const [key, id] of Object.entries(EVENT_TO_FRED)) {
    if (n.includes(key)) return id;
  }
  return null;
}

type RangeKey = "1Y" | "3Y" | "5Y" | "10Y" | "Max";

function getStartEnd(range: RangeKey): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  if (range === "1Y") start.setFullYear(start.getFullYear() - 1);
  else if (range === "3Y") start.setFullYear(start.getFullYear() - 3);
  else if (range === "5Y") start.setFullYear(start.getFullYear() - 5);
  else if (range === "10Y" || range === "Max") start.setFullYear(start.getFullYear() - 10);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

type EconomicDetailModalProps = {
  event: EconomicEventDetail;
  onClose: () => void;
};

type AIAnalysis = {
  trend: string;
  trendColor: string;
  summary: string;
  marketImpact: string;
  watchFor: string;
};

const COMPARE_OPTIONS: { label: string; id: string }[] = [
  { label: "CPI", id: "CPIAUCSL" },
  { label: "Fed Funds", id: "FEDFUNDS" },
  { label: "Unemployment", id: "UNRATE" },
  { label: "10Y Treasury", id: "DGS10" },
  { label: "2Y Treasury", id: "DGS2" },
  { label: "Yield Curve", id: "T10Y2Y" },
  { label: "Nonfarm Payrolls", id: "PAYEMS" },
  { label: "Retail Sales", id: "RSXFS" },
];

export function EconomicDetailModal({ event, onClose }: EconomicDetailModalProps) {
  const [range, setRange] = useState<RangeKey>("10Y");
  const [observations, setObservations] = useState<{ date: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [compareSeriesId, setCompareSeriesId] = useState<string | null>(null);
  const [compareObservations, setCompareObservations] = useState<{ date: string; value: number }[]>([]);

  const { start, end } = getStartEnd(range);
  const fetchData = useCallback(async () => {
    const sid = getSeriesId(event.name);
    if (!sid) {
      setObservations([]);
      setLoading(false);
      return;
    }
    const cached = loadCached(sid, start, end);
    if (cached?.length) {
      setObservations(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/calendar/fred?series_id=${encodeURIComponent(sid)}&observation_start=${start}&observation_end=${end}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      const obs = (data.observations ?? []) as { date: string; value: number }[];
      setObservations(obs);
      if (obs.length) saveCache(sid, start, end, obs);
    } catch {
      setObservations([]);
    } finally {
      setLoading(false);
    }
  }, [event.name, start, end]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!compareSeriesId || !start || !end) {
      setCompareObservations([]);
      return;
    }
    fetch(
      `/api/calendar/fred?series_id=${encodeURIComponent(compareSeriesId)}&observation_start=${start}&observation_end=${end}`,
      { cache: "no-store" }
    )
      .then((r) => r.json())
      .then((d) => setCompareObservations((d.observations ?? []) as { date: string; value: number }[]))
      .catch(() => setCompareObservations([]));
  }, [compareSeriesId, start, end]);

  const handleGetAIAnalysis = useCallback(async () => {
    const sid = getSeriesId(event.name);
    if (!sid || observations.length < 2) return;
    setAiLoading(true);
    try {
      const currentVal = observations[observations.length - 1]?.value ?? event.actual ?? "";
      const prevVal = observations[observations.length - 2]?.value;
      const trend = prevVal != null ? (currentVal > prevVal ? "up" : currentVal < prevVal ? "down" : "flat") : "unknown";
      const dataSummary = `Current: ${currentVal}, 10Y avg: ${observations.length ? (observations.reduce((a, o) => a + o.value, 0) / observations.length).toFixed(2) : "n/a"}, high/low over period.`;
      const res = await fetch("/api/calendar/economic-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          indicatorName: event.name,
          currentValue: currentVal,
          trend,
          dataSummary,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiAnalysis(data);
      }
    } finally {
      setAiLoading(false);
    }
  }, [event.name, event.actual, observations]);

  const current = observations.length > 0 ? observations[observations.length - 1]?.value : null;
  const previous = observations.length > 1 ? observations[observations.length - 2]?.value : null;
  const oneYearAgo = observations.length > 12 ? observations[observations.length - 13]?.value : null;
  const values = observations.map((o) => o.value).filter((v) => Number.isFinite(v));
  const allTimeHigh = values.length ? Math.max(...values) : null;
  const allTimeLow = values.length ? Math.min(...values) : null;
  const avg10y = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const highIdx = allTimeHigh != null ? values.lastIndexOf(allTimeHigh) : -1;
  const lowIdx = allTimeLow != null ? values.lastIndexOf(allTimeLow) : -1;
  const highYear = highIdx >= 0 && observations[highIdx] ? observations[highIdx].date.slice(0, 4) : "";
  const lowYear = lowIdx >= 0 && observations[lowIdx] ? observations[lowIdx].date.slice(0, 4) : "";

  const chartData = useMemo(() => {
    const primary = observations.map((o) => ({ ...o, name: o.date, value: o.value }));
    if (!compareSeriesId || compareObservations.length === 0) {
      return primary.map((p) => ({ ...p, value2: undefined }));
    }
    const byDate = new Map(compareObservations.map((o) => [o.date, o.value]));
    return primary.map((p) => ({ ...p, value2: byDate.get(p.date) }));
  }, [observations, compareSeriesId, compareObservations]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden onClick={onClose} />
      <div
        className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 shadow-2xl"
        style={{ backgroundColor: CARD_BG }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#0F1520]/95 px-4 py-3 backdrop-blur">
          <h2 className="text-lg font-semibold text-zinc-100">{event.name}</h2>
          <button type="button" onClick={onClose} className="rounded p-2 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Close">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-zinc-400">{event.description}</p>
          <div className="flex flex-wrap gap-4 text-sm">
            {event.actual != null && <span><span className="text-zinc-500">Current / Latest:</span> <span className="text-white font-medium">{event.actual}</span></span>}
            {event.previous != null && <span><span className="text-zinc-500">Previous:</span> <span className="text-zinc-300">{event.previous}</span></span>}
            {event.date && <span><span className="text-zinc-500">Date:</span> <span className="text-zinc-300">{event.date}</span></span>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(["1Y", "3Y", "5Y", "10Y", "Max"] as RangeKey[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  range === r ? "bg-[var(--accent-color)] text-[#020308]" : "bg-white/10 text-zinc-400 hover:bg-white/15"
                }`}
              >
                {r}
              </button>
            ))}
            <span className="text-zinc-500">|</span>
            <select
              value={compareSeriesId ?? ""}
              onChange={(e) => setCompareSeriesId(e.target.value || null)}
              className="rounded-lg border border-white/20 bg-black/40 px-2 py-1.5 text-xs text-zinc-200"
            >
              <option value="">Compare with...</option>
              {COMPARE_OPTIONS.filter((o) => o.id !== getSeriesId(event.name)).map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="h-64 flex items-center justify-center text-zinc-500">Loading chart…</div>
          ) : chartData.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                  {RECESSION_PERIODS.map(([s, e], i) => (
                    <ReferenceArea key={i} x1={s} x2={e} fill={RECESSION_FILL} />
                  ))}
                  {avg10y != null && <ReferenceLine y={avg10y} stroke="#6B7280" strokeDasharray="4 4" />}
                  <XAxis dataKey="date" tick={{ fill: "#9CA3AF", fontSize: 10 }} tickFormatter={(v) => (v || "").slice(0, 4)} />
                  <YAxis yAxisId="left" tick={{ fill: "#9CA3AF", fontSize: 10 }} domain={["auto", "auto"]} />
                  {compareSeriesId && <YAxis yAxisId="right" orientation="right" tick={{ fill: "#60A5FA", fontSize: 10 }} domain={["auto", "auto"]} />}
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1a2535", border: "1px solid #374151", borderRadius: 8 }}
                    labelStyle={{ color: "#E5E7EB" }}
                    formatter={(value: number) => [value?.toFixed(2) ?? value, "Value"]}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Line type="monotone" dataKey="value" stroke="var(--accent-color)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "var(--accent-color)" }} yAxisId="left" />
                  {compareSeriesId && <Line type="monotone" dataKey="value2" stroke="#60A5FA" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} yAxisId="right" />}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No historical data for this indicator.</p>
          )}

          <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-black/20 p-3 text-xs sm:grid-cols-3">
            {current != null && <div><span className="text-zinc-500">Current:</span> <span className="text-zinc-200">{current.toFixed(2)}</span></div>}
            {previous != null && <div><span className="text-zinc-500">Previous:</span> <span className="text-zinc-200">{previous.toFixed(2)}</span></div>}
            {oneYearAgo != null && <div><span className="text-zinc-500">1 Year Ago:</span> <span className="text-zinc-200">{oneYearAgo.toFixed(2)}</span></div>}
            {allTimeHigh != null && <div><span className="text-zinc-500">All-Time High:</span> <span className="text-zinc-200">{allTimeHigh.toFixed(2)} ({highYear})</span></div>}
            {allTimeLow != null && <div><span className="text-zinc-500">All-Time Low:</span> <span className="text-zinc-200">{allTimeLow.toFixed(2)} ({lowYear})</span></div>}
            {avg10y != null && <div><span className="text-zinc-500">10Y Average:</span> <span className="text-zinc-200">{avg10y.toFixed(2)}</span></div>}
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleGetAIAnalysis}
              disabled={aiLoading || observations.length < 2}
              className="rounded-lg bg-[var(--accent-color)]/20 px-4 py-2 text-sm font-medium text-[var(--accent-color)] hover:bg-[var(--accent-color)]/30 disabled:opacity-50"
            >
              {aiLoading ? "Analyzing…" : "Get AI Analysis"}
            </button>
            {aiAnalysis && (
              <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm space-y-2">
                <p className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                    aiAnalysis.trendColor === "green" ? "bg-emerald-500/20 text-emerald-400" :
                    aiAnalysis.trendColor === "red" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"
                  }`}>
                    {aiAnalysis.trend}
                  </span>
                </p>
                <p className="text-zinc-300">{aiAnalysis.summary}</p>
                {aiAnalysis.marketImpact && <p className="text-xs text-zinc-500"><span className="font-medium text-zinc-400">Market impact:</span> {aiAnalysis.marketImpact}</p>}
                {aiAnalysis.watchFor && <p className="text-xs text-zinc-500"><span className="font-medium text-zinc-400">Watch for:</span> {aiAnalysis.watchFor}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
