"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "../../components/AuthContext";
import type { RiskProfileKey } from "../../types";

const GROWTH_SHARE_KEY = "xchange-ai-share";
const INFLATION_RATE = 0.032;
const DEFAULT_INITIAL = 0;
const YEARS = 30;
const RATES = {
  conservative: 0.06,
  moderate: 0.09,
  aggressive: 0.13,
} as const;
const SPY_HISTORICAL = 0.105;
const ASSET_CAGRS: Record<string, { rate: number; label: string; warning?: string }> = {
  "": { rate: 0, label: "" },
  SPY: { rate: 0.105, label: "S&P 500 Historical Avg (10.5%)" },
  QQQ: { rate: 0.142, label: "Nasdaq QQQ (14.2%)" },
  BTC: { rate: 0.4, label: "Bitcoin (40%)", warning: "High volatility" },
  GLD: { rate: 0.078, label: "Gold GLD (7.8%)" },
};
type YtdData = {
  spy: { current: number; jan1: number; ytdPercent: number; label: string };
  qqq: { current: number; jan1: number; ytdPercent: number; label: string };
  btc: { current: number; jan1: number; ytdPercent: number; label: string };
};

function getRiskProfile(user: { riskProfile?: string } | null): RiskProfileKey | null {
  if (!user?.riskProfile) return null;
  const p = user.riskProfile;
  if (p === "passive" || p === "moderate" || p === "aggressive") return p;
  return null;
}

function projectCurve(
  annualRate: number,
  monthlyContribution: number,
  initial: number,
  years: number,
  inflationAdj: number
): number[] {
  const monthlyRate = (annualRate * (1 - inflationAdj)) / 12;
  const values: number[] = [];
  let balance = initial;
  for (let m = 1; m <= years * 12; m++) {
    balance = balance * (1 + monthlyRate) + monthlyContribution;
    if (m % 12 === 0) values.push(balance);
  }
  return values;
}

function findMilestoneYear(values: number[], target: number): number | null {
  for (let i = 0; i < values.length; i++) {
    if (values[i] >= target) return i + 1;
  }
  return null;
}

function findDoubleYear(values: number[]): number | null {
  if (values.length < 2 || values[0] <= 0) return null;
  const firstYear = values[0];
  for (let i = 1; i < values.length; i++) {
    if (values[i] >= firstYear * 2) return i + 1;
  }
  return null;
}

function InfoTooltip({ id, children, content }: { id: string; children: React.ReactNode; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      {children}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-500/70 text-[10px] font-medium leading-none text-zinc-200 transition-colors hover:border-white/30 hover:bg-white/5 hover:text-zinc-100"
        aria-label={id}
        title={content}
      >
        i
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[280px] max-w-[380px] rounded-lg border border-white/10 bg-[#0F1520] px-3 py-2 text-[11px] leading-snug text-zinc-300 shadow-xl animate-[fadeIn_0.15s_ease-out]">
          {content}
        </div>
      )}
    </span>
  );
}

export default function GrowthPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [ytd, setYtd] = useState<YtdData | null>(null);
  const [ytdLoading, setYtdLoading] = useState(true);
  const [inflationAdjusted, setInflationAdjusted] = useState(false);
  const [assetDropdown, setAssetDropdown] = useState<string>("");
  const [monthlyContribution, setMonthlyContribution] = useState(500);
  const [initialInvestment] = useState(DEFAULT_INITIAL);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [milestoneHover, setMilestoneHover] = useState<{ label: string; year: number } | null>(null);
  const graphRef = useRef<HTMLDivElement>(null);

  const riskProfile = getRiskProfile(user) ?? "moderate";
  const profileLabel = riskProfile === "passive" ? "Conservative" : riskProfile === "moderate" ? "Moderate" : "Aggressive";
  const recommendedCurve = riskProfile === "passive" ? "conservative" : riskProfile === "moderate" ? "moderate" : "aggressive";

  useEffect(() => {
    let cancelled = false;
    fetch("/api/growth-ytd", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setYtd(data);
      })
      .finally(() => {
        if (!cancelled) setYtdLoading(false);
      });
    const t = setInterval(() => {
      fetch("/api/growth-ytd", { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled) setYtd(data);
        });
    }, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const inflationAdj = inflationAdjusted ? INFLATION_RATE : 0;

  const curves = useMemo(() => {
    const conservative = projectCurve(RATES.conservative, monthlyContribution, initialInvestment, YEARS, inflationAdj);
    const moderate = projectCurve(RATES.moderate, monthlyContribution, initialInvestment, YEARS, inflationAdj);
    const aggressive = projectCurve(RATES.aggressive, monthlyContribution, initialInvestment, YEARS, inflationAdj);
    const spyHist = projectCurve(SPY_HISTORICAL, monthlyContribution, initialInvestment, YEARS, inflationAdj);
    const asset = assetDropdown ? ASSET_CAGRS[assetDropdown] : null;
    const assetCurve = asset ? projectCurve(asset.rate, monthlyContribution, initialInvestment, YEARS, inflationAdj) : null;
    return {
      conservative,
      moderate,
      aggressive,
      spyHist,
      assetCurve,
      assetLabel: asset?.label,
      assetWarning: asset?.warning,
    };
  }, [monthlyContribution, initialInvestment, inflationAdj, assetDropdown]);

  const noContribCurves = useMemo(() => {
    const c = projectCurve(RATES.conservative, 0, initialInvestment, YEARS, inflationAdj);
    const m = projectCurve(RATES.moderate, 0, initialInvestment, YEARS, inflationAdj);
    const a = projectCurve(RATES.aggressive, 0, initialInvestment, YEARS, inflationAdj);
    return { conservative: c, moderate: m, aggressive: a };
  }, [initialInvestment, inflationAdj]);

  const maxValue = useMemo(() => {
    const all = [
      ...curves.conservative,
      ...curves.moderate,
      ...curves.aggressive,
      ...curves.spyHist,
      ...(curves.assetCurve ?? []),
    ];
    return Math.max(...all, 1);
  }, [curves]);

  const milestonesByCurve = useMemo(() => {
    const keys = ["conservative", "moderate", "aggressive"] as const;
    const out: Record<string, { double?: number; 100000?: number; 500000?: number; 1000000?: number }> = {};
    keys.forEach((k) => {
      const vals = curves[k];
      out[k] = {
        double: findDoubleYear(vals) ?? undefined,
        "100000": findMilestoneYear(vals, 100000) ?? undefined,
        "500000": findMilestoneYear(vals, 500000) ?? undefined,
        "1000000": findMilestoneYear(vals, 1000000) ?? undefined,
      };
    });
    return out;
  }, [curves]);

  const finalWithContrib = curves.moderate[YEARS - 1] ?? 0;
  const finalWithoutContrib = noContribCurves.moderate[YEARS - 1] ?? 0;
  const extraFromContrib = finalWithContrib - finalWithoutContrib;

  const handleShare = useCallback(() => {
    try {
      sessionStorage.setItem(
        GROWTH_SHARE_KEY,
        JSON.stringify({
          content: `📈 If I invest $${monthlyContribution}/mo for ${YEARS} years with a ${profileLabel.toLowerCase()} strategy, I could have $${Math.round(finalWithContrib).toLocaleString()} by ${new Date().getFullYear() + YEARS}. Here's my projection:`,
        }),
      );
    } catch {}
    router.push("/feed");
  }, [monthlyContribution, finalWithContrib, profileLabel, router]);

  const yearLabels = Array.from({ length: YEARS }, (_, i) => i + 1);

  return (
    <div className="min-h-screen app-page font-[&quot;Times_New_Roman&quot;,serif]">
      <div className="mx-auto max-w-5xl px-6 py-8 lg:px-8 lg:py-12">
        {/* 1. YTD Banner */}
        <section
          className={`mb-8 rounded-2xl border px-6 py-5 transition-all duration-300 ${
            (ytd?.spy?.ytdPercent ?? 0) >= 0
              ? "border-emerald-500/30 bg-emerald-500/5 shadow-[0_0_30px_rgba(16,185,129,0.15)]"
              : "border-red-500/30 bg-red-500/5 shadow-[0_0_30px_rgba(239,68,68,0.12)]"
          }`}
        >
          <p className="text-center text-xs font-medium uppercase tracking-wider text-zinc-400">
            Live market context for {new Date().getFullYear()}
          </p>
          {ytdLoading ? (
            <div className="mt-4 flex justify-center gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 w-28 animate-pulse rounded-xl bg-white/10" />
              ))}
            </div>
          ) : ytd ? (
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-center">
                <p className="text-[10px] uppercase text-zinc-500">S&P 500 YTD</p>
                <p className={`mt-1 text-lg font-semibold ${ytd.spy.ytdPercent >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {ytd.spy.ytdPercent >= 0 ? "+" : ""}
                  {ytd.spy.ytdPercent.toFixed(1)}%
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-center">
                <p className="text-[10px] uppercase text-zinc-500">Nasdaq YTD</p>
                <p className={`mt-1 text-lg font-semibold ${ytd.qqq.ytdPercent >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {ytd.qqq.ytdPercent >= 0 ? "+" : ""}
                  {ytd.qqq.ytdPercent.toFixed(1)}%
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-center">
                <p className="text-[10px] uppercase text-zinc-500">Bitcoin YTD</p>
                <p className={`mt-1 text-lg font-semibold ${ytd.btc.ytdPercent >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {ytd.btc.ytdPercent >= 0 ? "+" : ""}
                  {ytd.btc.ytdPercent.toFixed(1)}%
                </p>
              </div>
            </div>
          ) : null}
          <p className="mt-3 text-center text-[10px] text-zinc-500">
            Prices from Finnhub · Updates every 5 minutes
          </p>
        </section>

        {/* Header */}
        <div className="mb-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--accent-color)]/80">
            Growth
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">
            Long-term projection
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            See how different return assumptions and monthly contributions could play out. Not financial advice.
          </p>
        </div>

        {/* Risk profile badge */}
        {user && (
          <div className="mb-4 flex items-center gap-2">
            <span className="rounded-full border border-[var(--accent-color)]/40 bg-[var(--accent-color)]/10 px-3 py-1 text-xs font-medium text-[var(--accent-color)]">
              Recommended for your {profileLabel} profile
            </span>
            <Link
              href="/settings"
              className="text-[10px] text-zinc-500 underline hover:text-[var(--accent-color)]"
            >
              Risk profile
            </Link>
            <InfoTooltip
              id="risk-profile"
              content="Your chosen risk profile. The matching curve is highlighted. You can change it in Settings."
            >
              <span />
            </InfoTooltip>
          </div>
        )}

        {/* Graph section */}
        <section className="rounded-2xl border border-white/5 bg-black/30 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={inflationAdjusted}
                  onChange={(e) => setInflationAdjusted(e.target.checked)}
                  className="rounded border-white/20 bg-white/5 text-[var(--accent-color)] focus:ring-[var(--accent-color)]"
                />
                Show inflation adjusted returns
              </label>
              <InfoTooltip
                id="inflation"
                content="When on, all curves are reduced by the current inflation rate (3.2%) to show real (inflation-adjusted) purchasing power."
              >
                <span />
              </InfoTooltip>
              <span className="text-[11px] text-zinc-500">What if I invested in:</span>
              <div className="flex items-center gap-1.5">
                {(["SPY", "QQQ", "BTC", "GLD"] as const).map((key) => {
                  const asset = ASSET_CAGRS[key];
                  const isSelected = assetDropdown === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAssetDropdown(isSelected ? "" : key)}
                      title={`${asset.label}${asset.warning ? ` — ${asset.warning}` : ""}`}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold transition-colors ${
                        isSelected
                          ? "border-[var(--accent-color)]/60 bg-[var(--accent-color)]/20 text-[var(--accent-color)]"
                          : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:bg-white/10 hover:text-zinc-200"
                      }`}
                    >
                      {key}
                    </button>
                  );
                })}
              </div>
              {curves.assetWarning && (
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-300">
                  {curves.assetWarning}
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500">
              {inflationAdjusted ? "Real returns (inflation adjusted)" : "Nominal returns"}
            </p>
          </div>

          <div
            ref={graphRef}
            className="relative h-64 w-full rounded-xl border border-white/5 bg-gradient-to-t from-slate-950 via-slate-900 to-slate-800 px-4 py-4"
            onMouseLeave={() => setHoverIndex(null)}
          >
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="h-full w-full text-xs text-zinc-500"
            >
              {[25, 50, 75].map((y) => (
                <line
                  key={y}
                  x1="0"
                  y1={100 - y}
                  x2="100"
                  y2={100 - y}
                  stroke="rgba(148,163,184,0.2)"
                  strokeWidth="0.3"
                />
              ))}

              {curves.conservative.length > 1 && (
                <>
                  {/* S&P Historical dashed */}
                  <polyline
                    fill="none"
                    stroke="rgba(255,255,255,0.6)"
                    strokeWidth="0.6"
                    strokeDasharray="2 2"
                    points={curves.spyHist
                      .map((v, i) => {
                        const x = (i / (curves.spyHist.length - 1)) * 100;
                        const y = 100 - (v / maxValue) * 100;
                        return `${x},${isFinite(y) ? y : 100}`;
                      })
                      .join(" ")}
                  />
                  {/* Conservative */}
                  <polyline
                    fill="none"
                    stroke={recommendedCurve === "conservative" ? "rgb(34,197,94)" : "rgba(34,197,94,0.5)"}
                    strokeWidth={recommendedCurve === "conservative" ? 1.4 : 0.9}
                    className={recommendedCurve === "conservative" ? "drop-shadow-[0_0_6px_rgba(34,197,94,0.6)]" : ""}
                    points={curves.conservative
                      .map((v, i) => {
                        const x = (i / (curves.conservative.length - 1)) * 100;
                        const y = 100 - (v / maxValue) * 100;
                        return `${x},${isFinite(y) ? y : 100}`;
                      })
                      .join(" ")}
                  />
                  {/* Moderate */}
                  <polyline
                    fill="none"
                    stroke={recommendedCurve === "moderate" ? "rgb(56,189,248)" : "rgba(56,189,248,0.5)"}
                    strokeWidth={recommendedCurve === "moderate" ? 1.4 : 0.9}
                    className={recommendedCurve === "moderate" ? "drop-shadow-[0_0_6px_rgba(56,189,248,0.6)]" : ""}
                    points={curves.moderate
                      .map((v, i) => {
                        const x = (i / (curves.moderate.length - 1)) * 100;
                        const y = 100 - (v / maxValue) * 100;
                        return `${x},${isFinite(y) ? y : 100}`;
                      })
                      .join(" ")}
                  />
                  {/* Aggressive */}
                  <polyline
                    fill="none"
                    stroke={recommendedCurve === "aggressive" ? "rgb(250,204,21)" : "rgba(250,204,21,0.5)"}
                    strokeWidth={recommendedCurve === "aggressive" ? 1.4 : 0.9}
                    className={recommendedCurve === "aggressive" ? "drop-shadow-[0_0_6px_rgba(250,204,21,0.5)]" : ""}
                    points={curves.aggressive
                      .map((v, i) => {
                        const x = (i / (curves.aggressive.length - 1)) * 100;
                        const y = 100 - (v / maxValue) * 100;
                        return `${x},${isFinite(y) ? y : 100}`;
                      })
                      .join(" ")}
                  />
                  {curves.assetCurve && (
                    <polyline
                      fill="none"
                      stroke="rgba(168,85,247,0.8)"
                      strokeWidth="0.8"
                      points={curves.assetCurve
                        .map((v, i) => {
                          const x = (i / (curves.assetCurve!.length - 1)) * 100;
                          const y = 100 - (v / maxValue) * 100;
                          return `${x},${isFinite(y) ? y : 100}`;
                        })
                        .join(" ")}
                    />
                  )}

                  {/* Milestone dots - show on moderate curve for clarity */}
                  {(() => {
                    const vals = curves.moderate;
                    const ms = milestonesByCurve.moderate;
                    const color = "rgb(56,189,248)";
                    const mk = (label: string, year: number | undefined, i: number) => {
                      if (year == null || vals[year - 1] == null) return null;
                      const cx = ((year - 1) / (vals.length - 1)) * 100;
                      const cy = 100 - (vals[year - 1] / maxValue) * 100;
                      return (
                        <g
                          key={label}
                          onMouseEnter={() => setMilestoneHover({ label, year })}
                          onMouseLeave={() => setMilestoneHover(null)}
                          style={{ cursor: "pointer" }}
                        >
                          <circle cx={cx} cy={cy} r="2.5" fill="transparent" />
                          <circle cx={cx} cy={cy} r="1.2" fill={color} className="animate-pulse opacity-90" />
                        </g>
                      );
                    };
                    return (
                      <g>
                        {mk("Doubles", ms.double, 0)}
                        {mk("Reaches $100K", ms["100000"], 1)}
                        {mk("Reaches $500K", ms["500000"], 2)}
                        {ms["1000000"] != null && vals[ms["1000000"] - 1] != null && (
                          <g
                            onMouseEnter={() => setMilestoneHover({ label: "Reaches $1M", year: ms["1000000"]! })}
                            onMouseLeave={() => setMilestoneHover(null)}
                            style={{ cursor: "pointer" }}
                          >
                            <circle
                              cx={((ms["1000000"]! - 1) / (vals.length - 1)) * 100}
                              cy={100 - (vals[ms["1000000"]! - 1] / maxValue) * 100}
                              r="2.5"
                              fill="transparent"
                            />
                            <circle
                              cx={((ms["1000000"]! - 1) / (vals.length - 1)) * 100}
                              cy={100 - (vals[ms["1000000"]! - 1] / maxValue) * 100}
                              r="1.6"
                              fill={color}
                              className="animate-pulse opacity-90"
                            />
                            <text
                              x={((ms["1000000"]! - 1) / (vals.length - 1)) * 100}
                              y={100 - (vals[ms["1000000"]! - 1] / maxValue) * 100 - 2.5}
                              textAnchor="middle"
                              fill="currentColor"
                              fontSize="2"
                            >
                              🏆
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })()}

                  {hoverIndex != null && hoverIndex >= 0 && hoverIndex < curves.moderate.length && (
                    <>
                      <line
                        x1={(hoverIndex / (curves.moderate.length - 1)) * 100}
                        y1="0"
                        x2={(hoverIndex / (curves.moderate.length - 1)) * 100}
                        y2="100"
                        stroke="rgba(148,163,184,0.4)"
                        strokeDasharray="1.5 2"
                        strokeWidth="0.5"
                      />
                      <circle
                        cx={(hoverIndex / (curves.moderate.length - 1)) * 100}
                        cy={100 - (curves.moderate[hoverIndex] / maxValue) * 100}
                        r="1.5"
                        fill="rgb(56,189,248)"
                      />
                    </>
                  )}
                </>
              )}
            </svg>

            <div
              className="absolute inset-0 cursor-crosshair"
              onMouseMove={(e) => {
                if (!graphRef.current || curves.moderate.length === 0) return;
                const rect = graphRef.current.getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width;
                const idx = Math.round(x * (curves.moderate.length - 1));
                setHoverIndex(Math.max(0, Math.min(idx, curves.moderate.length - 1)));
              }}
            />

            {!milestoneHover && hoverIndex != null && hoverIndex < curves.moderate.length && (
              <div className="pointer-events-none absolute left-1/2 top-2 z-10 w-40 -translate-x-1/2 rounded-lg border border-white/10 bg-[#0F1520] px-3 py-2 text-[11px] text-zinc-200 shadow-xl">
                <p className="font-medium">Year {hoverIndex + 1}</p>
                <p>Moderate: ${Math.round(curves.moderate[hoverIndex]).toLocaleString()}</p>
              </div>
            )}
            {milestoneHover && (
              <div className="pointer-events-none absolute left-1/2 top-2 z-10 w-48 -translate-x-1/2 rounded-lg border border-white/10 bg-[#0F1520] px-3 py-2 text-[11px] text-zinc-200 shadow-xl">
                {milestoneHover.label} in year {milestoneHover.year}
              </div>
            )}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between px-1 text-[9px] text-zinc-500">
              {yearLabels.filter((_, i) => i % 5 === 0 || i === yearLabels.length - 1).map((y) => (
                <span key={y}>Y{y}</span>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-emerald-500" /> Conservative (6%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-cyan-400" /> Moderate (9%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-amber-400" /> Aggressive (13%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 border-b border-dashed border-white/60" style={{ width: 16 }} /> S&P 500 Historical Avg (10.5%)
            </span>
            {curves.assetLabel && (
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-purple-400" style={{ width: 16 }} /> {curves.assetLabel}
              </span>
            )}
            <InfoTooltip
              id="cagr"
              content="CAGR = Compound Annual Growth Rate. It's the smoothed annual return that would get you from start to end value over the period."
            >
              <span className="text-zinc-500">CAGR</span>
            </InfoTooltip>
          </div>
        </section>

        {/* 3. Monthly contribution */}
        <section className="mt-8 rounded-2xl border border-white/5 bg-black/30 p-5">
          <h2 className="text-sm font-semibold text-zinc-100">With monthly contributions</h2>
          <p className="mt-1 text-xs text-zinc-400">
            <InfoTooltip
              id="compound"
              content="Compound interest means you earn returns on your previous returns as well as on new contributions. Over time this can significantly grow your balance."
            >
              <span>Compound interest</span>
            </InfoTooltip>{" "}
            applied to your balance each month.
          </p>
          <div className="mt-4">
            <label className="block text-xs font-medium text-zinc-400">
              I can invest $<span className="font-semibold text-zinc-200">{monthlyContribution.toLocaleString()}</span> per month
            </label>
            <input
              type="range"
              min={50}
              max={10000}
              step={50}
              value={monthlyContribution}
              onChange={(e) => setMonthlyContribution(Number(e.target.value))}
              className="mt-2 h-2 w-full max-w-md appearance-none rounded-full bg-white/10 accent-[var(--accent-color)]"
              style={{ accentColor: "var(--accent-color)" }}
            />
            <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
              <span>$50</span>
              <span>$10,000</span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-6 text-sm">
            <p className="text-zinc-300">
              Final balance (with contributions):{" "}
              <span className="font-semibold text-zinc-100">${Math.round(finalWithContrib).toLocaleString()}</span>
            </p>
            <p className="text-zinc-300">
              Extra wealth from contributions:{" "}
              <span className="font-semibold text-emerald-400">+${Math.round(extraFromContrib).toLocaleString()}</span>
            </p>
          </div>
        </section>

        {/* Share */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleShare}
            className="rounded-full bg-[var(--accent-color)] px-5 py-2 text-sm font-semibold text-[#020308] transition hover:opacity-90"
          >
            Share your projection
          </button>
          <p className="text-[11px] text-zinc-500">
            Pre-fills the feed composer with your projection summary.
          </p>
        </div>

        <p className="mt-6 text-[11px] text-zinc-500">
          These projections are illustrative only. Past performance (including S&P 500 historical average) does not guarantee future results. Not financial advice.
        </p>
      </div>
    </div>
  );
}
