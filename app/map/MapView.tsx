"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { feature } from "topojson-client";
import type { FeatureCollection } from "geojson";
import type { CountryData } from "../../types";
import { countryToIso3 } from "../../lib/country-mapping";
import {
  LAYERS,
  NO_DATA_COLOR,
  getStoredLayerId,
  setStoredLayerId,
  type LayerId,
  type Layer,
} from "../../lib/map-layers";
import { CountryDetailPanel } from "./CountryDetailPanel";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const MAP_MIN_ZOOM = 0.25;
const MAP_MAX_ZOOM = 8;
const MAP_INITIAL_CENTER: [number, number] = [0, 20];
const MAP_INITIAL_ZOOM = 1;
type CountryInfo = { name: string; id: string };

async function fetchCountryData(country: string, full: boolean): Promise<CountryData | null> {
  try {
    const res = await fetch(`/api/country-data?country=${encodeURIComponent(country)}&full=${full ? "true" : "false"}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

type LayerDataState = {
  byIso3: Record<string, number>;
  byName: Record<string, number>;
  history?: Record<string, { year: string; value: number }[]>;
};

export default function MapView() {
  const [geography, setGeography] = useState<FeatureCollection | null>(null);
  const [hovered, setHovered] = useState<CountryInfo | null>(null);
  const [selected, setSelected] = useState<CountryInfo | null>(null);
  const [hoverData, setHoverData] = useState<CountryData | null>(null);
  const [selectedData, setSelectedData] = useState<CountryData | null>(null);
  const [loadingHover, setLoadingHover] = useState(false);
  const [loadingSelected, setLoadingSelected] = useState(false);
  const [mapSize, setMapSize] = useState({ width: 800, height: 480 });
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [activeLayerId, setActiveLayerId] = useState<LayerId>(() => getStoredLayerId() ?? "markets");
  const [layerData, setLayerData] = useState<LayerDataState>({ byIso3: {}, byName: {} });
  const [layerLoading, setLayerLoading] = useState(false);
  const [layerHistory, setLayerHistory] = useState<Record<string, { year: string; value: number }[]>>({});
  const [compareMode, setCompareMode] = useState(false);
  const [compareCountries, setCompareCountries] = useState<CountryInfo[]>([]);
  const [compareExtraData, setCompareExtraData] = useState<{
    gdp: LayerDataState;
    inflation: LayerDataState;
    population: LayerDataState;
  } | null>(null);
  const [compareInsight, setCompareInsight] = useState<string | null>(null);
  const [compareInsightLoading, setCompareInsightLoading] = useState(false);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [showEstimateInfo, setShowEstimateInfo] = useState(false);
  const [hideAiEstimates, setHideAiEstimates] = useState(false);
  const [aiEstimatedCountryNames, setAiEstimatedCountryNames] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);
  const [mapPosition, setMapPosition] = useState<{ coordinates: [number, number]; zoom: number }>({
    coordinates: MAP_INITIAL_CENTER,
    zoom: MAP_INITIAL_ZOOM,
  });
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const activeLayer = LAYERS.find((l) => l.id === activeLayerId) ?? LAYERS[0];

  useEffect(() => {
    setIsMobile(typeof window !== "undefined" && window.innerWidth < 768);
  }, []);

  useEffect(() => {
    fetch(GEO_URL)
      .then((res) => res.json())
      .then((topo: { objects: { countries: unknown } }) => {
        const countries = feature(topo, topo.objects.countries) as FeatureCollection;
        setGeography(countries);
      })
      .catch(() => setGeography(null));
  }, []);

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const updateSize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w && h) setMapSize({ width: w, height: h });
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    if (!showEstimateInfo) return;
    const onDocClick = (e: MouseEvent) => {
      if ((e.target as Element).closest?.("[data-estimate-info]")) return;
      setShowEstimateInfo(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showEstimateInfo]);

  useEffect(() => {
    setLayerLoading(true);
    const layer = activeLayerId;
    fetch(`/api/map-layer-data?layer=${layer}&history=1`)
      .then((res) => res.json())
      .then((data: LayerDataState) => {
        setLayerData({ byIso3: data.byIso3 ?? {}, byName: data.byName ?? {} });
        setLayerHistory(data.history ?? {});
      })
      .catch(() => setLayerData({ byIso3: {}, byName: {} }))
      .finally(() => setLayerLoading(false));
  }, [activeLayerId]);

  useEffect(() => {
    if (!hovered) {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      queueMicrotask(() => {
        setHoverData(null);
        setLoadingHover(false);
      });
      return;
    }
    queueMicrotask(() => setLoadingHover(true));
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      fetchCountryData(hovered.name, false).then((data) => {
        setHoverData(data ?? null);
        setLoadingHover(false);
      });
    }, 200);
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, [hovered?.name, hovered?.id, hovered]);

  useEffect(() => {
    if (!selected) {
      queueMicrotask(() => setSelectedData(null));
      return;
    }
    queueMicrotask(() => setLoadingSelected(true));
    fetchCountryData(selected.name, true).then((data) => {
      setSelectedData(data ?? null);
      setLoadingSelected(false);
    });
  }, [selected?.name, selected?.id, selected]);

  useEffect(() => {
    if (compareCountries.length === 0) {
      setCompareExtraData(null);
      setCompareInsight(null);
      return;
    }
    Promise.all([
      fetch("/api/map-layer-data?layer=gdp").then((r) => r.json()),
      fetch("/api/map-layer-data?layer=inflation").then((r) => r.json()),
      fetch("/api/map-layer-data?layer=population").then((r) => r.json()),
    ]).then(([gdp, inflation, population]) => {
      setCompareExtraData({
        gdp: { byIso3: gdp.byIso3 ?? {}, byName: gdp.byName ?? {} },
        inflation: { byIso3: inflation.byIso3 ?? {}, byName: inflation.byName ?? {} },
        population: { byIso3: population.byIso3 ?? {}, byName: population.byName ?? {} },
      });
    });
  }, [compareCountries.length]);

  const getCountryName = useCallback((geo: { properties?: { name?: string; NAME?: string; admin?: string } }) => {
    const p = geo.properties;
    return p?.name ?? p?.NAME ?? p?.admin ?? "Unknown";
  }, []);

  const getValueForCountry = useCallback(
    (name: string): number | null => {
      const iso3 = countryToIso3(name)?.toLowerCase();
      const byIso = iso3 ? layerData.byIso3[iso3] : undefined;
      const byName = layerData.byName[name];
      if (typeof byIso === "number" && !Number.isNaN(byIso)) return byIso;
      if (typeof byName === "number" && !Number.isNaN(byName)) return byName;
      return null;
    },
    [layerData]
  );

  const getDisplayValueForCountry = useCallback(
    (name: string): number | null => {
      if (hideAiEstimates && aiEstimatedCountryNames.has(name)) return null;
      return getValueForCountry(name);
    },
    [hideAiEstimates, aiEstimatedCountryNames, getValueForCountry]
  );

  const getColorForCountry = useCallback(
    (name: string): string => {
      const v = getDisplayValueForCountry(name);
      return activeLayer.valueToColor(v);
    },
    [activeLayer, getDisplayValueForCountry]
  );

  const allValues = Object.values(layerData.byIso3).concat(Object.values(layerData.byName)).filter((v) => typeof v === "number");
  const rankForValue = useCallback(
    (value: number | null): { rank: number; total: number } | null => {
      if (value == null) return null;
      const sorted = [...allValues].sort((a, b) => b - a);
      const rank = sorted.findIndex((v) => v <= value) + 1 || sorted.length;
      return { rank, total: sorted.length };
    },
    [allValues]
  );

  const handleLayerSelect = useCallback((id: LayerId) => {
    setActiveLayerId(id);
    setStoredLayerId(id);
  }, []);

  const getCompareExtra = useCallback(
    (countryName: string) => {
      if (!compareExtraData) return { gdp: null, inflation: null, population: null };
      const iso3 = countryToIso3(countryName)?.toLowerCase();
      return {
        gdp: compareExtraData.gdp.byIso3[iso3 ?? ""] ?? compareExtraData.gdp.byName[countryName] ?? null,
        inflation: compareExtraData.inflation.byIso3[iso3 ?? ""] ?? compareExtraData.inflation.byName[countryName] ?? null,
        population: compareExtraData.population.byIso3[iso3 ?? ""] ?? compareExtraData.population.byName[countryName] ?? null,
      };
    },
    [compareExtraData]
  );

  useEffect(() => {
    if (compareCountries.length < 2 || !compareExtraData) {
      setCompareInsight(null);
      return;
    }
    setCompareInsightLoading(true);
    const rows = compareCountries.map((c) => {
      const iso3 = countryToIso3(c.name)?.toLowerCase();
      return {
        name: c.name,
        layerValue: getDisplayValueForCountry(c.name),
        gdp: compareExtraData.gdp.byIso3[iso3 ?? ""] ?? compareExtraData.gdp.byName[c.name] ?? null,
        inflation: compareExtraData.inflation.byIso3[iso3 ?? ""] ?? compareExtraData.inflation.byName[c.name] ?? null,
        population: compareExtraData.population.byIso3[iso3 ?? ""] ?? compareExtraData.population.byName[c.name] ?? null,
      };
    });
    fetch("/api/map-compare-insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countries: rows, layerName: activeLayer.label }),
    })
      .then((r) => r.json())
      .then((data) => setCompareInsight(data.insight ?? null))
      .catch(() => setCompareInsight(null))
      .finally(() => setCompareInsightLoading(false));
  }, [compareCountries, compareExtraData, activeLayer.label, getDisplayValueForCountry]);

  const handleEstimateMissing = useCallback(async () => {
    if (!geography || estimateLoading) return;
    const noDataNames: string[] = [];
    geography.features.forEach((f) => {
      const name = f.properties?.name ?? f.properties?.NAME ?? f.properties?.admin ?? "";
      if (name && getValueForCountry(name) == null) noDataNames.push(name);
    });
    const list = noDataNames.slice(0, 35);
    if (list.length === 0) return;
    setEstimateLoading(true);
    try {
      const res = await fetch("/api/map-layer-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layerId: activeLayerId,
          layerLabel: activeLayer.label,
          countryNames: list,
        }),
      });
      const data = await res.json();
      if (data.estimates && typeof data.estimates === "object") {
        const names = Object.keys(data.estimates);
        setLayerData((prev) => ({
          ...prev,
          byName: { ...prev.byName, ...data.estimates },
        }));
        setAiEstimatedCountryNames((prev) => new Set([...prev, ...names]));
      }
    } finally {
      setEstimateLoading(false);
    }
  }, [geography, activeLayerId, activeLayer.label, estimateLoading, getValueForCountry]);

  const handleCountryClick = useCallback(
    (info: CountryInfo) => {
      if (compareMode) {
        setCompareCountries((prev) => {
          const exists = prev.some((c) => c.id === info.id);
          if (exists) return prev.filter((c) => c.id !== info.id);
          if (prev.length >= 4) return prev;
          return [...prev, info];
        });
      } else {
        setSelected(info);
      }
    },
    [compareMode]
  );

  return (
    <div className="relative flex flex-col gap-4">
      {/* Layer selector + Legend (above map on desktop, legend below on mobile) */}
      <div className="flex flex-col gap-3">
        <div
          className="flex gap-2 overflow-x-auto pb-1 md:overflow-visible"
          style={{ scrollbarWidth: "thin" }}
        >
          {LAYERS.map((layer) => (
            <button
              key={layer.id}
              type="button"
              onClick={() => handleLayerSelect(layer.id)}
              className={`flex shrink-0 items-center rounded-lg border px-3 py-2 text-left text-sm font-medium transition-all ${
                activeLayerId === layer.id
                  ? "border-[var(--accent-color)] bg-[var(--accent-color)]/15 text-[var(--accent-color)]"
                  : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:bg-white/10 hover:text-zinc-200"
              }`}
            >
              {layer.label}
            </button>
          ))}
        </div>

        {/* Legend - below selector on desktop; below map on mobile (rendered again there) */}
        <div className="hidden md:flex md:items-end md:gap-4">
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              {activeLayer.legend.title}
            </p>
            <div className="flex items-center gap-3">
              <div
                className="h-3 flex-1 max-w-xs rounded-full"
                style={{ background: activeLayer.legend.gradient }}
              />
              <span className="text-[10px] text-zinc-500">{activeLayer.legend.lowLabel}</span>
              <span className="text-[10px] text-zinc-500">{activeLayer.legend.highLabel}</span>
            </div>
            {activeLayer.wbIndicator && (
              <p className="mt-1 text-[10px] text-zinc-500">Data as of {new Date().getFullYear() - 1}</p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleEstimateMissing}
              disabled={estimateLoading || !geography}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-[var(--accent-color)]/30 hover:bg-[var(--accent-color)]/10 hover:text-[var(--accent-color)] disabled:opacity-50"
            >
              {estimateLoading ? "Estimating…" : "Estimate missing (AI)"}
            </button>
            <div className="relative flex shrink-0 items-center" data-estimate-info>
              <button
                type="button"
                onClick={() => setShowEstimateInfo((v) => !v)}
                className="flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-white/5 text-[10px] font-medium text-zinc-500 transition hover:bg-white/10 hover:text-zinc-300"
                aria-label="Estimate limit info"
              >
                i
              </button>
              {showEstimateInfo && (
                <div className="absolute left-0 top-full z-50 mt-1 w-[420px] min-w-[320px] rounded-lg border border-white/10 bg-[#0F1520] px-3 py-2 text-[11px] leading-snug text-zinc-300 shadow-xl">
                  Estimates up to 35 countries at a time to avoid lag. Run again to cover more.
                </div>
              )}
            </div>
            {aiEstimatedCountryNames.size > 0 && (
              <button
                type="button"
                onClick={() => setHideAiEstimates((v) => !v)}
                className={`rounded-lg border p-2 transition ${
                  hideAiEstimates
                    ? "border-[var(--accent-color)] bg-[var(--accent-color)]/20 text-[var(--accent-color)]"
                    : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:bg-white/10 hover:text-zinc-200"
                }`}
                aria-label={hideAiEstimates ? "Show AI estimates" : "Hide AI estimates"}
                title={hideAiEstimates ? "Show AI estimates" : "Hide AI estimates"}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="relative flex flex-col gap-4 md:flex-row">
        <div
          ref={mapContainerRef}
          className="relative min-h-[480px] flex-1 overflow-hidden rounded-2xl border border-white/10 bg-[#050713] touch-none"
          style={{ minHeight: 480 }}
          role="application"
          aria-label="World map"
        >
          {geography && (
            <ComposableMap
              width={mapSize.width}
              height={mapSize.height}
              projection="geoMercator"
              projectionConfig={{ scale: 140 }}
              style={{ width: "100%", height: "100%", minHeight: 480 }}
            >
              <ZoomableGroup
                center={mapPosition.coordinates}
                zoom={mapPosition.zoom}
                onMoveEnd={(pos: { coordinates: [number, number]; zoom: number }) =>
                  setMapPosition({ coordinates: pos.coordinates, zoom: pos.zoom })
                }
                minZoom={MAP_MIN_ZOOM}
                maxZoom={MAP_MAX_ZOOM}
              >
                <Geographies geography={geography}>
                  {({
                    geographies,
                  }: {
                    geographies: Array<{
                      properties?: { name?: string; NAME?: string; admin?: string };
                      rsmKey?: string;
                      id?: string;
                    }>;
                  }) =>
                    geographies.map((geo) => {
                      const name = getCountryName(geo);
                      const fill = getColorForCountry(name);
                      const geoId = geo.id ?? String(geo.rsmKey);
                      const isCompareSelected = compareCountries.some((c) => c.id === geoId);
                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          onMouseEnter={(evt: React.MouseEvent) => {
                            setHovered({ name, id: geoId });
                            setTooltipPos({ x: evt.clientX, y: evt.clientY });
                          }}
                          onMouseMove={(evt: React.MouseEvent) =>
                            setTooltipPos({ x: evt.clientX, y: evt.clientY })
                          }
                          onMouseLeave={() => setHovered(null)}
                          onClick={() => handleCountryClick({ name, id: geoId })}
                          style={{
                            default: {
                              fill,
                              stroke: isCompareSelected ? "#fff" : "#334155",
                              strokeWidth: isCompareSelected ? 1.5 : 0.5,
                              outline: "none",
                              transition: "fill 0.5s ease, stroke 0.2s ease",
                            },
                            hover: {
                              fill: fill,
                              stroke: "var(--accent-color)",
                              strokeWidth: 1,
                              outline: "none",
                              cursor: "pointer",
                              transition: "fill 0.5s ease, stroke 0.2s ease",
                            },
                            pressed: {
                              fill,
                              stroke: "var(--accent-color)",
                              strokeWidth: 1,
                              outline: "none",
                              transition: "fill 0.5s ease, stroke 0.2s ease",
                            },
                          }}
                        />
                      );
                    })
                  }
                </Geographies>
              </ZoomableGroup>
            </ComposableMap>
          )}
          {!geography && (
            <div className="flex h-[480px] items-center justify-center text-sm text-zinc-500">
              Loading map…
            </div>
          )}

          {layerLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#050713]/60">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-color)] border-t-transparent" />
              <p className="text-sm text-zinc-400">
                Loading {activeLayer.label} data…
              </p>
            </div>
          )}

          {hovered && (
            <div
              className="pointer-events-none fixed z-50 rounded bg-[#0A0E1A]/95 px-2 py-1 text-[11px] font-medium text-zinc-200 shadow-lg ring-1 ring-white/10"
              style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 8 }}
            >
              {hovered.name}
              {activeLayer && (
                <span className="ml-1 text-zinc-500">
                  {activeLayer.formatValue(getDisplayValueForCountry(hovered.name))}
                </span>
              )}
            </div>
          )}

          {/* Attribution */}
          <div className="absolute bottom-2 right-2 text-[9px] text-zinc-600">
            {activeLayer.wbIndicator ? "Data: World Bank" : "Data: Various (temporary)"}
          </div>

          {/* Recenter + Compare */}
          <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setMapPosition({ coordinates: MAP_INITIAL_CENTER, zoom: MAP_INITIAL_ZOOM })}
                className="rounded-lg border border-white/10 bg-white/5 p-2 text-zinc-400 transition hover:border-white/20 hover:bg-white/10 hover:text-zinc-200"
                aria-label="Recenter map"
                title="Recenter map"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                </svg>
              </button>
            </div>
            {!isMobile ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setCompareMode((m) => !m);
                    if (compareMode) setCompareCountries([]);
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    compareMode
                      ? "border-[var(--accent-color)] bg-[var(--accent-color)]/20 text-[var(--accent-color)]"
                      : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10"
                  }`}
                >
                  {compareMode ? "Exit compare" : "Compare"}
                </button>
                {compareMode && (
                  <p className="max-w-[220px] rounded-lg border border-white/10 bg-[#0A0E1A]/95 px-2 py-1.5 text-[10px] leading-snug text-zinc-400">
                    Click up to 4 countries on the map to add them. A comparison table and AI insight will appear below.
                  </p>
                )}
              </>
            ) : (
              <span className="rounded bg-white/10 px-2 py-1 text-[10px] text-zinc-500">
                Compare on desktop
              </span>
            )}
          </div>
        </div>

        <aside className="w-full shrink-0 rounded-2xl border border-white/10 bg-[#050713] p-4 sm:w-80">
          <h2 className="text-sm font-semibold text-zinc-50">Preview</h2>
          {(selected || hovered) ? (
            (() => {
              const target = selected || hovered!;
              const data = selected ? selectedData : hoverData;
              const loading = selected ? loadingSelected : loadingHover;
              return (
                <>
                  <p className="mt-2 text-[var(--accent-color)]">{target.name}</p>
                  {activeLayer && (
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {activeLayer.label}: {activeLayer.formatValue(getDisplayValueForCountry(target.name))}
                    </p>
                  )}
                  {loading ? (
                    <p className="mt-1 text-[10px] text-zinc-500">Loading…</p>
                  ) : data ? (
                    <div className="mt-2 space-y-1 text-[11px] text-zinc-400">
                      {data.market && (
                        <p>
                          {data.market.indexName}: {data.market.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          <span
                            className={
                              data.market.changePercent >= 0 ? "text-emerald-400" : "text-red-400"
                            }
                          >
                            {" "}
                            {data.market.changePercent >= 0 ? "+" : ""}
                            {data.market.changePercent.toFixed(2)}%
                          </span>
                        </p>
                      )}
                      {((data?.news ?? []).length > 0) && (
                        <p className="line-clamp-2">{(data.news ?? [])[0].title}</p>
                      )}
                      <p className="mt-1 text-[10px] text-[var(--accent-color)]">Click for details</p>
                    </div>
                  ) : (
                    <p className="mt-1 text-[10px] text-zinc-500">Click for details</p>
                  )}
                </>
              );
            })()
          ) : (
            <p className="mt-2 text-xs text-zinc-500">
              Hover a country for a quick snapshot. Click for full data.
            </p>
          )}
        </aside>
      </div>

      <p className="text-left text-[10px] text-zinc-500">
        AI estimates are approximate and for context only; they are not official data. Use the &quot;Hide AI estimates&quot; toggle to gray out estimated countries.
      </p>

      {/* Legend below map on mobile */}
      <div className="flex flex-col gap-2 md:hidden">
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            {activeLayer.legend.title}
          </p>
          <div className="flex items-center gap-3">
            <div
              className="h-3 flex-1 rounded-full"
              style={{ background: activeLayer.legend.gradient }}
            />
            <span className="text-[10px] text-zinc-500">{activeLayer.legend.lowLabel}</span>
            <span className="text-[10px] text-zinc-500">{activeLayer.legend.highLabel}</span>
          </div>
          {activeLayer.wbIndicator && (
            <p className="mt-1 text-[10px] text-zinc-500">Data as of {new Date().getFullYear() - 1}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleEstimateMissing}
            disabled={estimateLoading || !geography}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-[var(--accent-color)]/30 hover:text-[var(--accent-color)] disabled:opacity-50"
          >
            {estimateLoading ? "Estimating…" : "Estimate missing (AI)"}
          </button>
          <div className="relative flex shrink-0 items-center" data-estimate-info>
          <button
            type="button"
            onClick={() => setShowEstimateInfo((v) => !v)}
            className="flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-white/5 text-[10px] font-medium text-zinc-500 transition hover:bg-white/10"
            aria-label="Estimate limit info"
          >
            i
          </button>
          {showEstimateInfo && (
            <div className="absolute left-0 top-full z-50 mt-1 w-[420px] min-w-[320px] rounded-lg border border-white/10 bg-[#0F1520] px-3 py-2 text-[11px] leading-snug text-zinc-300 shadow-xl">
              Estimates up to 35 countries at a time to avoid lag. Run again to cover more.
            </div>
          )}
        </div>
          {aiEstimatedCountryNames.size > 0 && (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={hideAiEstimates}
                onChange={(e) => setHideAiEstimates(e.target.checked)}
                className="rounded border-white/20 bg-white/5 text-[var(--accent-color)]"
              />
              <span>Hide AI estimates</span>
            </label>
          )}
        </div>
      </div>

      {selected && !compareMode && (
        <div className="mt-6">
          <CountryDetailPanel
            countryName={selected.name}
            onClose={() => setSelected(null)}
            activeLayer={activeLayer}
            layerValue={getDisplayValueForCountry(selected.name)}
            layerRank={rankForValue(getDisplayValueForCountry(selected.name))}
            layerHistory={layerHistory[countryToIso3(selected.name)?.toLowerCase() ?? ""]}
          />
        </div>
      )}

      {/* Comparison panel */}
      {compareMode && compareCountries.length > 0 && !isMobile && (
        <div className="animate-[fadeIn_0.2s_ease-out] rounded-2xl border border-white/10 bg-[#0F1520] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-200">Compare countries</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCompareCountries([])}
                className="rounded bg-white/10 px-2 py-1 text-xs text-zinc-400 hover:bg-white/15"
              >
                Clear selection
              </button>
              <button
                type="button"
                onClick={() => setCompareMode(false)}
                className="rounded bg-white/10 px-2 py-1 text-xs text-zinc-400 hover:bg-white/15"
              >
                Exit compare
              </button>
            </div>
          </div>

          {compareCountries.length >= 2 && (
            <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                AI comparative insight
              </p>
              {compareInsightLoading ? (
                <p className="text-sm text-zinc-500">Analyzing…</p>
              ) : compareInsight ? (
                <p className="text-sm leading-relaxed text-zinc-300">{compareInsight}</p>
              ) : (
                <p className="text-xs text-zinc-500">Insight unavailable.</p>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-zinc-500">
                  <th className="pb-2 pr-4">Country</th>
                  <th className="pb-2 pr-4">{activeLayer.label}</th>
                  <th className="pb-2 pr-4">GDP growth</th>
                  <th className="pb-2 pr-4">Inflation</th>
                  <th className="pb-2">Population</th>
                </tr>
              </thead>
              <tbody>
                {compareCountries.map((c) => {
                  const v = getDisplayValueForCountry(c.name);
                  const extra = getCompareExtra(c.name);
                  return (
                    <tr key={c.id} className="border-b border-white/5">
                      <td className="py-2 pr-4 font-medium text-zinc-200">{c.name}</td>
                      <td className="py-2 pr-4 text-zinc-300">{activeLayer.formatValue(v)}</td>
                      <td className="py-2 pr-4 text-zinc-400">
                        {extra.gdp != null ? `${extra.gdp >= 0 ? "+" : ""}${extra.gdp.toFixed(1)}%` : "—"}
                      </td>
                      <td className="py-2 pr-4 text-zinc-400">
                        {extra.inflation != null ? `${extra.inflation.toFixed(1)}%` : "—"}
                      </td>
                      <td className="py-2 text-zinc-400">
                        {extra.population != null
                          ? extra.population >= 1e9
                            ? `${(extra.population / 1e9).toFixed(1)}B`
                            : `${(extra.population / 1e6).toFixed(0)}M`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex h-24 items-end gap-2">
            {compareCountries.map((c) => {
              const v = getValueForCountry(c.name);
              const num = typeof v === "number" ? v : 0;
              const vals = compareCountries.map((x) => {
                const n = getValueForCountry(x.name);
                return typeof n === "number" ? n : 0;
              });
              const min = Math.min(...vals, 0);
              const max = Math.max(...vals, 1);
              const range = max - min || 1;
              const pct = Math.max(8, ((num - min) / range) * 100);
              return (
                <div key={c.id} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full min-h-[4px] rounded-t transition-all"
                    style={{
                      height: `${pct}%`,
                      backgroundColor: activeLayer.valueToColor(v),
                    }}
                  />
                  <span className="truncate text-[10px] text-zinc-500 max-w-full">
                    {c.name.split(" ")[0]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
