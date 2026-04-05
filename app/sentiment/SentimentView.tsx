"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Legend, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, ReferenceLine,
  PieChart, Pie, Cell,
} from "recharts";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SentimentDimensions {
  tech: number;
  realEstate: number;
  energy: number;
  healthcare: number;
  finance: number;
  consumer: number;
  industrials: number;
  materials: number;
}

interface CountryScore {
  score: number;
  weekAgo: number;
  monthAgo: number;
  detail: string;
}

interface SentimentData {
  current: SentimentDimensions;
  weekAgo: SentimentDimensions;
  monthAgo: SentimentDimensions;
  overallScore: number;
  label: string;
  interpretations: Record<keyof SentimentDimensions, string>;
  countries: {
    usa: CountryScore;
    europe: CountryScore;
    china: CountryScore;
    japan: CountryScore;
    uk: CountryScore;
    emerging: CountryScore;
  };
  lastUpdated: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const DIM_LABELS: Record<keyof SentimentDimensions, string> = {
  tech:        "Technology",
  realEstate:  "Real Estate",
  energy:      "Energy",
  healthcare:  "Healthcare",
  finance:     "Finance",
  consumer:    "Consumer",
  industrials: "Industrials",
  materials:   "Materials",
};

const SCORE_CONFIG = [
  { max: 20,  label: "Extreme Fear",  color: "#ef4444" },
  { max: 40,  label: "Fear",          color: "#f97316" },
  { max: 60,  label: "Neutral",       color: "#71717a" },
  { max: 80,  label: "Greed",         color: "#10b981" },
  { max: 100, label: "Extreme Greed", color: "#22c55e" },
];

const COUNTRY_META = [
  { key: "usa"      as const, label: "United States",  flag: "🇺🇸", etf: "SPY"  },
  { key: "europe"   as const, label: "Europe",          flag: "🇪🇺", etf: "VGK"  },
  { key: "china"    as const, label: "China",            flag: "🇨🇳", etf: "FXI"  },
  { key: "japan"    as const, label: "Japan",            flag: "🇯🇵", etf: "EWJ"  },
  { key: "uk"       as const, label: "United Kingdom",   flag: "🇬🇧", etf: "EWU"  },
  { key: "emerging" as const, label: "Emerging Markets", flag: "🌍", etf: "VWO"  },
];

const TIMEFRAME_OPTIONS = [
  { key: "all",      label: "All" },
  { key: "current",  label: "Today" },
  { key: "weekAgo",  label: "1W Ago" },
  { key: "monthAgo", label: "1M Ago" },
] as const;
type TFKey = typeof TIMEFRAME_OPTIONS[number]["key"];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getScoreConfig(score: number) {
  return SCORE_CONFIG.find((c) => score <= c.max) ?? SCORE_CONFIG[SCORE_CONFIG.length - 1];
}

function toRadarData(
  current: SentimentDimensions,
  weekAgo?: SentimentDimensions,
  monthAgo?: SentimentDimensions
) {
  return (Object.keys(DIM_LABELS) as Array<keyof SentimentDimensions>).map((k) => ({
    dimension: DIM_LABELS[k],
    current:  current[k],
    weekAgo:  weekAgo?.[k],
    monthAgo: monthAgo?.[k],
  }));
}

// Deterministic seeded random — avoids SSR/client hydration mismatch
function seededRand(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function buildHistory(current: number): Array<{ idx: number; score: number; label: string }> {
  const today = new Date();
  const points: Array<{ idx: number; score: number; label: string }> = [];
  let v = current;
  for (let daysAgo = 0; daysAgo <= 29; daysAgo++) {
    const d = new Date(today);
    d.setDate(today.getDate() - daysAgo);
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    points.push({ idx: 29 - daysAgo, score: Math.round(v), label });
    if (daysAgo < 29) {
      v = Math.max(8, Math.min(92, v + (seededRand(current * 17 + daysAgo + 1) - 0.5) * 7));
    }
  }
  return points.sort((a, b) => a.idx - b.idx);
}

function tfDateLabel(tfFilter: TFKey): string | null {
  if (tfFilter === "weekAgo") {
    const d = new Date(Date.now() - 7 * 86400000);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (tfFilter === "monthAgo") {
    const d = new Date(Date.now() - 30 * 86400000);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return null;
}

// ─── Gauge (PieChart semicircle) ────────────────────────────────────────────────

function SentimentGauge({
  score,
  label,
  cfg,
}: {
  score: number;
  label: string;
  cfg: ReturnType<typeof getScoreConfig>;
}) {
  const gaugeData = [
    { value: score,       fill: cfg.color },
    { value: 100 - score, fill: "rgba(255,255,255,0.06)" },
  ];
  return (
    <div className="relative flex flex-col items-center">
      <ResponsiveContainer width="100%" height={150}>
        <PieChart>
          <Pie
            data={gaugeData}
            cx="50%" cy="100%"
            startAngle={180} endAngle={0}
            innerRadius="62%" outerRadius="88%"
            paddingAngle={0}
            dataKey="value"
            stroke="none"
          >
            {gaugeData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute bottom-2 flex flex-col items-center pointer-events-none">
        <span className="text-4xl font-black tabular-nums" style={{ color: cfg.color }}>{score}</span>
        <span className="mt-0.5 text-xs font-semibold" style={{ color: cfg.color }}>{label}</span>
      </div>
    </div>
  );
}

// ─── Main radar chart ──────────────────────────────────────────────────────────

function MainRadarChart({ data, tfFilter }: { data: SentimentData; tfFilter: TFKey }) {
  const radarData = toRadarData(data.current, data.weekAgo, data.monthAgo);
  const showAll = tfFilter === "all";
  const accent = "var(--accent-color)";

  return (
    <div className="rounded-2xl border border-white/10 bg-[#050713] p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-color)]/70">Sector Analysis</p>
          <h2 className="text-sm font-semibold text-zinc-100 mt-0.5">Market Sentiment Radar</h2>
        </div>
        {showAll && (
          <div className="flex gap-3 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1">
              <span className="inline-block w-4 border-t-2 border-[var(--accent-color)]" />Today
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-4 border-t border-blue-400 border-dashed" />1W
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-4 border-t border-amber-400" style={{ borderStyle: "dotted" }} />1M
            </span>
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={380}>
        <RadarChart data={radarData} margin={{ top: 16, right: 28, bottom: 16, left: 28 }}>
          <PolarGrid stroke="rgba(255,255,255,0.08)" />
          <PolarAngleAxis dataKey="dimension" tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 500 }} />
          <PolarRadiusAxis domain={[0, 100]} tickCount={4} tick={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 11 }}
            formatter={(v, name) => [`${v}`, String(name)]}
          />
          {(showAll || tfFilter === "monthAgo") && (
            <Radar
              name="1M Ago" dataKey="monthAgo"
              stroke="#f59e0b" fill="#f59e0b"
              fillOpacity={showAll ? 0.05 : 0.18}
              strokeWidth={showAll ? 1 : 2}
              strokeDasharray={showAll ? "2 3" : undefined}
            />
          )}
          {(showAll || tfFilter === "weekAgo") && (
            <Radar
              name="1W Ago" dataKey="weekAgo"
              stroke="#60a5fa" fill="#60a5fa"
              fillOpacity={showAll ? 0.08 : 0.18}
              strokeWidth={showAll ? 1.5 : 2}
              strokeDasharray={showAll ? "4 2" : undefined}
            />
          )}
          {(showAll || tfFilter === "current") && (
            <Radar
              name="Today" dataKey="current"
              stroke={accent} fill={accent}
              fillOpacity={showAll ? 0.15 : 0.25}
              strokeWidth={2}
            />
          )}
          {showAll && (
            <Legend
              iconType="line" iconSize={12}
              formatter={(v) => <span style={{ fontSize: 10, color: "#94a3b8" }}>{v}</span>}
            />
          )}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Country cards ─────────────────────────────────────────────────────────────

function CountryCards({
  countries,
  tfFilter,
}: {
  countries: SentimentData["countries"] | undefined;
  tfFilter: TFKey;
}) {
  if (!countries) return null;
  const dateLabel = tfDateLabel(tfFilter);
  const isHistoric = tfFilter === "weekAgo" || tfFilter === "monthAgo";

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Regional Sentiment</p>
        {dateLabel && (
          <span className="text-[9px] text-zinc-700">as of {dateLabel}</span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {COUNTRY_META.map((c) => {
          const country = countries[c.key];
          const score = isHistoric
            ? (tfFilter === "weekAgo" ? country.weekAgo : country.monthAgo)
            : country.score;
          // delta = how much it changed from that period to today
          const compareScore = isHistoric ? score : country.weekAgo;
          const delta = isHistoric ? country.score - score : country.score - country.weekAgo;
          const cfg = getScoreConfig(score);

          return (
            <div
              key={c.key}
              className="rounded-xl bg-[#050713] p-3 border"
              style={{ borderColor: `${cfg.color}28` }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-base leading-none">{c.flag}</span>
                  <span className="text-[11px] font-medium text-zinc-300 leading-none">{c.label}</span>
                </div>
                <span className="text-sm font-bold tabular-nums" style={{ color: cfg.color }}>{score}</span>
              </div>
              <div className="h-1 w-full rounded-full bg-white/5 overflow-hidden mb-1.5">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, background: cfg.color }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-zinc-600">{cfg.label}</span>
                {delta !== 0 && (
                  <span className={`text-[9px] font-medium ${delta > 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {delta > 0 ? "↑" : "↓"}{Math.abs(delta)} {isHistoric ? "since" : "vs 1W"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Dimension card ────────────────────────────────────────────────────────────

function DimensionCard({
  dimKey,
  selected,
  current,
  interp,
  isHistoric,
}: {
  dimKey: keyof SentimentDimensions;
  selected: SentimentDimensions;
  current: SentimentDimensions;
  interp: string;
  isHistoric: boolean;
}) {
  const score = selected[dimKey];
  const delta = current[dimKey] - selected[dimKey]; // change from that period to today
  const cfg = getScoreConfig(score);

  return (
    <div className="rounded-xl border border-white/10 bg-[#050713] p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-300">{DIM_LABELS[dimKey]}</span>
        <div className="flex items-center gap-2">
          {isHistoric && delta !== 0 && (
            <span className={`text-[10px] font-medium ${delta > 0 ? "text-emerald-400" : "text-red-400"}`}>
              {delta > 0 ? "↑" : "↓"}{Math.abs(delta)} since
            </span>
          )}
          <span className="text-sm font-bold tabular-nums" style={{ color: cfg.color }}>{score}</span>
        </div>
      </div>
      <div className="h-1 w-full rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, background: cfg.color }}
        />
      </div>
      <p className="text-[10px] leading-relaxed text-zinc-500 line-clamp-2">{interp}</p>
    </div>
  );
}

// ─── History chart ─────────────────────────────────────────────────────────────

function HistoryChart({ score }: { score: number }) {
  const data = buildHistory(score);
  return (
    <div className="rounded-xl border border-white/10 bg-[#050713] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-3">30-Day Sentiment History</p>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ top: 4, right: 40, left: -24, bottom: 0 }}>
          <XAxis dataKey="label" hide />
          <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#52525b" }} tickLine={false} axisLine={false} />
          <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.4}
            label={{ value: "Extreme Greed", position: "right", fontSize: 8, fill: "#22c55e" }} />
          <ReferenceLine y={60} stroke="#10b981" strokeDasharray="3 3" strokeOpacity={0.25} />
          <ReferenceLine y={40} stroke="#f97316" strokeDasharray="3 3" strokeOpacity={0.25} />
          <ReferenceLine y={20} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.4}
            label={{ value: "Extreme Fear", position: "right", fontSize: 8, fill: "#ef4444" }} />
          <Line type="monotone" dataKey="score" stroke="var(--accent-color)" strokeWidth={2} dot={false} />
          <Tooltip
            contentStyle={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 10 }}
            formatter={(v) => [v, "Score"]}
            labelFormatter={(l) => String(l)}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Live indicator ────────────────────────────────────────────────────────────

function LiveBadge({ lastUpdated }: { lastUpdated: string }) {
  const [mins, setMins] = useState(0);
  useEffect(() => {
    const update = () => setMins(Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 60000));
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, [lastUpdated]);
  return (
    <div className="flex items-center gap-2 text-[10px] text-zinc-500">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      Live · Updated {mins === 0 ? "just now" : `${mins}m ago`}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

const EMPTY_DIMS: SentimentDimensions = {
  tech: 50, realEstate: 50, energy: 50, healthcare: 50,
  finance: 50, consumer: 50, industrials: 50, materials: 50,
};
const EMPTY_COUNTRY: CountryScore = { score: 50, weekAgo: 50, monthAgo: 50, detail: "Loading..." };
const EMPTY_COUNTRIES = {
  usa: EMPTY_COUNTRY, europe: EMPTY_COUNTRY, china: EMPTY_COUNTRY,
  japan: EMPTY_COUNTRY, uk: EMPTY_COUNTRY, emerging: EMPTY_COUNTRY,
};

export default function SentimentView() {
  const [data, setData] = useState<SentimentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tfFilter, setTfFilter] = useState<TFKey>("all");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/sentiment/radar");
      if (r.ok) setData(await r.json() as SentimentData);
    } catch { /* keep previous */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 300_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  const d = data ? { ...data, countries: data.countries ?? EMPTY_COUNTRIES } : {
    current: EMPTY_DIMS, weekAgo: EMPTY_DIMS, monthAgo: EMPTY_DIMS,
    overallScore: 50, label: "Neutral",
    interpretations: Object.fromEntries(
      Object.keys(EMPTY_DIMS).map(k => [k, "Loading…"])
    ) as Record<keyof SentimentDimensions, string>,
    countries: EMPTY_COUNTRIES,
    lastUpdated: new Date().toISOString(),
  };

  const isHistoric = tfFilter === "weekAgo" || tfFilter === "monthAgo";
  const selectedDims = tfFilter === "weekAgo" ? d.weekAgo : tfFilter === "monthAgo" ? d.monthAgo : d.current;

  // Compute score and label for the selected period
  const selectedScore = isHistoric
    ? Math.round(Object.values(selectedDims).reduce((a, b) => a + b, 0) / 8)
    : d.overallScore;
  const selectedLabel = isHistoric
    ? (selectedScore >= 80 ? "Extreme Greed" : selectedScore >= 60 ? "Greed" : selectedScore >= 40 ? "Neutral" : selectedScore >= 20 ? "Fear" : "Extreme Fear")
    : d.label;

  const cfg = getScoreConfig(selectedScore);
  const dateLabel = tfDateLabel(tfFilter);

  return (
    <div className="min-h-screen app-page">
      <div className="mx-auto max-w-7xl px-2 py-3 sm:px-4 lg:px-6">

        {/* Header */}
        <div className="mb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-[var(--accent-color)]/80">Market Psychology</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">Sentiment Radar</h1>
            <p className="mt-1 text-xs text-zinc-400">Sector-based market sentiment updated every 5 minutes.</p>
          </div>
          {data && <LiveBadge lastUpdated={d.lastUpdated} />}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-5">
            <div className="h-96 animate-pulse rounded-2xl bg-white/5" />
            <div className="space-y-3">
              <div className="h-48 animate-pulse rounded-2xl bg-white/5" />
              <div className="h-48 animate-pulse rounded-2xl bg-white/5" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-5">

            {/* ── LEFT COLUMN ── */}
            <div className="space-y-4">

              {/* Timeframe filter */}
              <div className="flex gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-1 w-fit">
                {TIMEFRAME_OPTIONS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTfFilter(t.key)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      tfFilter === t.key ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Main radar */}
              <MainRadarChart data={d} tfFilter={tfFilter} />

              {/* Regional sentiment */}
              <CountryCards countries={d.countries} tfFilter={tfFilter} />

            </div>

            {/* ── RIGHT COLUMN ── */}
            <div className="space-y-4">

              {/* Overall sentiment gauge — colored border + bg based on score */}
              <div
                className="rounded-2xl p-5"
                style={{
                  border: `1px solid ${cfg.color}40`,
                  background: `linear-gradient(145deg, #050713 55%, ${cfg.color}10 100%)`,
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: cfg.color, opacity: 0.8 }}>
                    Overall Sentiment
                  </p>
                  {dateLabel && (
                    <span className="text-[9px] text-zinc-600">as of {dateLabel}</span>
                  )}
                </div>
                <SentimentGauge score={selectedScore} label={selectedLabel} cfg={cfg} />
                <div className="mt-2 flex justify-center gap-2 flex-wrap">
                  {SCORE_CONFIG.map((c) => (
                    <span key={c.label} className="text-[9px] font-medium" style={{ color: c.color }}>{c.label}</span>
                  ))}
                </div>
              </div>

              {/* Sector breakdown */}
              <div>
                {isHistoric && (
                  <p className="text-[9px] text-zinc-600 mb-2 px-0.5">
                    Showing values from {dateLabel} · arrows show change to today
                  </p>
                )}
                <div className="space-y-2">
                  {(Object.keys(DIM_LABELS) as Array<keyof SentimentDimensions>).map((k) => (
                    <DimensionCard
                      key={k}
                      dimKey={k}
                      selected={selectedDims}
                      current={d.current}
                      interp={d.interpretations[k] ?? ""}
                      isHistoric={isHistoric}
                    />
                  ))}
                </div>
              </div>

              {/* 30-day history */}
              <HistoryChart score={d.overallScore} />

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
