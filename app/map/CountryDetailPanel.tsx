"use client";

import { useCallback, useEffect, useState } from "react";
import { countryToFlag } from "../../lib/country-mapping";
import type { Layer } from "../../lib/map-layers";

type HeaderData = {
  countryName: string;
  flag: string;
  indexLabel: string | null;
  indexSymbol: string | null;
  price: number | null;
  changePercent: number | null;
};

type EconomicData = {
  gdpGrowth: { year: string; value: number | null } | null;
  inflation: { year: string; value: number | null } | null;
  unemployment: { year: string; value: number | null } | null;
  gdpPerCapita: { year: string; value: number | null } | null;
};

type ImfData = {
  gdpGrowth2025: number | null;
  gdpGrowth2026: number | null;
  inflation2025: number | null;
  inflation2026: number | null;
};

type NewsArticle = { title: string; description: string | null; source: string; url: string; publishedAt: string };

type OutlookData = {
  outlook: string;
  riskScore: number;
  riskLabel: string;
  riskColor: "green" | "yellow" | "red";
  opportunities: string[];
  risks: string[];
  sentiment: string;
};

type ProjectionBestCase = {
  headline: string;
  explanation: string;
  confidence: "High" | "Medium" | "Low";
  timeframe: string;
};

type ProjectionWorstCase = {
  headline: string;
  explanation: string;
  severity: "High" | "Medium" | "Low";
  timeframe: string;
};

type ProjectionsData = { bestCase: ProjectionBestCase; worstCase: ProjectionWorstCase };

const PROJECTIONS_CACHE_KEY = "xchange-map-projections";
const PROJECTIONS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function getCachedProjections(country: string): ProjectionsData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROJECTIONS_CACHE_KEY);
    if (!raw) return null;
    const store = JSON.parse(raw) as Record<string, { data: ProjectionsData; fetchedAt: number }>;
    const entry = store[country];
    if (!entry || Date.now() - entry.fetchedAt > PROJECTIONS_CACHE_TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function setCachedProjections(country: string, data: ProjectionsData) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(PROJECTIONS_CACHE_KEY);
    const store = (raw ? JSON.parse(raw) : {}) as Record<string, { data: ProjectionsData; fetchedAt: number }>;
    store[country] = { data, fetchedAt: Date.now() };
    localStorage.setItem(PROJECTIONS_CACHE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
      <div className="mt-2 h-6 w-1/2 animate-pulse rounded bg-white/10" />
    </div>
  );
}

function formatTimeAgo(iso: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 60000;
    if (diff < 60) return `${Math.floor(diff)}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 1440)}d ago`;
  } catch {
    return "";
  }
}

type CountryDetailPanelProps = {
  countryName: string;
  onClose: () => void;
  activeLayer?: Layer | null;
  layerValue?: number | null;
  layerRank?: { rank: number; total: number } | null;
  layerHistory?: { year: string; value: number }[];
};

export function CountryDetailPanel({
  countryName,
  onClose,
  activeLayer = null,
  layerValue = null,
  layerRank = null,
  layerHistory = [],
}: CountryDetailPanelProps) {
  const [header, setHeader] = useState<HeaderData | null>(null);
  const [headerLoading, setHeaderLoading] = useState(true);
  const [economic, setEconomic] = useState<EconomicData | null>(null);
  const [economicLoading, setEconomicLoading] = useState(true);
  const [imf, setImf] = useState<ImfData | null>(null);
  const [imfLoading, setImfLoading] = useState(true);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState<"none" | "rate_limit" | "empty">("none");
  const [newsMessage, setNewsMessage] = useState<string | null>(null);
  const [outlook, setOutlook] = useState<OutlookData | null>(null);
  const [outlookLoading, setOutlookLoading] = useState(true);
  const [projections, setProjections] = useState<ProjectionsData | null>(null);
  const [projectionsLoading, setProjectionsLoading] = useState(false);
  const [projectionsError, setProjectionsError] = useState(false);

  const flag = countryToFlag(countryName);

  const fetchHeader = useCallback(async () => {
    setHeaderLoading(true);
    try {
      const res = await fetch(`/api/map-country-header?country=${encodeURIComponent(countryName)}`);
      const data = await res.json();
      setHeader(data);
    } catch {
      setHeader({ countryName, flag, indexLabel: null, indexSymbol: null, price: null, changePercent: null });
    } finally {
      setHeaderLoading(false);
    }
  }, [countryName, flag]);

  const fetchEconomic = useCallback(async () => {
    setEconomicLoading(true);
    try {
      const res = await fetch(`/api/map-country-economic?country=${encodeURIComponent(countryName)}`);
      const data = await res.json();
      setEconomic(data);
    } catch {
      setEconomic(null);
    } finally {
      setEconomicLoading(false);
    }
  }, [countryName]);

  const fetchImf = useCallback(async () => {
    setImfLoading(true);
    try {
      const res = await fetch(`/api/map-country-imf?country=${encodeURIComponent(countryName)}`);
      const data = await res.json();
      setImf(data);
    } catch {
      setImf(null);
    } finally {
      setImfLoading(false);
    }
  }, [countryName]);

  const fetchNews = useCallback(async () => {
    setNewsLoading(true);
    setNewsError("none");
    setNewsMessage(null);
    try {
      const res = await fetch(`/api/map-news?country=${encodeURIComponent(countryName)}`, { cache: "no-store" });
      const data = await res.json();
      const articles = Array.isArray(data?.articles) ? data.articles : [];
      setNews(articles.map((a: { title?: string; description?: string | null; source?: string; url?: string; publishedAt?: string }) => ({
        title: a.title ?? "",
        description: a.description ?? null,
        source: a.source ?? "—",
        url: a.url ?? "#",
        publishedAt: a.publishedAt ?? "",
      })));
      if (data?.rateLimited) {
        setNewsError("rate_limit");
      } else if (articles.length === 0 && data?.message) {
        setNewsError("empty");
        setNewsMessage(data.message);
      }
    } catch {
      setNews([]);
      setNewsError("empty");
      setNewsMessage("No recent market news found for " + countryName);
    } finally {
      setNewsLoading(false);
    }
  }, [countryName]);

  const fetchOutlook = useCallback(
    async (econ: EconomicData | null) => {
      setOutlookLoading(true);
      try {
        const body = {
          country: countryName,
          gdpGrowth: econ?.gdpGrowth?.value ?? null,
          inflation: econ?.inflation?.value ?? null,
          unemployment: econ?.unemployment?.value ?? null,
        };
        const res = await fetch("/api/map-country-outlook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const data = await res.json();
          setOutlook(data);
        } else {
          setOutlook(null);
        }
      } catch {
        setOutlook(null);
      } finally {
        setOutlookLoading(false);
      }
    },
    [countryName]
  );

  useEffect(() => {
    fetchHeader();
    fetchEconomic();
    fetchImf();
    fetchNews();
  }, [fetchHeader, fetchEconomic, fetchImf, fetchNews]);

  useEffect(() => {
    if (!economicLoading && economic) {
      fetchOutlook(economic);
    } else if (!economicLoading) {
      fetchOutlook(null);
    }
  }, [economicLoading, economic, fetchOutlook]);

  useEffect(() => {
    if (economicLoading || imfLoading) return;
    setProjections(null);
    setProjectionsError(false);
    const cached = getCachedProjections(countryName);
    if (cached) {
      setProjections(cached);
      setProjectionsLoading(false);
      return;
    }
    setProjectionsLoading(true);
    const body = {
      country: countryName,
      gdpGrowth: economic?.gdpGrowth?.value ?? null,
      inflation: economic?.inflation?.value ?? null,
      unemployment: economic?.unemployment?.value ?? null,
      gdpPerCapita: economic?.gdpPerCapita?.value ?? null,
      imfGdp2025: imf?.gdpGrowth2025 ?? null,
      imfGdp2026: imf?.gdpGrowth2026 ?? null,
    };
    fetch("/api/map-country-projections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Projections failed");
        return res.json();
      })
      .then((data: ProjectionsData) => {
        setProjections(data);
        setProjectionsError(false);
        setCachedProjections(countryName, data);
      })
      .catch(() => {
        setProjections(null);
        setProjectionsError(true);
      })
      .finally(() => setProjectionsLoading(false));
  }, [countryName, economicLoading, imfLoading, economic?.gdpGrowth?.value, economic?.inflation?.value, economic?.unemployment?.value, economic?.gdpPerCapita?.value, imf?.gdpGrowth2025, imf?.gdpGrowth2026]);

  const riskColorClass = (c: string) =>
    c === "green" ? "bg-[var(--accent-color)]/20 text-[var(--accent-color)]" : c === "red" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400";
  const sentimentClass = (s: string) =>
    s === "Bullish" ? "bg-[var(--accent-color)]/20 text-[var(--accent-color)]" : s === "Bearish" ? "bg-red-500/20 text-red-400" : "bg-zinc-500/20 text-zinc-400";

  return (
    <div
      className="flex w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0F1520] shadow-xl"
      role="region"
      aria-label={`Country details: ${countryName}`}
    >
      {/* Sticky header */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-white/10 bg-[#0F1520] px-4 py-3">
        <h2 className="flex items-center gap-2 truncate text-lg font-semibold text-zinc-100">
          <span className="text-2xl leading-none">{flag}</span>
          <span>{countryName}</span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-2 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
          aria-label="Close panel"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* 0. Current layer metric (when a layer is active) */}
        {activeLayer && (
          <>
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {activeLayer.label}
              </h3>
              <p className="mt-2 text-2xl font-semibold text-zinc-100">
                {activeLayer.formatValue(layerValue)}
              </p>
              {layerRank && (
                <p className="mt-1 text-xs text-zinc-500">
                  Ranks {layerRank.rank} of {layerRank.total} countries
                </p>
              )}
              {layerHistory && layerHistory.length > 1 && (
                <div className="mt-3">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">5-year trend</p>
                  <div className="mt-1 flex h-20 items-end gap-0.5">
                    {layerHistory
                      .slice()
                      .sort((a, b) => a.year.localeCompare(b.year))
                      .map((p, i) => {
                        const vals = layerHistory.map((x) => x.value).filter((v) => v != null);
                        const max = Math.max(...vals, 1);
                        const h = max ? (p.value / max) * 100 : 0;
                        return (
                          <div
                            key={`${p.year}-${i}`}
                            className="flex-1 rounded-t bg-[var(--accent-color)]/60 min-h-[4px]"
                            style={{ height: `${Math.max(4, h)}%` }}
                            title={`${p.year}: ${p.value}`}
                          />
                        );
                      })}
                  </div>
                </div>
              )}
            </section>
            <div className="h-px bg-white/10" />
          </>
        )}

        {/* 1. Country header — index + price */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Market index</h3>
          {headerLoading ? (
            <div className="mt-2 h-12 w-full animate-pulse rounded-lg bg-white/10" />
          ) : header?.indexSymbol && header?.price != null && header?.changePercent != null ? (
            <p className="mt-2 text-lg font-medium text-zinc-100">
              {header.indexLabel}{" "}
              <span className={header.changePercent >= 0 ? "text-emerald-400" : "text-red-400"}>
                {header.changePercent >= 0 ? "+" : ""}
                {header.changePercent.toFixed(2)}%
              </span>
              <span className="ml-2 text-zinc-400">
                ${header.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">Index data coming soon</p>
          )}
        </section>

        <div className="h-px bg-white/10" />

        {/* 2. Economic snapshot */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Economic snapshot</h3>
          {economicLoading ? (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] text-zinc-500">Loading economic data…</p>
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            </div>
          ) : economic ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {[
                { label: "GDP Growth", data: economic.gdpGrowth, suffix: "%", fmt: (v: number) => (v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1)) },
                { label: "Inflation", data: economic.inflation, suffix: "%", fmt: (v: number) => `${v.toFixed(1)}` },
                { label: "Unemployment", data: economic.unemployment, suffix: "%", fmt: (v: number) => `${v.toFixed(1)}` },
                {
                  label: "GDP Per Capita",
                  data: economic.gdpPerCapita,
                  suffix: "",
                  fmt: (v: number) => `$${(v / 1000).toFixed(0)}k`,
                },
              ].map(({ label, data, suffix, fmt }) => (
                <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
                  {data?.value != null ? (
                    <>
                      <p className="mt-1 text-sm font-semibold text-zinc-100">
                        {fmt(data.value)}
                        {suffix}
                      </p>
                      <p className="text-[10px] text-zinc-500">{data.year}</p>
                    </>
                  ) : (
                    <p className="mt-1 text-xs text-zinc-500">Data unavailable</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">Data unavailable</p>
          )}
        </section>

        <div className="h-px bg-white/10" />

        {/* 3. IMF forecast */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">IMF forecast</h3>
          {imfLoading ? (
            <div className="mt-3 space-y-2">
              <div className="h-14 animate-pulse rounded-lg bg-white/10" />
              <div className="h-14 animate-pulse rounded-lg bg-white/10" />
            </div>
          ) : imf && (imf.gdpGrowth2025 != null || imf.gdpGrowth2026 != null || imf.inflation2025 != null || imf.inflation2026 != null) ? (
            <div className="mt-3 space-y-3">
              {(imf.gdpGrowth2025 != null || imf.gdpGrowth2026 != null) && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[10px] uppercase text-zinc-500">GDP growth</p>
                  <div className="mt-1 flex gap-4 text-sm">
                    {imf.gdpGrowth2025 != null && (
                      <span>
                        2025: <span className={imf.gdpGrowth2025 >= 0 ? "text-[var(--accent-color)]" : "text-red-400"}>{`${imf.gdpGrowth2025 >= 0 ? "+" : ""}${imf.gdpGrowth2025}%`}</span>
                      </span>
                    )}
                    {imf.gdpGrowth2026 != null && (
                      <span>
                        2026: <span className={imf.gdpGrowth2026 >= 0 ? "text-emerald-400" : "text-red-400"}>{`${imf.gdpGrowth2026 >= 0 ? "+" : ""}${imf.gdpGrowth2026}%`}</span>
                      </span>
                    )}
                  </div>
                </div>
              )}
              {(imf.inflation2025 != null || imf.inflation2026 != null) && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[10px] uppercase text-zinc-500">Inflation</p>
                  <div className="mt-1 flex gap-4 text-sm text-zinc-200">
                    {imf.inflation2025 != null && <span>2025: {imf.inflation2025}%</span>}
                    {imf.inflation2026 != null && <span>2026: {imf.inflation2026}%</span>}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">Data unavailable — showing World Bank latest above</p>
          )}
        </section>

        <div className="h-px bg-white/10" />

        {/* 4. AI outlook */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">AI market outlook</h3>
          {outlookLoading ? (
            <div className="mt-3 space-y-3">
              <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
              <div className="h-4 w-full animate-pulse rounded bg-white/10" />
              <div className="h-16 animate-pulse rounded bg-white/10" />
            </div>
          ) : outlook ? (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sentimentClass(outlook.sentiment)}`}>
                  {outlook.sentiment}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${riskColorClass(outlook.riskColor)}`}>
                  {outlook.riskLabel}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(outlook.riskScore / 10) * 100}%`,
                      backgroundColor: outlook.riskColor === "green" ? "var(--accent-color)" : outlook.riskColor === "red" ? "#ef4444" : "#eab308",
                    }}
                  />
                </div>
                <span className="text-xs text-zinc-400">{outlook.riskScore}/10</span>
              </div>
              <p className="text-sm leading-relaxed text-zinc-300">{outlook.outlook}</p>
              {outlook.opportunities?.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase text-zinc-500">Opportunities</p>
                  <ul className="mt-1 space-y-1">
                    {outlook.opportunities.map((o, i) => (
                      <li key={i} className="flex gap-2 text-sm text-[var(--accent-color)]">
                        <span>•</span>
                        <span>{o}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {outlook.risks?.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase text-zinc-500">Risks</p>
                  <ul className="mt-1 space-y-1">
                    {outlook.risks.map((r, i) => (
                      <li key={i} className="flex gap-2 text-sm text-red-400">
                        <span>•</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">Data unavailable</p>
          )}
        </section>

        <div className="h-px bg-white/10" />

        {/* Projections: best case + worst case */}
        {projectionsLoading ? (
          <section className="space-y-3">
            <div className="animate-pulse rounded-xl border border-white/10 p-4" style={{ background: "rgba(0, 200, 150, 0.04)" }}>
              <div className="h-4 w-1/3 rounded bg-white/10" />
              <div className="mt-3 h-5 w-full rounded bg-white/10" />
              <div className="mt-2 h-4 w-full rounded bg-white/10" />
              <div className="mt-2 h-4 w-4/5 rounded bg-white/10" />
            </div>
            <div className="animate-pulse rounded-xl border border-white/10 p-4" style={{ background: "rgba(239, 68, 68, 0.04)" }}>
              <div className="h-4 w-1/3 rounded bg-white/10" />
              <div className="mt-3 h-5 w-full rounded bg-white/10" />
              <div className="mt-2 h-4 w-full rounded bg-white/10" />
              <div className="mt-2 h-4 w-4/5 rounded bg-white/10" />
            </div>
          </section>
        ) : projectionsError ? (
          <p className="text-sm text-zinc-500">Projection data temporarily unavailable</p>
        ) : projections ? (
          <section className="space-y-3">
            {/* Most Promising Projection */}
            <div
              className="rounded-xl border-l-4 p-4"
              style={{ borderLeftColor: "#00C896", background: "#0a1f0a", animation: "fadeIn 0.3s ease-out" }}
            >
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 shrink-0 text-[#00C896]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#00C896]">Most Promising Outlook</h3>
              </div>
              <p className="mt-2 font-semibold text-zinc-100">{projections.bestCase.headline}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">{projections.bestCase.explanation}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#00C896]/20 px-2 py-0.5 text-[10px] font-medium text-[#00C896]">
                  {projections.bestCase.timeframe || "1-3 Year Outlook"}
                </span>
                <span className="rounded-full bg-[#00C896]/20 px-2 py-0.5 text-[10px] font-medium text-[#00C896]">
                  {projections.bestCase.confidence} confidence
                </span>
              </div>
            </div>
            {/* Key Risk Scenario */}
            <div
              className="rounded-xl border-l-4 p-4"
              style={{ borderLeftColor: "#EF4444", background: "#1f0a0a", animation: "fadeIn 0.3s ease-out" }}
            >
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                </svg>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-red-500">Key Risk Scenario</h3>
              </div>
              <p className="mt-2 font-semibold text-zinc-100">{projections.worstCase.headline}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">{projections.worstCase.explanation}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full px-2 py-0.5 text-[10px] font-medium text-red-400">
                  {projections.worstCase.timeframe || "1-3 Year Risk"}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    projections.worstCase.severity === "High"
                      ? "bg-red-500/20 text-red-400"
                      : projections.worstCase.severity === "Medium"
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-zinc-500/20 text-zinc-400"
                  }`}
                >
                  {projections.worstCase.severity} severity
                </span>
              </div>
            </div>
          </section>
        ) : null}

        <div className="h-px bg-white/10" />

        {/* 5. Latest news */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Latest news</h3>
          {newsLoading ? (
            <ul className="mt-3 space-y-2">
              {[1, 2, 3].map((i) => (
                <li key={i} className="animate-pulse rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="h-4 w-full max-w-[85%] rounded bg-white/10" />
                  <div className="mt-2 h-3 w-1/3 rounded bg-white/10" />
                  <div className="mt-2 h-3 w-full rounded bg-white/10" />
                  <div className="mt-1 h-3 max-w-[66%] rounded bg-white/10" />
                </li>
              ))}
            </ul>
          ) : newsError === "rate_limit" ? (
            <p className="mt-3 text-sm text-amber-400">
              News temporarily unavailable — please try again in a moment
            </p>
          ) : news.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {news.slice(0, 4).map((a, i) => (
                <li key={i}>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg border border-white/10 bg-white/5 p-3 transition hover:border-[var(--accent-color)]/30 hover:bg-white/10"
                  >
                    <p className="line-clamp-2 text-sm font-medium text-zinc-200">{a.title}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {a.source} · {formatTimeAgo(a.publishedAt)}
                    </p>
                    {a.description && (
                      <p className="mt-1.5 line-clamp-2 text-xs text-zinc-400">{a.description}</p>
                    )}
                    <span className="mt-1 inline-block text-xs text-[var(--accent-color)]">Read full story →</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-zinc-500">
                {newsMessage ?? `No recent market news found for ${countryName}`}
              </p>
              <a
                href={`https://news.google.com/search?q=${encodeURIComponent(countryName + " economy market")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs text-[var(--accent-color)] hover:underline"
              >
                Search Google News →
              </a>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
