"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  US_SECTORS,
  GLOBAL_REGIONS,
  type SectorId,
  type RegionId,
  type SentimentSnapshot,
  type SentimentScores,
  type GlobalScores,
  loadSentimentSnapshots,
  saveSentimentSnapshot,
  getSentimentColor,
  getSentimentLabel,
  getSectorDriverPosts,
  hasSeenOnboarding,
  setOnboardingSeen,
} from "../../lib/sentiment-radar";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_BG = "#0A0E1A";
const CARD_BG = "#0F1520";
const GRID_LINE = "rgba(255,255,255,0.05)";
const PLAYBACK_SPEED = 2; // fixed 2× — full window in ~20s

type ViewMode = "sectors" | "global";
type TimeMode = "live" | "today" | "week" | "month";

/** Full window duration for each historical mode (ms). */
const WINDOW_MS: Record<Exclude<TimeMode, "live">, number> = {
  today: 24 * 60 * 60 * 1000,
  week:  7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

// ─── Sector descriptions ──────────────────────────────────────────────────────

const SECTOR_DESCRIPTIONS: Record<string, string> = {
  Technology: "Software, hardware, semiconductors & IT services. Driven by innovation cycles, AI adoption, and rate sensitivity.",
  Healthcare: "Pharma, biotech, hospitals & medical devices. Defensive sector driven by drug pipelines, regulation, and demographics.",
  Financials: "Banks, insurance & asset managers. Sensitive to interest rates, credit cycles, and regulatory changes.",
  "Consumer Discretionary": "Retail, autos, restaurants & leisure. Rises with consumer confidence and weakens in downturns.",
  Industrials: "Manufacturing, aerospace, defense & logistics. Tracks economic cycles and infrastructure spending.",
  "Communication Services": "Telecom, media & internet platforms. Mix of defensive telco income and high-growth digital advertising.",
  Energy: "Oil, gas & renewables. Sensitive to commodity prices, geopolitics, and energy transition policy.",
  "Consumer Staples": "Food, beverage & household goods. Defensive — demand stays stable regardless of economic conditions.",
  "Real Estate": "REITs & property. Highly rate-sensitive — falls when interest rates rise.",
  Materials: "Mining, chemicals & construction materials. Tracks global growth, commodity demand, and inflation.",
  Utilities: "Electric, gas & water utilities. Bond-like and defensive — falls when rates rise, rises in risk-off.",
};

// ─── Mulberry32 PRNG for truly random starfield ───────────────────────────────

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const _rng = mulberry32(0xdeadbeef);
const STARS = Array.from({ length: 240 }, () => {
  const x = _rng(), y = _rng(), sz = _rng(), op = _rng();
  return {
    cx: `${(x * 100).toFixed(2)}%`,
    cy: `${(y * 100).toFixed(2)}%`,
    r: sz < 0.04 ? 2.0 : sz < 0.15 ? 1.1 : 0.5,
    opacity: (0.1 + op * 0.55).toFixed(2),
  };
});

function RadarBackground() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="rn1" cx="25%" cy="38%" r="40%">
          <stop offset="0%" stopColor="#1a0e60" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="rn2" cx="70%" cy="62%" r="30%">
          <stop offset="0%" stopColor="#0a1850" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="rn3" cx="55%" cy="18%" r="22%">
          <stop offset="0%" stopColor="#200840" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="25%" cy="38%" rx="40%" ry="32%" fill="url(#rn1)" />
      <ellipse cx="70%" cy="62%" rx="32%" ry="24%" fill="url(#rn2)" />
      <ellipse cx="55%" cy="18%" rx="24%" ry="18%" fill="url(#rn3)" />
      {STARS.map((s, i) => (
        <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="white" opacity={s.opacity} />
      ))}
    </svg>
  );
}

// ─── Timeline bar component ───────────────────────────────────────────────────

function formatLabel(ts: number, mode: Exclude<TimeMode, "live">): string {
  const d = new Date(ts);
  if (mode === "today") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function TimelineBar({
  timeMode,
  progress,
  onSeek,
  playing,
  onTogglePlay,
  startTs,
  endTs,
}: {
  timeMode: Exclude<TimeMode, "live">;
  progress: number; // 0–1 over actual data range
  onSeek: (p: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
  startTs: number;
  endTs: number;
}) {
  const rangeMs = Math.max(endTs - startTs, 1);
  const currentTs = startTs + progress * rangeMs;

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-3 pt-2">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onTogglePlay}
          className="rounded-md bg-white/10 px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-white/15">
          {playing ? "Pause" : "Play"}
        </button>
        <span className="text-[10px] text-zinc-500 tabular-nums">
          {formatLabel(currentTs, timeMode)}
        </span>
      </div>
      <div className="mt-2">
        <input
          type="range"
          min={0}
          max={1}
          step={0.0001}
          value={progress}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="w-full accent-[var(--accent-color)]"
        />
        <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
          <span>{formatLabel(startTs, timeMode)}</span>
          <span>Now</span>
        </div>
      </div>
    </div>
  );
}

// ─── SSE payload ──────────────────────────────────────────────────────────────

interface SsePayload {
  type: string;
  scores?: Record<string, number>;
  globalScores?: Record<string, number>;
  lastUpdated?: number;
  sectorHeadlines?: Record<string, string[]>;
  policyHeadlines?: Record<string, string[]>;
  regionHeadlines?: Record<string, string[]>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SentimentRadarView() {
  const [viewMode, setViewMode] = useState<ViewMode>("sectors");
  const [timeMode, setTimeMode] = useState<TimeMode>("live");
  // 0–1 representing position within the current time window
  const [playbackProgress, setPlaybackProgress] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [globalScores, setGlobalScores] = useState<Record<string, number>>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [snapshots, setSnapshots] = useState<SentimentSnapshot[]>([]);
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null);
  const [selectedSector, setSelectedSector] = useState<SectorId | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<RegionId | null>(null);
  const [sweepAngle, setSweepAngle] = useState(0);
  const [sseConnected, setSseConnected] = useState(false);
  const [sectorHeadlines, setSectorHeadlines] = useState<Record<string, string[]>>({});
  const [policyHeadlines, setPolicyHeadlines] = useState<Record<string, string[]>>({});
  const [regionHeadlines, setRegionHeadlines] = useState<Record<string, string[]>>({});

  const rafRef = useRef<number>(0);
  const progressRef = useRef(1);
  progressRef.current = playbackProgress;
  const lastTickRef = useRef(0);
  const sweepRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load snapshots
  useEffect(() => {
    const list = loadSentimentSnapshots();
    setSnapshots(list);
    const latest = list[list.length - 1];
    if (latest?.scores) setScores(latest.scores);
    if (latest?.globalScores) setGlobalScores(latest.globalScores);
  }, []);

  // SSE for live mode
  useEffect(() => {
    if (timeMode !== "live") return;
    const es = new EventSource("/api/sentiment-stream");
    setSseConnected(false);
    es.onopen = () => setSseConnected(true);
    es.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data as string) as SsePayload;
        if (data.type !== "scores") return;
        if (data.scores) setScores(data.scores);
        if (data.globalScores) setGlobalScores(data.globalScores);
        setLastUpdated(new Date(data.lastUpdated ?? Date.now()));
        setSseConnected(true);
        if (data.sectorHeadlines) setSectorHeadlines(data.sectorHeadlines);
        if (data.policyHeadlines) setPolicyHeadlines(data.policyHeadlines);
        if (data.regionHeadlines) setRegionHeadlines(data.regionHeadlines);
        if (data.scores && data.globalScores) {
          const snap: SentimentSnapshot = {
            timestamp: new Date().toISOString(),
            scores: data.scores as SentimentScores,
            globalScores: data.globalScores as GlobalScores,
          };
          saveSentimentSnapshot(snap);
          setSnapshots((prev) => {
            const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
            return [...prev, snap].filter((x) => new Date(x.timestamp).getTime() > cutoff).slice(-48 * 30);
          });
        }
      } catch { /* ignore */ }
    };
    es.onerror = () => setSseConnected(false);
    return () => { es.close(); setSseConnected(false); };
  }, [timeMode]);

  // Radar sweep
  useEffect(() => {
    sweepRef.current = setInterval(() => setSweepAngle((a) => (a + 2) % 360), 50);
    return () => { if (sweepRef.current) clearInterval(sweepRef.current); };
  }, []);

  useEffect(() => { if (!hasSeenOnboarding()) setOnboardingStep(0); }, []);

  // Snapshots in the current time window
  const filteredSnapshots = useMemo(() => {
    if (timeMode === "live") return snapshots;
    const wms = WINDOW_MS[timeMode];
    const cutoff = Date.now() - wms;
    return snapshots.filter((sn) => new Date(sn.timestamp).getTime() >= cutoff);
  }, [snapshots, timeMode]);

  // Clamp progress to [0,1]
  useEffect(() => {
    if (playbackProgress > 1) setPlaybackProgress(1);
    if (playbackProgress < 0) setPlaybackProgress(0);
  }, [playbackProgress]);

  // Playback RAF — progress rate: full window in ~40s at 1×, ~20s at 2×
  useEffect(() => {
    if (!playing || timeMode === "live") return;
    if (typeof requestAnimationFrame === "undefined") return;
    const RATE = (1 / 40) * PLAYBACK_SPEED; // fraction of window per second

    function tick(now: number) {
      const prev = lastTickRef.current;
      lastTickRef.current = now;
      const dt = prev > 0 ? (now - prev) / 1000 : 0;
      const next = Math.min(progressRef.current + dt * RATE, 1);
      progressRef.current = next;
      setPlaybackProgress(next);
      if (next >= 1) { setPlaying(false); return; }
      rafRef.current = requestAnimationFrame(tick);
    }
    lastTickRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (typeof cancelAnimationFrame !== "undefined" && rafRef.current)
        cancelAnimationFrame(rafRef.current);
    };
  }, [playing, timeMode]);

  // Data range: first snapshot → last snapshot (so 0–1 spans only real data, no tail drift)
  const dataRange = useMemo(() => {
    if (timeMode === "live" || filteredSnapshots.length === 0) return null;
    return {
      startTs: new Date(filteredSnapshots[0]!.timestamp).getTime(),
      endTs: new Date(filteredSnapshots[filteredSnapshots.length - 1]!.timestamp).getTime(),
    };
  }, [timeMode, filteredSnapshots]);

  // Interpolated scores for smooth historical playback (mapped over actual data range)
  const interpolatedScores = useMemo(() => {
    if (timeMode === "live" || filteredSnapshots.length === 0 || !dataRange) return null;

    if (filteredSnapshots.length === 1) {
      return { scores: filteredSnapshots[0]!.scores, globalScores: filteredSnapshots[0]!.globalScores };
    }

    const rangeMs = Math.max(dataRange.endTs - dataRange.startTs, 1);
    const ts = dataRange.startTs + playbackProgress * rangeMs;

    // Find surrounding snapshots
    let prevIdx = -1;
    for (let i = 0; i < filteredSnapshots.length; i++) {
      if (new Date(filteredSnapshots[i]!.timestamp).getTime() <= ts) prevIdx = i;
      else break;
    }

    if (prevIdx === -1) {
      return { scores: filteredSnapshots[0]!.scores, globalScores: filteredSnapshots[0]!.globalScores };
    }
    if (prevIdx === filteredSnapshots.length - 1) {
      const last = filteredSnapshots[filteredSnapshots.length - 1]!;
      return { scores: last.scores, globalScores: last.globalScores };
    }

    const prev = filteredSnapshots[prevIdx]!;
    const next = filteredSnapshots[prevIdx + 1]!;
    const t1 = new Date(prev.timestamp).getTime();
    const t2 = new Date(next.timestamp).getTime();
    const rawAlpha = t2 > t1 ? Math.max(0, Math.min(1, (ts - t1) / (t2 - t1))) : 0;
    // Smoothstep: ease in/out so large inter-snapshot jumps don't look abrupt
    const alpha = rawAlpha * rawAlpha * (3 - 2 * rawAlpha);

    function lerp(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
      const out: Record<string, number> = {};
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        out[k] = (a[k] ?? 50) + ((b[k] ?? 50) - (a[k] ?? 50)) * alpha;
      }
      return out;
    }

    return {
      scores: lerp(prev.scores, next.scores),
      globalScores: lerp(prev.globalScores, next.globalScores),
    };
  }, [timeMode, filteredSnapshots, playbackProgress, dataRange]);

  // Derive display scores directly — no setState/effect so there's only one render per RAF frame
  const displaySectors = useMemo(
    () => (timeMode !== "live" && interpolatedScores ? interpolatedScores.scores : scores),
    [timeMode, interpolatedScores, scores],
  );
  const displayGlobal = useMemo(
    () => (timeMode !== "live" && interpolatedScores ? interpolatedScores.globalScores : globalScores),
    [timeMode, interpolatedScores, globalScores],
  );

  // Period change baseline = oldest snapshot in current window
  const startSnapshot = useMemo(() => {
    if (timeMode === "live") {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      return snapshots.find((sn) => new Date(sn.timestamp).getTime() >= cutoff) ?? null;
    }
    return filteredSnapshots[0] ?? null;
  }, [timeMode, snapshots, filteredSnapshots]);

  const activeItems = viewMode === "sectors" ? US_SECTORS : GLOBAL_REGIONS;
  const activeScores = useMemo(
    () => (viewMode === "sectors" ? displaySectors : displayGlobal) as Record<string, number>,
    [viewMode, displaySectors, displayGlobal],
  );

  const changeData = useMemo(() => {
    if (!startSnapshot) return null;
    const start: Record<string, number> = viewMode === "sectors" ? startSnapshot.scores : startSnapshot.globalScores;
    return activeItems
      .map((id) => ({
        id,
        current: Math.round(activeScores[id] ?? 50),
        delta: Math.round((activeScores[id] ?? 50) - (start[id] ?? 50)),
      }))
      .filter((d) => d.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [startSnapshot, viewMode, activeScores, activeItems]);

  const hasScores = Object.keys(activeScores).length > 0;
  const overallScore = hasScores ? Object.values(activeScores).reduce((a, b) => a + b, 0) / Object.keys(activeScores).length : 50;
  const moodLabel = !hasScores ? "—" : overallScore >= 52 ? "BULLISH" : overallScore >= 48 ? "NEUTRAL" : "BEARISH";
  const moodColor = overallScore >= 52 ? "#86EFAC" : overallScore >= 48 ? "#FDE68A" : "#FCA5A5";

  const topBullish = [...activeItems].map((id) => ({ id, score: Math.round(activeScores[id] ?? 50) })).sort((a, b) => b.score - a.score).slice(0, 3);
  const topBearish = [...activeItems].map((id) => ({ id, score: Math.round(activeScores[id] ?? 50) })).sort((a, b) => a.score - b.score).slice(0, 3);
  const noHistoricalData = timeMode !== "live" && filteredSnapshots.length === 0;
  const timeModeLabel = timeMode === "live" ? "today" : timeMode;

  return (
    <div className="min-h-screen" style={{ backgroundColor: PAGE_BG }}>
      {/* Header */}
      <header className="border-b border-white/10 px-4 py-3">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white">Sentiment Radar</h1>
            <p className="text-xs text-zinc-500">Community sentiment and news analysis visualized in real time</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* View mode */}
            <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5">
              {(["sectors", "global"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setViewMode(m)}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition ${viewMode === m ? "bg-white/15 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
                  {m === "sectors" ? "US Sectors" : "Global"}
                </button>
              ))}
            </div>
            {/* Time mode */}
            <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5">
              {(["live", "today", "week", "month"] as const).map((m) => (
                <button key={m} type="button"
                  onClick={() => { setTimeMode(m); setPlaying(false); setPlaybackProgress(0); }}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition ${timeMode === m ? "bg-white/15 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
                  {m === "live" && (
                    <span className="relative mr-1.5 inline-flex h-1.5 w-1.5 shrink-0 align-middle">
                      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${sseConnected ? "bg-emerald-400" : "bg-yellow-400"}`} />
                      <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${sseConnected ? "bg-emerald-400" : "bg-yellow-400"}`} />
                    </span>
                  )}
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Timeline bar — only in historical modes */}
      {timeMode !== "live" && (
        <div className="border-b border-white/10" style={{ backgroundColor: "#0a0d16" }}>
          {noHistoricalData ? (
            <div className="mx-auto max-w-[1600px] px-4 py-3 text-xs text-zinc-600">
              No snapshots in this window yet — run in <button type="button" className="text-zinc-400 underline" onClick={() => setTimeMode("live")}>Live</button> mode to accumulate real data.
            </div>
          ) : (
            <TimelineBar
              timeMode={timeMode as Exclude<TimeMode, "live">}
              progress={playbackProgress}
              onSeek={setPlaybackProgress}
              playing={playing}
              onTogglePlay={() => setPlaying((p) => !p)}
              startTs={dataRange?.startTs ?? Date.now()}
              endTs={dataRange?.endTs ?? Date.now()}
            />
          )}
        </div>
      )}

      <div className="mx-auto flex max-w-[1600px] gap-4 p-4">
        {/* Radar */}
        <main className="relative h-[520px] flex-1 overflow-hidden rounded-xl border border-white/10"
          style={{ backgroundColor: "#04060f" }}>
          <RadarBackground />
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="h-full w-full" viewBox="0 0 600 500">
              {[1, 2, 3, 4].map((r) => (
                <circle key={r} cx="300" cy="250" r={r * 60} fill="none" stroke={GRID_LINE} strokeWidth="1" />
              ))}
            </svg>
          </div>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <svg className="h-full w-full" viewBox="0 0 600 500">
              <defs>
                <linearGradient id="sweepGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="white" stopOpacity="0" />
                  <stop offset="100%" stopColor="white" stopOpacity="0.1" />
                </linearGradient>
              </defs>
              <circle cx="300" cy="250" r="240" fill="none" stroke="url(#sweepGrad)"
                strokeWidth="2" strokeDasharray="4 200"
                transform={`rotate(${sweepAngle}, 300, 250)`} />
            </svg>
          </div>

          {noHistoricalData ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <p className="text-sm font-medium text-zinc-400">No historical data yet</p>
              <p className="max-w-xs text-center text-xs text-zinc-600">Switch to Live to start collecting real snapshots.</p>
              <button type="button" onClick={() => setTimeMode("live")}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/15">Switch to Live</button>
            </div>
          ) : viewMode === "sectors" ? (
            <SectorBubbles scores={displaySectors} onSelect={(s) => { setSelectedSector(s); setSelectedRegion(null); }} selected={selectedSector} />
          ) : (
            <GlobalBlobs scores={displayGlobal} onSelect={(r) => { setSelectedRegion(r); setSelectedSector(null); }} selected={selectedRegion} />
          )}
        </main>

        {/* Right panel */}
        <aside className="h-[520px] w-[280px] shrink-0 overflow-y-auto rounded-xl border border-white/10 p-4" style={{ backgroundColor: CARD_BG }}>
          <section>
            <p className="text-[10px] text-zinc-500">
              {timeMode === "live" ? (sseConnected ? "Live — connected" : "Live — connecting…") :
              dataRange
                ? new Date(dataRange.startTs + playbackProgress * (dataRange.endTs - dataRange.startTs)).toLocaleString()
                : "—"}
            </p>
            <p className="mt-1 text-xs font-medium text-zinc-400">Overall market mood</p>
            <span className="mt-1 inline-block rounded px-2 py-1 text-sm font-semibold"
              style={{ backgroundColor: `${moodColor}22`, color: moodColor }}>
              {moodLabel}
            </span>
          </section>
          <section>
            <h3 className="text-xs font-semibold text-zinc-300">Top Bullish</h3>
            <ul className="mt-2 space-y-1">
              {topBullish.map(({ id, score }) => (
                <li key={id} className="flex justify-between text-xs">
                  <span className="mr-2 truncate text-zinc-300">{id}</span>
                  <span className="shrink-0 text-emerald-400">{score}</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="text-xs font-semibold text-zinc-300">Top Bearish</h3>
            <ul className="mt-2 space-y-1">
              {topBearish.map(({ id, score }) => (
                <li key={id} className="flex justify-between text-xs">
                  <span className="mr-2 truncate text-zinc-300">{id}</span>
                  <span className="shrink-0 text-red-400">{score}</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="text-xs font-semibold text-zinc-300">
              Changes <span className="font-normal text-zinc-600">vs start of {timeModeLabel}</span>
            </h3>
            {!changeData || changeData.length === 0 ? (
              <p className="mt-1.5 text-[10px] text-zinc-600">
                {startSnapshot ? "No score changes yet in this period." : "Needs 2+ snapshots to compare."}
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {changeData.map(({ id, current, delta }) => (
                  <li key={id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-zinc-400">{id}</span>
                    <span className="flex shrink-0 items-center gap-1.5 font-mono tabular-nums">
                      <span className="text-zinc-500">{current}</span>
                      <span className={delta > 0 ? "text-emerald-400" : "text-red-400"}>
                        {delta > 0 ? "▲" : "▼"}{Math.abs(delta)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <p className="text-[10px] text-zinc-600">
              {lastUpdated ? `Updated ${Math.round((Date.now() - lastUpdated.getTime()) / 60000)} min ago` : "Waiting for first update…"}
            </p>
          </section>
        </aside>
      </div>

      {/* Bubble detail panel */}
      {(selectedSector ?? selectedRegion) && (
        <div className="mx-auto max-w-[1600px] border-t border-white/10 px-4 py-4">
          <BubbleDetailPanel
            sector={selectedSector}
            region={selectedRegion}
            score={selectedSector ? (displaySectors[selectedSector] ?? 50) : selectedRegion ? (displayGlobal[selectedRegion] ?? 50) : 50}
            sectorHeadlines={sectorHeadlines}
            policyHeadlines={policyHeadlines}
            regionHeadlines={regionHeadlines}
            onClose={() => { setSelectedSector(null); setSelectedRegion(null); }}
          />
        </div>
      )}

      {/* How it works */}
      <div className="mx-auto max-w-[1600px] border-t border-white/10 px-4 py-6">
        <h2 className="text-sm font-semibold text-zinc-200">How it works</h2>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-zinc-400">
          Sentiment Radar streams live business news headlines, keyword-matched to market sectors and scored for positive or negative tone. Scores blend the incoming signal with a rolling baseline. Bubble <strong className="text-zinc-300">size</strong> reflects relative market-cap weight; bubble <strong className="text-zinc-300">color</strong> shows sentiment: dark green = very bullish (75–100), light green = bullish (55–75), yellow = neutral (45–55), orange = bearish (30–45), red = very bearish (0–30). Today / Week / Month replay spans your actual collected data — play from beginning to now.
        </p>
      </div>

      {/* Onboarding */}
      {onboardingStep !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-w-sm rounded-xl border border-white/20 p-6 shadow-xl" style={{ backgroundColor: CARD_BG }}>
            <p className="text-sm text-zinc-200">
              {onboardingStep === 0 && "Each bubble = a market sector. Color shows live news sentiment."}
              {onboardingStep === 1 && "Green = bullish, Red = bearish. Size = relative market cap weight."}
              {onboardingStep === 2 && "Use Today / Week / Month to replay real sentiment history. Dots on the timeline = actual data points."}
            </p>
            <div className="mt-4 flex justify-between">
              <button type="button"
                onClick={() => { if (onboardingStep < 2) setOnboardingStep(onboardingStep + 1); else { setOnboardingStep(null); setOnboardingSeen(); } }}
                className="rounded bg-white/15 px-3 py-1.5 text-xs text-white">
                {onboardingStep < 2 ? "Next" : "Done"}
              </button>
              <button type="button" onClick={() => { setOnboardingStep(null); setOnboardingSeen(); }}
                className="rounded px-3 py-1.5 text-xs text-zinc-400 hover:text-white">Skip</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sector Bubbles ───────────────────────────────────────────────────────────

const SECTOR_SHORT: Record<string, string> = {
  "Communication Services": "Comms",
  "Consumer Discretionary": "Consumer Disc",
  "Consumer Staples": "Staples",
  "Real Estate": "Real Est",
};
function sectorLabel(s: string) { return SECTOR_SHORT[s] ?? s.split(" ")[0] ?? s; }

function SectorBubbles({ scores, onSelect, selected }: {
  scores: Record<string, number>;
  onSelect: (s: SectorId | null) => void;
  selected: SectorId | null;
}) {
  const positions: [number, number][] = [
    [300, 120], [180, 180], [420, 180], [120, 250], [300, 250], [480, 250],
    [180, 320], [420, 320], [300, 380], [240, 320], [360, 320],
  ];
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {US_SECTORS.map((sector, i) => {
        const score = Math.round(scores[sector] ?? 50);
        const r = 18 + (score / 100) * 36;
        const [cx, cy] = positions[i] ?? [300, 250];
        const color = getSentimentColor(score);
        return (
          <button key={sector} type="button" onClick={() => onSelect(selected === sector ? null : sector)}
            className="absolute flex items-center justify-center rounded-full border-2 transition-all duration-[800ms] ease-out hover:scale-105 sentiment-bubble-pulse"
            style={{
              left: `${(cx / 600) * 100}%`, top: `${(cy / 500) * 100}%`,
              width: r * 2, height: r * 2, marginLeft: -r, marginTop: -r,
              backgroundColor: `${color}33`, borderColor: selected === sector ? "white" : color,
              boxShadow: `0 0 20px ${color}40`,
            }}
            title={`${sector}: ${score}/100`}>
            <span className="truncate px-1 text-center text-[10px] font-medium text-white drop-shadow" style={{ maxWidth: r * 1.8 }}>
              {sectorLabel(sector)}
            </span>
            <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-zinc-400">{score}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Global Blobs ─────────────────────────────────────────────────────────────

const GLOBAL_POS: [number, number][] = [
  [300, 140], [180, 250], [420, 250], [300, 350], [120, 250], [480, 250], [300, 250],
];
const GLOBAL_SHORT: Record<string, string> = {
  "North America": "N.America", "Asia Pacific": "Asia Pac",
  "Emerging Markets": "Emerging", "Middle East & Africa": "ME & Africa",
};
function globalLabel(r: string) { return GLOBAL_SHORT[r] ?? (r.length > 10 ? r.split(" ")[0] ?? r : r); }

function GlobalBlobs({ scores, onSelect, selected }: {
  scores: Record<string, number>;
  onSelect?: (r: RegionId) => void;
  selected?: RegionId | null;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {GLOBAL_REGIONS.map((region, i) => {
        const score = Math.round(scores[region] ?? 50);
        const r = 22 + (score / 100) * 30;
        const [cx, cy] = GLOBAL_POS[i] ?? [300, 250];
        const color = getSentimentColor(score);
        const isSel = selected === region;
        return (
          <button key={region} type="button" onClick={() => onSelect?.(region as RegionId)}
            className="absolute flex flex-col items-center justify-center rounded-full border-2 transition-all duration-[800ms] ease-out hover:scale-105 sentiment-bubble-pulse cursor-pointer"
            style={{
              left: `${(cx / 600) * 100}%`, top: `${(cy / 500) * 100}%`,
              width: r * 2, height: r * 2, marginLeft: -r, marginTop: -r,
              backgroundColor: `${color}33`, borderColor: isSel ? "white" : color,
              borderWidth: isSel ? 3 : 2,
              boxShadow: isSel ? `0 0 24px ${color}80` : `0 0 20px ${color}40`,
            }}
            title={`${region}: ${score}/100`}>
            <span className="truncate px-1 text-center text-[10px] font-medium text-white drop-shadow" style={{ maxWidth: r * 1.8 }}>{globalLabel(region)}</span>
            <span className="mt-0.5 text-[10px] text-zinc-400">{score}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Bubble Detail Panel ──────────────────────────────────────────────────────

function HeadlineList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="mt-1 text-xs text-zinc-600">{empty}</p>;
  return (
    <ul className="mt-2 space-y-1.5">
      {items.map((h, i) => <li key={i} className="text-xs leading-snug text-zinc-300">• {h}</li>)}
    </ul>
  );
}

function scoreExplanation(score: number, name: string, newsCount: number): string {
  const level = score >= 70 ? "strongly bullish" : score >= 58 ? "bullish" : score >= 48 ? "neutral" : score >= 35 ? "bearish" : "strongly bearish";
  if (newsCount > 0)
    return `${name} is reading ${level} (${score}/100) based on ${newsCount} recent headline${newsCount > 1 ? "s" : ""} matched to this sector.`;
  return `${name} is reading ${level} (${score}/100). No matching headlines yet — score reflects baseline market conditions.`;
}

function BubbleDetailPanel({ sector, region, score, sectorHeadlines, policyHeadlines, regionHeadlines, onClose }: {
  sector: SectorId | null;
  region: RegionId | null;
  score: number;
  sectorHeadlines: Record<string, string[]>;
  policyHeadlines: Record<string, string[]>;
  regionHeadlines: Record<string, string[]>;
  onClose: () => void;
}) {
  const name = sector ?? region ?? "";
  const roundedScore = Math.round(score);
  const color = getSentimentColor(roundedScore);
  const label = getSentimentLabel(roundedScore);
  const posts = sector ? getSectorDriverPosts(sector) : [];
  const description = sector ? (SECTOR_DESCRIPTIONS[sector] ?? null) : null;
  const newsItems = sector ? (sectorHeadlines[sector] ?? []) : region ? (regionHeadlines[region] ?? []) : [];
  const policyItems = sector ? (policyHeadlines[sector] ?? []) : [];

  return (
    <div className="rounded-xl border border-white/10 p-4" style={{ backgroundColor: CARD_BG }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-zinc-200">{name}</span>
            <span className="rounded px-2 py-1 text-sm font-medium"
              style={{ backgroundColor: `${color}22`, color }}>
              {roundedScore} — {label}
            </span>
          </div>
          {/* Live one-liner explanation */}
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
            {scoreExplanation(roundedScore, name, newsItems.length)}
          </p>
          {description && (
            <p className="mt-1 text-xs leading-relaxed text-zinc-600">{description}</p>
          )}
        </div>
        <button type="button" onClick={onClose}
          className="shrink-0 rounded bg-white/10 px-2 py-1 text-xs text-zinc-400 hover:bg-white/15">
          Close
        </button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sector && (
          <>
            <section>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">My posts</p>
              <p className="mt-0.5 text-[10px] text-zinc-600">From your profile activity</p>
              {posts.length === 0 ? (
                <p className="mt-1 text-xs text-zinc-600">None of your posts mention this sector yet.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {posts.slice(0, 5).map((p, i) => (
                    <li key={i} className="rounded border border-white/5 bg-white/5 p-2 text-xs text-zinc-300">
                      <span className={`mr-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] ${p.sentiment === "bullish" ? "bg-emerald-500/20 text-emerald-400" : p.sentiment === "bearish" ? "bg-red-500/20 text-red-400" : "bg-zinc-500/20 text-zinc-400"}`}>
                        {p.sentiment}
                      </span>
                      {p.text.slice(0, 120)}{p.text.length > 120 ? "…" : ""}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">News signals</p>
              <HeadlineList items={newsItems} empty="No matching headlines yet — updates after next poll." />
            </section>
            <section>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">Politics &amp; policy</p>
              <HeadlineList items={policyItems} empty="No policy headlines matched this sector yet." />
            </section>
          </>
        )}
        {region && !sector && (
          <>
            <section>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">Regional news</p>
              <HeadlineList items={newsItems} empty="No regional headlines yet — updates after next poll." />
            </section>
            <section>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">About this score</p>
              <p className="mt-1 text-xs text-zinc-400">
                Score reflects news and macro sentiment for this region. Positive economic headlines and stable politics lift the grade; risk-off events and political stress weigh it down.
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
