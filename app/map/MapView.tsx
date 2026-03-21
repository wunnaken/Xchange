"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { GlobeInstance } from "globe.gl";
import { feature } from "topojson-client";
import type { CountryData } from "../../types";
import { countryToIso3 } from "../../lib/country-mapping";
import {
  LAYERS,
  getStoredLayerId,
  setStoredLayerId,
  type LayerId,
} from "../../lib/map-layers";
import { CountryDetailPanel } from "./CountryDetailPanel";
import { prepareWorldAtlasForLeaflet } from "../../lib/prepare-world-atlas-leaflet";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const LEAFLET_STYLE = `
.globe-view-root { position: relative; width: 100%; height: 100%; }
.globe-view-root canvas { display: block; width: 100% !important; height: 100% !important; }
`;

const INITIAL_POV = { lat: 20, lng: 10, altitude: 2.15 };

const GLOBE_TEXTURES = {
  globeImageUrl: "//unpkg.com/three-globe/example/img/earth-blue-marble.jpg",
  bumpImageUrl: "//unpkg.com/three-globe/example/img/earth-topology.png",
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
type CountryInfo = { name: string; id: string };
type LayerDataState = {
  byIso3: Record<string, number>;
  byName: Record<string, number>;
  history?: Record<string, { year: string; value: number }[]>;
};
type MapMode = "market" | "trade";

type CountryPoly = {
  geometry: Geometry;
  name: string;
  id: string;
};

type ArcKind = "sea" | "land";

/** User-selected arc segment on the trade globe (from onArcClick). */
type TradeArcSelection = {
  kind: ArcKind;
  routeLabel: string;
  segmentIndex: number;
  segmentCount: number;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
};

/** Labels aligned with `SEA_CORRIDORS` order in `app/api/trade-vessels/route.ts`. */
const SEA_ROUTE_LABELS = [
  "Trans-Pacific (Asia–Americas)",
  "Asia–Europe (via Malacca & Suez)",
  "Asia–Europe (Cape loop)",
  "Transatlantic (Europe–Americas)",
  "Indian Ocean / Middle East link",
  "South China Sea corridor",
  "Southeast Asia–Australia",
  "Europe–South Atlantic",
  "Arabian Sea feeder",
  "Europe–Eastern Mediterranean",
] as const;
type RiskLevel = "high" | "medium" | "low";
type TradeRiskZoneArticle = { title: string; url: string; source: string };
type TradeRiskZone = {
  name: string;
  pos: [number, number];
  risk: RiskLevel;
  summary: string;
  affected: string;
  lastUpdated?: string;
  articleCount?: number;
  recentArticles?: TradeRiskZoneArticle[];
};
type TradeWeeklyChange = {
  route: string;
  change: string;
  type: "opened" | "closed" | "disrupted" | "restored";
};
type TradeFlightPosition = {
  callsign: string;
  lat: number;
  lon: number;
  altitude: number | null;
  velocity: number | null;
  heading: number | null;
};
type TradeStatsApi = {
  tradeBalance: { value: number; unit: string; date: string };
  exports: { value: number; unit: string; date: string };
  imports: { value: number; unit: string; date: string };
  globalTradeVolume: { value: number; change: number; unit: string; date: string };
  portThroughput: { value: number; change: number; unit: string; date: string };
  lastUpdated: string;
};
type TradeWeeklyApi = {
  oilPrice: { value: number; weeklyChange: number };
  usdEur: { value: number; weeklyChange: number };
  usdCny: { value: number; weeklyChange: number };
  balticDry: { value: number; weeklyChange: number };
  asOf: string;
};

type TradePort = { name: string; pos: [number, number]; volume: string };
type TradeZoneWithCoords = TradeRiskZone & { lat: number; lng: number };

const DEFAULT_TRADE_CHOKEPOINTS: TradeRiskZone[] = [
  { name: "Red Sea", pos: [14.0, 43.0], risk: "low", summary: "No recent disruption reports", affected: "Asia-Europe shipping lanes" },
  { name: "Black Sea", pos: [46.0, 32.0], risk: "low", summary: "No recent disruption reports", affected: "Grain and energy exports" },
  { name: "Taiwan Strait", pos: [24.5, 120.5], risk: "low", summary: "No recent disruption reports", affected: "Semiconductor supply chain" },
  { name: "Strait of Hormuz", pos: [26.5, 56.5], risk: "low", summary: "No recent disruption reports", affected: "Global oil supply" },
  { name: "Panama Canal", pos: [9.1, -79.7], risk: "low", summary: "No recent disruption reports", affected: "Americas-Asia transit" },
  { name: "Strait of Malacca", pos: [2.5, 101.5], risk: "low", summary: "No recent disruption reports", affected: "Asia shipping" },
  { name: "Suez Canal", pos: [30.0, 32.5], risk: "low", summary: "No recent disruption reports", affected: "Europe-Asia transit" },
  { name: "Bosphorus", pos: [41.0, 29.0], risk: "low", summary: "No recent disruption reports", affected: "Black Sea access" },
];

async function fetchCountryData(country: string, full: boolean): Promise<CountryData | null> {
  try {
    const res = await fetch(`/api/country-data?country=${encodeURIComponent(country)}&full=${full ? "true" : "false"}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function featureToCountryPoly(f: Feature<Geometry>): CountryPoly | null {
  const g = f.geometry;
  if (g.type !== "Polygon" && g.type !== "MultiPolygon") return null;
  const name = f.properties?.name ?? f.properties?.NAME ?? f.properties?.admin ?? "Unknown";
  return { geometry: g, name, id: String(f.id ?? name) };
}

function mapRoutePairsToArcs(
  routes: [number, number][][],
  kind: ArcKind,
  routeLabels?: readonly (string | undefined)[],
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  routes
    .filter((r) => Array.isArray(r) && r.length >= 2)
    .forEach((route, ri) => {
      const segCount = route.length - 1;
      const routeLabel = routeLabels?.[ri] ?? (kind === "sea" ? `Sea corridor ${ri + 1}` : `Land corridor ${ri + 1}`);
      for (let i = 0; i < segCount; i++) {
        out.push({
          startLat: route[i][0],
          startLng: route[i][1],
          endLat: route[i + 1][0],
          endLng: route[i + 1][1],
          kind,
          routeLabel,
          segmentIndex: i + 1,
          segmentCount: segCount,
          id: `${kind}-${ri}-${i}`,
        });
      }
    });
  return out;
}

/** Append alpha byte to #RRGGBB for ~50% fill (0x80). */
function hexWithAlpha(hex: string, alpha01: number): string {
  const raw = hex.replace("#", "").slice(0, 6);
  if (raw.length !== 6) return hex;
  const a = Math.round(Math.min(1, Math.max(0, alpha01)) * 255);
  return `#${raw}${a.toString(16).padStart(2, "0")}`;
}

// ─── Main MapView ─────────────────────────────────────────────────────────────
export default function MapView() {
  const [mapMode, setMapMode] = useState<MapMode>("trade");

  const [geography, setGeography] = useState<FeatureCollection | null>(null);
  const [selected, setSelected] = useState<CountryInfo | null>(null);
  const [selectedData, setSelectedData] = useState<CountryData | null>(null);
  const [hoverData, setHoverData] = useState<CountryData | null>(null);
  const [hovered, setHovered] = useState<CountryInfo | null>(null);
  const [loadingSelected, setLoadingSelected] = useState(false);
  const [loadingHover, setLoadingHover] = useState(false);
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

  const [tradeLayers, setTradeLayers] = useState({ sea: true, flights: true, land: true, conflict: true });
  const [selectedRiskZone, setSelectedRiskZone] = useState<TradeRiskZone | null>(null);
  const [selectedFlight, setSelectedFlight] = useState<TradeFlightPosition | null>(null);
  const [selectedPort, setSelectedPort] = useState<TradePort | null>(null);
  const [selectedTradeArc, setSelectedTradeArc] = useState<TradeArcSelection | null>(null);
  const [tradeStatsOpen, setTradeStatsOpen] = useState(true);
  const [weeklyChangesOpen, setWeeklyChangesOpen] = useState(true);
  const [tradeStats, setTradeStats] = useState<TradeStatsApi | null>(null);
  const [tradeVessels, setTradeVessels] = useState<{
    shippingNews: Array<{ title: string; source: string; publishedAt: string; url: string }>;
  } | null>(null);
  const [riskZones, setRiskZones] = useState<TradeRiskZone[]>([]);
  const [seaRoutes, setSeaRoutes] = useState<[number, number][][]>([]);
  const [landRoutes, setLandRoutes] = useState<[number, number][][]>([]);
  const [ports, setPorts] = useState<TradePort[]>([]);
  const [weeklyChanges, setWeeklyChanges] = useState<TradeWeeklyChange[]>([]);
  const [flightPositions, setFlightPositions] = useState<TradeFlightPosition[]>([]);
  const [tradeWeekly, setTradeWeekly] = useState<TradeWeeklyApi | null>(null);
  const [tradeDataLoading, setTradeDataLoading] = useState(false);
  const [lastTradeUpdate, setLastTradeUpdate] = useState<string | null>(null);
  const [marketRefreshLoading, setMarketRefreshLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mapModeRef = useRef(mapMode);
  mapModeRef.current = mapMode;
  const compareModeRef = useRef(compareMode);
  compareModeRef.current = compareMode;
  const setHoveredRef = useRef(setHovered);
  setHoveredRef.current = setHovered;
  const setSelectedRef = useRef(setSelected);
  setSelectedRef.current = setSelected;
  const setCompareCountriesRef = useRef(setCompareCountries);
  setCompareCountriesRef.current = setCompareCountries;

  /** HTML flight markers call this on click (globe layer is outside React tree). */
  const selectFlightFromGlobeRef = useRef<(f: TradeFlightPosition) => void>(() => {});
  selectFlightFromGlobeRef.current = (f) => {
    setSelectedTradeArc(null);
    setSelectedRiskZone(null);
    setSelectedPort(null);
    setSelectedFlight(f);
  };

  const activeLayer = LAYERS.find((l) => l.id === activeLayerId) ?? LAYERS[0];

  const countryPolys = useMemo(() => {
    if (!geography) return [];
    return geography.features.map(featureToCountryPoly).filter((p): p is CountryPoly => p != null);
  }, [geography]);

  const tradeArcsCombined = useMemo(() => {
    const arcs: Record<string, unknown>[] = [];
    if (tradeLayers.sea) arcs.push(...mapRoutePairsToArcs(seaRoutes, "sea", SEA_ROUTE_LABELS));
    if (tradeLayers.land) arcs.push(...mapRoutePairsToArcs(landRoutes, "land"));
    return arcs;
  }, [tradeLayers.sea, tradeLayers.land, seaRoutes, landRoutes]);

  const tradeFlightHtmlData = useMemo(
    () => (tradeLayers.flights ? flightPositions : []),
    [tradeLayers.flights, flightPositions],
  );

  const tradeRingsData = useMemo(() => {
    if (!tradeLayers.conflict) return [];
    const zones = riskZones.length > 0 ? riskZones : DEFAULT_TRADE_CHOKEPOINTS;
    return zones.map((z) => ({ ...z, lat: z.pos[0], lng: z.pos[1] }));
  }, [tradeLayers.conflict, riskZones]);

  const tradePointsData = useMemo(
    () =>
      ports.map((p) => ({
        name: p.name,
        pos: p.pos,
        type: "port" as const,
        volume: p.volume,
      })),
    [ports],
  );

  const formatAsOf = useCallback((value: string | null | undefined) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }, []);

  const headingToCompass = useCallback((heading: number | null | undefined) => {
    if (heading == null || !Number.isFinite(heading)) return "—";
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const idx = Math.round((((heading % 360) + 360) % 360) / 45) % 8;
    return dirs[idx];
  }, []);

  const formatLastUpdatedLabel = useMemo(() => {
    if (!lastTradeUpdate) return "Last updated: —";
    const diffMs = Date.now() - new Date(lastTradeUpdate).getTime();
    if (!Number.isFinite(diffMs) || diffMs < 0) return "Last updated: just now";
    const mins = Math.floor(diffMs / 60000);
    return `Last updated: ${mins} min${mins === 1 ? "" : "s"} ago`;
  }, [lastTradeUpdate]);

  const tradeCards = useMemo(
    () => [
      {
        label: "Global trade volume",
        value: tradeStats ? `${tradeStats.globalTradeVolume.value.toFixed(2)} ${tradeStats.globalTradeVolume.unit}` : "—",
        change: tradeStats?.globalTradeVolume.change ?? 0,
        suffix: "YoY",
        asOf: tradeStats?.globalTradeVolume.date ?? null,
      },
      {
        label: "US trade balance",
        value: tradeStats ? `${tradeStats.tradeBalance.value.toLocaleString()} ${tradeStats.tradeBalance.unit}` : "—",
        change: 0,
        suffix: "Latest",
        asOf: tradeStats?.tradeBalance.date ?? null,
      },
      {
        label: "Oil price WTI",
        value: tradeWeekly ? `$${tradeWeekly.oilPrice.value.toFixed(2)}` : "—",
        change: tradeWeekly?.oilPrice.weeklyChange ?? 0,
        suffix: "weekly",
        asOf: tradeWeekly?.asOf ?? null,
      },
      {
        label: "USD/CNY rate",
        value: tradeWeekly ? tradeWeekly.usdCny.value.toFixed(4) : "—",
        change: tradeWeekly?.usdCny.weeklyChange ?? 0,
        suffix: "weekly",
        asOf: tradeWeekly?.asOf ?? null,
      },
    ],
    [tradeStats, tradeWeekly],
  );
  const tradeGlobeLoading =
    mapMode === "trade" &&
    (tradeDataLoading || (ports.length === 0 && riskZones.length === 0 && seaRoutes.length === 0));

  const getValueForCountry = useCallback(
    (name: string): number | null => {
      const iso3 = countryToIso3(name)?.toLowerCase();
      const byIso = iso3 ? layerData.byIso3[iso3] : undefined;
      const byName = layerData.byName[name];
      if (typeof byIso === "number" && !Number.isNaN(byIso)) return byIso;
      if (typeof byName === "number" && !Number.isNaN(byName)) return byName;
      return null;
    },
    [layerData],
  );

  const getDisplayValueForCountry = useCallback(
    (name: string): number | null => {
      if (hideAiEstimates && aiEstimatedCountryNames.has(name)) return null;
      return getValueForCountry(name);
    },
    [hideAiEstimates, aiEstimatedCountryNames, getValueForCountry],
  );

  const getColorForCountry = useCallback(
    (name: string): string => {
      return activeLayer.valueToColor(getDisplayValueForCountry(name));
    },
    [activeLayer, getDisplayValueForCountry],
  );

  const allValues = useMemo(
    () =>
      Object.values(layerData.byIso3)
        .concat(Object.values(layerData.byName))
        .filter((v) => typeof v === "number"),
    [layerData],
  );

  const rankForValue = useCallback(
    (value: number | null) => {
      if (value == null) return null;
      const sorted = [...allValues].sort((a, b) => b - a);
      const rank = sorted.findIndex((v) => v <= value) + 1 || sorted.length;
      return { rank, total: sorted.length };
    },
    [allValues],
  );

  const getCompareExtra = useCallback(
    (countryName: string) => {
      if (!compareExtraData) return { gdp: null, inflation: null, population: null };
      const iso3 = countryToIso3(countryName)?.toLowerCase();
      return {
        gdp: compareExtraData.gdp.byIso3[iso3 ?? ""] ?? compareExtraData.gdp.byName[countryName] ?? null,
        inflation:
          compareExtraData.inflation.byIso3[iso3 ?? ""] ?? compareExtraData.inflation.byName[countryName] ?? null,
        population:
          compareExtraData.population.byIso3[iso3 ?? ""] ?? compareExtraData.population.byName[countryName] ?? null,
      };
    },
    [compareExtraData],
  );

  const handleCountryClick = useCallback((poly: object | null) => {
    if (!poly) return;
    const p = poly as CountryPoly;
    if (compareModeRef.current) {
      setCompareCountriesRef.current((prev) => {
        const exists = prev.some((c) => c.id === p.id);
        if (exists) return prev.filter((c) => c.id !== p.id);
        if (prev.length >= 4) return prev;
        return [...prev, { name: p.name, id: p.id }];
      });
    } else {
      setSelectedRef.current({ name: p.name, id: p.id });
    }
  }, []);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  useEffect(() => {
    fetch(GEO_URL)
      .then((r) => r.json())
      .then((topo: { objects: { countries: unknown } }) => {
        const raw = feature(topo, topo.objects.countries) as FeatureCollection;
        try {
          setGeography(prepareWorldAtlasForLeaflet(raw));
        } catch (e) {
          console.warn("prepareWorldAtlasForLeaflet failed, using raw geography", e);
          setGeography(raw);
        }
      });
  }, []);

  useEffect(() => {
    setLayerLoading(true);
    fetch(`/api/map-layer-data?layer=${activeLayerId}&history=1`)
      .then((r) => r.json())
      .then((data: LayerDataState) => {
        setLayerData({ byIso3: data.byIso3 ?? {}, byName: data.byName ?? {} });
        setLayerHistory(data.history ?? {});
      })
      .catch(() => setLayerData({ byIso3: {}, byName: {} }))
      .finally(() => setLayerLoading(false));
  }, [activeLayerId]);

  useEffect(() => {
    const refreshCurrentLayer = async () => {
      setMarketRefreshLoading(true);
      try {
        const data = (await fetch(`/api/map-layer-data?layer=${activeLayerId}&history=1`, {
          cache: "no-store",
        }).then((r) => r.json())) as LayerDataState;
        setLayerData({ byIso3: data.byIso3 ?? {}, byName: data.byName ?? {} });
        setLayerHistory(data.history ?? {});
        const g = globeRef.current;
        if (g && mapModeRef.current === "market") {
          g.polygonCapColor((d: object) => hexWithAlpha(getColorForCountry((d as CountryPoly).name), 0.5));
        }
      } catch {
        // ignore background refresh failures
      } finally {
        setMarketRefreshLoading(false);
      }
    };

    const id = setInterval(refreshCurrentLayer, 300000);
    return () => clearInterval(id);
  }, [activeLayerId, getColorForCountry]);

  useEffect(() => {
    let cancelled = false;

    const fetchTradeLiveData = async () => {
      setTradeDataLoading(true);
      try {
        const [statsRes, vesselsRes, weeklyRes] = await Promise.all([
          fetch("/api/trade-stats", { cache: "no-store" }),
          fetch("/api/trade-vessels", { cache: "no-store" }),
          fetch("/api/trade-weekly", { cache: "no-store" }),
        ]);
        const [statsData, vesselsData, weeklyData] = await Promise.all([
          statsRes.json() as Promise<TradeStatsApi>,
          vesselsRes.json() as Promise<{
            flights?: TradeFlightPosition[];
            shippingNews?: Array<{ title: string; source: string; publishedAt: string; url: string }>;
            seaRoutes?: [number, number][][];
            landRoutes?: [number, number][][];
            ports?: TradePort[];
            riskZones?: TradeRiskZone[];
            weeklyChanges?: TradeWeeklyChange[];
          }>,
          weeklyRes.json() as Promise<TradeWeeklyApi>,
        ]);
        if (cancelled) return;
        setTradeStats(statsData);
        setTradeVessels({ shippingNews: vesselsData.shippingNews ?? [] });
        setSeaRoutes(Array.isArray(vesselsData.seaRoutes) ? vesselsData.seaRoutes : []);
        setLandRoutes(Array.isArray(vesselsData.landRoutes) ? vesselsData.landRoutes : []);
        setPorts(Array.isArray(vesselsData.ports) ? vesselsData.ports : []);
        setRiskZones(Array.isArray(vesselsData.riskZones) ? vesselsData.riskZones : []);
        setWeeklyChanges(Array.isArray(vesselsData.weeklyChanges) ? vesselsData.weeklyChanges : []);
        setFlightPositions(Array.isArray(vesselsData.flights) ? vesselsData.flights : []);
        setTradeWeekly(weeklyData);
        setLastTradeUpdate(new Date().toISOString());
      } catch {
        // keep previous values on transient failures
      } finally {
        if (!cancelled) setTradeDataLoading(false);
      }
    };

    void fetchTradeLiveData();
    const id = setInterval(fetchTradeLiveData, 300000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!hovered || mapMode !== "market") {
      setHoverData(null);
      setLoadingHover(false);
      return;
    }
    const { name: hoverName } = hovered;
    setLoadingHover(true);
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      fetchCountryData(hoverName, false).then((data) => {
        setHoverData(data ?? null);
        setLoadingHover(false);
      });
    }, 200);
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered?.name, hovered?.id, mapMode]);

  useEffect(() => {
    if (!selected) {
      setSelectedData(null);
      return;
    }
    setLoadingSelected(true);
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
        inflation:
          compareExtraData.inflation.byIso3[iso3 ?? ""] ?? compareExtraData.inflation.byName[c.name] ?? null,
        population:
          compareExtraData.population.byIso3[iso3 ?? ""] ?? compareExtraData.population.byName[c.name] ?? null,
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
        body: JSON.stringify({ layerId: activeLayerId, layerLabel: activeLayer.label, countryNames: list }),
      });
      const data = await res.json();
      if (data.estimates && typeof data.estimates === "object") {
        const names = Object.keys(data.estimates);
        setLayerData((prev) => ({ ...prev, byName: { ...prev.byName, ...data.estimates } }));
        setAiEstimatedCountryNames((prev) => new Set([...prev, ...names]));
      }
    } finally {
      setEstimateLoading(false);
    }
  }, [geography, activeLayerId, activeLayer.label, estimateLoading, getValueForCountry]);

  const handleLayerSelect = useCallback((id: LayerId) => {
    setActiveLayerId(id);
    setStoredLayerId(id);
  }, []);

  const clearTradeGlobeLayers = useCallback(() => {
    const g = globeRef.current;
    if (!g) return;
    g.arcsTransitionDuration(0).pointsTransitionDuration(0);
    const gRings = g as GlobeInstance & { ringsTransitionDuration?: (n: number) => GlobeInstance };
    gRings.ringsTransitionDuration?.(0);
    g.arcsData([]).pointsData([]).ringsData([]).htmlElementsData([]);
  }, []);

  const switchToMarketMap = useCallback(() => {
    clearTradeGlobeLayers();
    setMapMode("market");
  }, [clearTradeGlobeLayers]);

  /** Globe.gl instance (once) */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let ro: ResizeObserver | null = null;

    (async () => {
      const GlobeLib = (await import("globe.gl")).default;
      if (cancelled || !containerRef.current) return;

      const pr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, 1.5);

      const globe = new GlobeLib(containerRef.current)
        .backgroundColor("rgba(0,0,0,0)")
        .polygonsTransitionDuration(300)
        .polygonGeoJsonGeometry("geometry")
        .polygonLabel("")
        .arcsTransitionDuration(0)
        .arcAltitudeAutoScale(0.35)
        .pointsTransitionDuration(400)
        .pointLabel("")
        .ringAltitude(0.002)
        .pointOfView(INITIAL_POV, 0);

      const gPoly = globe as GlobeInstance & {
        polygonResolution?: (n: number) => GlobeInstance;
        ringsTransitionDuration?: (n: number) => GlobeInstance;
      };
      gPoly.polygonResolution?.(2);
      globe.polygonCapCurvatureResolution(3).arcCurveResolution(32).ringResolution(32);

      {
        const gExt = globe as GlobeInstance & { bumpImageUrl?: (url: string) => GlobeInstance };
        globe.globeImageUrl(GLOBE_TEXTURES.globeImageUrl);
        gExt.bumpImageUrl?.(GLOBE_TEXTURES.bumpImageUrl);
        globe.showAtmosphere(true);
        globe.atmosphereColor("lightskyblue");
      }

      globe.controls().autoRotate = false;
      const ctrl = globe.controls() as unknown as { enableDamping?: boolean; dampingFactor?: number };
      ctrl.enableDamping = true;
      ctrl.dampingFactor = 0.1;

      globe.renderer().setPixelRatio(pr);
      const globePr = globe as GlobeInstance & { pixelRatio?: (n: number) => GlobeInstance };
      globePr.pixelRatio?.(pr);
      globe.renderer().shadowMap.enabled = false;

      globe.controls().minDistance = 120;
      globe.controls().maxDistance = 320;

      globe.onPolygonHover((poly: object | null) => {
        if (mapModeRef.current !== "market") {
          setHoveredRef.current(null);
          return;
        }
        if (!poly) {
          setHoveredRef.current(null);
          return;
        }
        const p = poly as CountryPoly;
        setHoveredRef.current((prev) =>
          prev?.name === p.name && prev?.id === p.id ? prev : { name: p.name, id: p.id },
        );
      });

      globe.onPolygonClick((poly: object) => {
        if (mapModeRef.current !== "market") return;
        handleCountryClick(poly as CountryPoly);
      });

      if (cancelled || !containerRef.current) {
        try {
          globe._destructor();
        } catch {
          /* ignore */
        }
        return;
      }

      globeRef.current = globe;

      const applyResize = () => {
        if (!globe || !containerRef.current) return;
        const { clientWidth, clientHeight } = containerRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          globe.width(clientWidth);
          globe.height(clientHeight);
        }
      };
      applyResize();
      ro = new ResizeObserver(() => {
        if (resizeTimer !== undefined) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          resizeTimer = undefined;
          applyResize();
        }, 100);
      });
      ro.observe(containerRef.current);
    })();

    return () => {
      cancelled = true;
      if (resizeTimer !== undefined) clearTimeout(resizeTimer);
      ro?.disconnect();
      const g = globeRef.current;
      if (g) {
        try {
          g._destructor();
        } catch {
          /* ignore */
        }
        globeRef.current = null;
      }
    };
  }, [handleCountryClick]);

  /** Sync market vs trade globe layers */
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !countryPolys.length) return;

    const compareIds = new Set(compareCountries.map((c) => c.id));

    if (mapMode === "market") {
      g.enablePointerInteraction(true);
      g.arcAltitudeAutoScale(0.35);
      g.polygonsData(countryPolys)
        .polygonCapColor((d: object) => hexWithAlpha(getColorForCountry((d as CountryPoly).name), 0.5))
        .polygonSideColor(() => "rgba(0,0,0,0.15)")
        .polygonStrokeColor((d: object) => {
          const p = d as CountryPoly;
          return compareIds.has(p.id) ? "#ffffff" : "#1e293b";
        })
        .polygonAltitude((d: object) => (compareIds.has((d as CountryPoly).id) ? 0.06 : 0.01))
        .polygonLabel((d: object) => (d as CountryPoly).name);

      g.arcsData([]).pointsData([]).ringsData([]).htmlElementsData([]);
      g.onArcClick(() => {});
      g.onPointClick(() => {});
    } else {
      g.enablePointerInteraction(true);
      g.polygonsData(countryPolys)
        .polygonCapColor(() => "rgba(255,255,255,0.03)")
        .polygonSideColor(() => "rgba(0,0,0,0)")
        .polygonStrokeColor(() => "#1e293b")
        .polygonAltitude(0.005)
        .polygonLabel("");

      g.arcsData(tradeArcsCombined)
        .arcStartLat("startLat")
        .arcStartLng("startLng")
        .arcEndLat("endLat")
        .arcEndLng("endLng")
        .arcAltitudeAutoScale(0)
        .arcAltitude((d: object) => {
          const k = (d as { kind: ArcKind }).kind;
          /* Lower = closer to globe surface, shallower arc (dashed sea routes). */
          if (k === "sea") return 0.055;
          return 0.045;
        })
        .arcColor((d: object) => {
          const k = (d as { kind: ArcKind }).kind;
          if (k === "sea") return "#3b82f6";
          return "#f59e0b";
        })
        .arcStroke((d: object) => {
          const k = (d as { kind: ArcKind }).kind;
          if (k === "sea") return 0.25;
          return 0.5;
        })
        .arcDashLength((d: object) => {
          const k = (d as { kind: ArcKind }).kind;
          if (k === "land") return 1;
          if (k === "sea") return 0.02;
          return 0.4;
        })
        .arcDashGap((d: object) => {
          const k = (d as { kind: ArcKind }).kind;
          if (k === "land") return 0;
          if (k === "sea") return 0.01;
          return 0.2;
        })
        .arcDashInitialGap(0)
        .arcDashAnimateTime((d: object) => {
          const k = (d as { kind: ArcKind }).kind;
          /* Longer ms = slower traveling dash animation. */
          if (k === "sea") return 24000;
          return 0;
        })
        .arcsTransitionDuration(0);

      g.pointsData(tradePointsData)
        .pointLat((d: object) => (d as { pos: [number, number] }).pos[0])
        .pointLng((d: object) => (d as { pos: [number, number] }).pos[1])
        .pointColor(() => "#3b82f6")
        .pointAltitude(0.01)
        .pointRadius(0.5)
        .pointLabel((d: object) => (d as { name: string }).name)
        .onPointClick((d: object) => {
          const p = d as { name: string; volume?: string; pos: [number, number] };
          setSelectedTradeArc(null);
          setSelectedRiskZone(null);
          setSelectedFlight(null);
          setSelectedPort({ name: p.name, pos: p.pos, volume: p.volume ?? "—" });
        });

      g.htmlElementsData(tradeFlightHtmlData)
        .htmlLat((d: object) => (d as TradeFlightPosition).lat)
        .htmlLng((d: object) => (d as TradeFlightPosition).lon)
        .htmlAltitude(0.01)
        .htmlElement((d: object) => {
          const flight = d as TradeFlightPosition;
          const el = document.createElement("div");
          el.innerHTML = "✈";
          el.style.cssText =
            "font-size:14px; color:#22c55e; cursor:pointer; transform:rotate(" +
            (flight.heading || 0) +
            "deg); transition: transform 0.3s; filter: drop-shadow(0 0 4px #22c55e);";
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            selectFlightFromGlobeRef.current(flight);
          });
          return el;
        });

      g.onArcClick((arc: object) => {
        const a = arc as {
          kind: ArcKind;
          routeLabel?: string;
          segmentIndex?: number;
          segmentCount?: number;
          startLat: number;
          startLng: number;
          endLat: number;
          endLng: number;
        };
        setSelectedFlight(null);
        setSelectedPort(null);
        setSelectedRiskZone(null);
        setSelectedTradeArc({
          kind: a.kind,
          routeLabel: typeof a.routeLabel === "string" ? a.routeLabel : `${a.kind} route`,
          segmentIndex: typeof a.segmentIndex === "number" ? a.segmentIndex : 1,
          segmentCount: typeof a.segmentCount === "number" ? a.segmentCount : 1,
          startLat: a.startLat,
          startLng: a.startLng,
          endLat: a.endLat,
          endLng: a.endLng,
        });
      });

      const gRings = g as GlobeInstance & { ringsTransitionDuration?: (n: number) => GlobeInstance };
      gRings.ringsTransitionDuration?.(0);
      g.ringsData(tradeRingsData)
        .ringLat((d: object) => (d as TradeZoneWithCoords).lat)
        .ringLng((d: object) => (d as TradeZoneWithCoords).lng)
        .ringColor((d: object) => {
          const z = d as TradeZoneWithCoords;
          return z.risk === "high"
            ? "rgba(239,68,68,0.8)"
            : z.risk === "medium"
              ? "rgba(245,158,11,0.8)"
              : "rgba(59,130,246,0.5)";
        })
        .ringMaxRadius((d: object) => {
          const z = d as TradeZoneWithCoords;
          return z.risk === "high" ? 4 : z.risk === "medium" ? 3 : 2;
        })
        .ringPropagationSpeed(0.8)
        .ringRepeatPeriod(1500);
    }
  }, [
    mapMode,
    countryPolys,
    getColorForCountry,
    compareCountries,
    tradeArcsCombined,
    tradePointsData,
    tradeFlightHtmlData,
    tradeRingsData,
  ]);

  useLayoutEffect(() => {
    const g = globeRef.current;
    if (!g || mapMode !== "market") return;
    g.arcsTransitionDuration(0).pointsTransitionDuration(0);
    const gRings = g as GlobeInstance & { ringsTransitionDuration?: (n: number) => GlobeInstance };
    gRings.ringsTransitionDuration?.(0);
    g.arcsData([]).pointsData([]).ringsData([]).htmlElementsData([]);
  }, [mapMode]);

  useEffect(() => {
    if (mapMode === "trade") {
      setHovered(null);
      setSelected(null);
    } else {
      setSelectedRiskZone(null);
      setSelectedFlight(null);
      setSelectedPort(null);
      setSelectedTradeArc(null);
    }
  }, [mapMode]);

  const resetGlobeView = useCallback(() => {
    globeRef.current?.pointOfView(INITIAL_POV, 800);
  }, []);

  const previewTarget = selected ?? hovered;

  return (
    <div className="flex w-full flex-col gap-0">
      <style>{LEAFLET_STYLE}</style>

      <div className="flex flex-wrap items-center gap-2 border-b border-white/5 bg-black px-2 py-2 md:px-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMapMode("trade")}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
              mapMode === "trade"
                ? "border-[var(--accent-color)]/50 bg-[var(--accent-color)]/10 text-[var(--accent-color)]"
                : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:bg-white/10 hover:text-zinc-200"
            }`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
            </svg>
            International Trade
          </button>
          <button
            type="button"
            onClick={switchToMarketMap}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
              mapMode === "market"
                ? "border-[var(--accent-color)]/50 bg-[var(--accent-color)]/10 text-[var(--accent-color)]"
                : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:bg-white/10 hover:text-zinc-200"
            }`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l7-7 4 4 7-7M3 19l7-7 4 4 7-7" />
            </svg>
            Market Map
          </button>
        </div>
        <div className="ml-auto mr-1 flex items-center gap-1.5 text-[10px] text-zinc-500">
          <span className={`h-2 w-2 rounded-full ${marketRefreshLoading ? "animate-pulse bg-emerald-400" : "bg-zinc-600"}`} />
          {marketRefreshLoading ? "Refreshing data..." : "Auto-refresh 5m"}
        </div>

        {mapMode === "market" && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={resetGlobeView}
              className="rounded-lg border border-white/10 bg-white/5 p-2 text-zinc-400 transition hover:border-white/20 hover:bg-white/10 hover:text-zinc-200"
              aria-label="Reset globe view"
              title="Reset view"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4M12 18v4M2 12h4M18 12h4" />
              </svg>
            </button>
            {!isMobile && (
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
            )}
            <button
              type="button"
              onClick={handleEstimateMissing}
              disabled={estimateLoading || !geography}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-[var(--accent-color)]/30 hover:bg-[var(--accent-color)]/10 hover:text-[var(--accent-color)] disabled:opacity-50"
            >
              {estimateLoading ? "Estimating…" : "Estimate missing (AI)"}
            </button>
            <div className="relative flex items-center" data-estimate-info>
              <button
                type="button"
                onClick={() => setShowEstimateInfo((v) => !v)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-white/5 text-[10px] font-medium text-zinc-500 transition hover:bg-white/10 hover:text-zinc-300"
              >
                i
              </button>
              {showEstimateInfo && (
                <div className="absolute left-0 top-full z-[1100] mt-1 w-[min(420px,calc(100vw-2rem))] rounded-lg border border-white/10 bg-[#0F1520] px-3 py-2 text-[11px] leading-snug text-zinc-300 shadow-xl">
                  Estimates up to 35 countries at a time to avoid lag. Run again to cover more.
                </div>
              )}
            </div>
            {aiEstimatedCountryNames.size > 0 && (
              <button
                type="button"
                onClick={() => setHideAiEstimates((v) => !v)}
                className={`rounded-lg border p-2 transition ${hideAiEstimates ? "border-[var(--accent-color)] bg-[var(--accent-color)]/20 text-[var(--accent-color)]" : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:bg-white/10 hover:text-zinc-200"}`}
                title={hideAiEstimates ? "Show AI estimates" : "Hide AI estimates"}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {mapMode === "market" && (
        <div className="flex flex-col gap-2 border-b border-white/5 bg-black px-2 py-2 md:flex-row md:items-end md:px-3">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
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
          <div className="hidden shrink-0 md:block md:min-w-[200px]">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">{activeLayer.legend.title}</p>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 max-w-[200px] rounded-full" style={{ background: activeLayer.legend.gradient }} />
              <span className="text-[9px] text-zinc-500">{activeLayer.legend.lowLabel}</span>
              <span className="text-[9px] text-zinc-500">{activeLayer.legend.highLabel}</span>
            </div>
          </div>
        </div>
      )}

      <div
        className="globe-view-root relative w-full overflow-hidden rounded-2xl border border-white/10"
        style={{
          position: "relative",
          width: "100%",
          height: "calc(100vh - 160px)",
          minHeight: 600,
          background: "#050713",
          borderRadius: "1rem",
          overflow: "hidden",
        }}
      >
        <div ref={containerRef} className="absolute inset-0" />

        {layerLoading && mapMode === "market" && (
          <div className="absolute inset-0 z-[900] flex flex-col items-center justify-center gap-2 bg-black/70">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-color)] border-t-transparent" />
            <p className="text-sm text-zinc-400">Loading {activeLayer.label} data…</p>
          </div>
        )}
        {tradeGlobeLoading && (
          <div className="absolute inset-0 z-[900] flex flex-col items-center justify-center gap-2 bg-black/35">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
            <p className="text-sm text-zinc-300">Loading live trade data...</p>
          </div>
        )}

        {mapMode === "market" && previewTarget && (
          <div
            className="pointer-events-auto z-[1000] min-w-[200px] max-w-[min(340px,calc(100vw-2rem))]"
            style={{
              position: "absolute",
              bottom: "1.5rem",
              left: "1.5rem",
              background: "#0A0E1A",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "0.75rem",
              padding: "1rem",
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--accent-color)]">{previewTarget.name}</p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {activeLayer.label}: {activeLayer.formatValue(getDisplayValueForCountry(previewTarget.name))}
                </p>
                {selected && selected.id === previewTarget.id && (
                  <>
                    {loadingSelected ? (
                      <p className="mt-1 text-[10px] text-zinc-500">Loading…</p>
                    ) : selectedData ? (
                      <div className="mt-2 space-y-1 text-[11px] text-zinc-400">
                        {selectedData.market && (
                          <p>
                            {selectedData.market.indexName}:{" "}
                            {selectedData.market.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            <span className={selectedData.market.changePercent >= 0 ? "text-emerald-400" : "text-red-400"}>
                              {" "}
                              {selectedData.market.changePercent >= 0 ? "+" : ""}
                              {selectedData.market.changePercent.toFixed(2)}%
                            </span>
                          </p>
                        )}
                        {(selectedData.news?.length ?? 0) > 0 && (
                          <p className="line-clamp-2 text-zinc-500">{(selectedData.news ?? [])[0].title}</p>
                        )}
                      </div>
                    ) : null}
                  </>
                )}
                {(!selected || selected.id !== previewTarget.id) && loadingHover && (
                  <p className="mt-1 text-[10px] text-zinc-500">Loading…</p>
                )}
                {(!selected || selected.id !== previewTarget.id) && !loadingHover && hoverData && hovered?.id === previewTarget.id && (
                  <div className="mt-2 space-y-1 text-[11px] text-zinc-400">
                    {hoverData.market && (
                      <p>
                        {hoverData.market.indexName}:{" "}
                        {hoverData.market.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </p>
                    )}
                  </div>
                )}
              </div>
              {selected && selected.id === previewTarget.id && (
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="shrink-0 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-medium text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        )}

        {mapMode === "trade" && (selectedFlight || selectedPort || selectedTradeArc || selectedRiskZone) && (
          <div
            className="pointer-events-auto z-[1000] min-w-[220px] max-w-[min(340px,calc(100vw-2rem))] max-h-[min(75vh,calc(100%-5rem))] overflow-y-auto rounded-xl border border-white/10 bg-[#0A0E1A] p-4 shadow-xl"
            style={{ position: "absolute", bottom: "1.5rem", right: "1.5rem" }}
          >
            {selectedFlight ? (
              <>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-emerald-400">{selectedFlight.callsign}</p>
                  <button
                    type="button"
                    onClick={() => setSelectedFlight(null)}
                    className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-white/10"
                  >
                    Close
                  </button>
                </div>
                <div className="space-y-1 text-[11px] text-zinc-300">
                  <p>Altitude: {selectedFlight.altitude != null ? `${Math.round(selectedFlight.altitude * 3.281).toLocaleString()} ft` : "—"}</p>
                  <p>Speed: {selectedFlight.velocity != null ? `${Math.round(selectedFlight.velocity * 1.944)} kt` : "—"}</p>
                  <p>Heading: {headingToCompass(selectedFlight.heading)}</p>
                  <div className="mt-1 flex items-center gap-2 text-emerald-400">
                    <span className="inline-block animate-pulse">✈</span>
                    <span className="text-[10px] text-zinc-400">Live flight tracking</span>
                  </div>
                </div>
              </>
            ) : selectedPort ? (
              <>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-sky-400">{selectedPort.name}</p>
                  <button
                    type="button"
                    onClick={() => setSelectedPort(null)}
                    className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-white/10"
                  >
                    Close
                  </button>
                </div>
                <p className="text-[11px] text-zinc-300">Volume: {selectedPort.volume}</p>
              </>
            ) : selectedTradeArc ? (
              <>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p
                      className={`text-[10px] font-semibold uppercase tracking-wide ${
                        selectedTradeArc.kind === "sea" ? "text-sky-400" : "text-amber-400"
                      }`}
                    >
                      {selectedTradeArc.kind === "sea" ? "Sea route" : "Land corridor"}
                    </p>
                    <p className="truncate text-sm font-semibold text-zinc-100">{selectedTradeArc.routeLabel}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedTradeArc(null)}
                    className="shrink-0 rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-white/10"
                  >
                    Close
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Segment {selectedTradeArc.segmentIndex} of {selectedTradeArc.segmentCount}
                </p>
                <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-500">
                  {selectedTradeArc.startLat.toFixed(2)}°, {selectedTradeArc.startLng.toFixed(2)}° →{" "}
                  {selectedTradeArc.endLat.toFixed(2)}°, {selectedTradeArc.endLng.toFixed(2)}°
                </p>
                <p className="mt-2 text-[10px] text-zinc-500">Click another arc or a port / flight to switch details.</p>
              </>
            ) : selectedRiskZone ? (
              <>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-zinc-200">{selectedRiskZone.name}</p>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ${
                      selectedRiskZone.risk === "high"
                        ? "bg-red-500/20 text-red-400"
                        : selectedRiskZone.risk === "medium"
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-blue-500/20 text-blue-400"
                    }`}
                  >
                    {selectedRiskZone.risk} risk
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-400">{selectedRiskZone.summary}</p>
                {selectedRiskZone.recentArticles && selectedRiskZone.recentArticles.length > 0 && (
                  <div className="mt-3 border-t border-white/10 pt-2">
                    <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">Recent news</p>
                    <ul className="flex flex-col gap-1.5">
                      {selectedRiskZone.recentArticles.slice(0, 3).map((article) => {
                        const titleShort =
                          article.title.length > 80 ? `${article.title.slice(0, 77)}...` : article.title;
                        return (
                          <li key={`${article.url}-${titleShort.slice(0, 20)}`}>
                            <a
                              href={article.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block rounded-md border border-white/10 bg-white/5 px-2 py-1.5 transition hover:border-sky-500/30 hover:bg-white/10"
                            >
                              <span className="line-clamp-2 text-[10px] font-medium text-sky-300">{titleShort}</span>
                              <span className="mt-0.5 block text-[9px] text-zinc-500">{article.source}</span>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                <p className="mt-2 text-[10px] text-zinc-500">Affected: {selectedRiskZone.affected}</p>
                <p className="text-[10px] text-zinc-500">
                  Last updated: {selectedRiskZone.lastUpdated ? new Date(selectedRiskZone.lastUpdated).toLocaleString() : "—"}
                </p>
                <p className="text-[10px] text-zinc-500">Article count: {selectedRiskZone.articleCount ?? 0}</p>
                <button
                  type="button"
                  onClick={() => setSelectedRiskZone(null)}
                  className="mt-2 rounded border border-white/15 bg-white/5 px-2 py-1 text-[10px] text-zinc-300 hover:bg-white/10"
                >
                  Close
                </button>
              </>
            ) : null}
          </div>
        )}

        {mapMode === "market" && !isMobile && compareMode && (
          <p className="absolute right-4 top-14 z-[1000] max-w-[220px] rounded-lg border border-white/10 bg-[#0A0E1A]/95 px-2 py-1.5 text-[10px] leading-snug text-zinc-400">
            Click up to 4 countries. A comparison table and AI insight appear below.
          </p>
        )}

        <div className="pointer-events-none absolute bottom-2 right-3 z-[1000] text-[9px] text-zinc-600">
          {mapMode === "market"
            ? activeLayer.wbIndicator
              ? "Data: World Bank · Globe"
              : "Data: Various · Globe"
            : "International Trade · Globe"}
        </div>

        {mapMode === "trade" && (
          <div
            className="pointer-events-auto z-[1000] flex max-h-[min(520px,calc(100%-1.5rem))] flex-col gap-3 overflow-y-auto rounded-xl border p-3 shadow-xl"
            style={{
              position: "absolute",
              top: "1rem",
              right: "1rem",
              width: "280px",
              background: "#0A0E1A",
              borderColor: "rgba(255,255,255,0.1)",
            }}
          >
            <div>
              <button
                type="button"
                onClick={() => setTradeStatsOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-2 text-left"
                aria-expanded={tradeStatsOpen}
                aria-label={tradeStatsOpen ? "Collapse trade snapshot" : "Expand trade snapshot"}
              >
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">LIVE TRADE INTELLIGENCE</p>
                  <p className="mt-0.5 text-[10px] text-zinc-600">
                    Updated {lastTradeUpdate ? new Date(lastTradeUpdate).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}
                  </p>
                  <p className="text-[10px] text-zinc-600">{formatLastUpdatedLabel}</p>
                </div>
                <span
                  className="inline-flex shrink-0 text-zinc-400 transition-transform duration-200 ease-out"
                  style={{ transform: tradeStatsOpen ? "rotate(0deg)" : "rotate(180deg)" }}
                  aria-hidden
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </button>
              {tradeStatsOpen && (
                <>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {tradeCards.map((s) => (
                      <div key={s.label} className="rounded-lg border border-white/10 bg-white/5 p-2">
                        <p className="leading-tight text-[9px] text-zinc-500">{s.label}</p>
                        {tradeDataLoading ? (
                          <>
                            <div className="mt-2 h-4 w-20 animate-pulse rounded bg-white/10" />
                            <div className="mt-1 h-3 w-16 animate-pulse rounded bg-white/10" />
                            <div className="mt-1 h-2.5 w-14 animate-pulse rounded bg-white/10" />
                          </>
                        ) : (
                          <>
                            <p className="mt-1 text-xs font-semibold text-zinc-100">{s.value}</p>
                            <p className={`text-[10px] font-medium ${s.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {s.change >= 0 ? "+" : ""}
                              {s.change.toFixed(2)}% {s.suffix}
                            </p>
                            <p className="text-[9px] text-zinc-600">as of {formatAsOf(s.asOf)}</p>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">Active risk zones</p>
                    <div className="flex flex-col gap-1.5">
                      {(riskZones.length > 0 ? riskZones : DEFAULT_TRADE_CHOKEPOINTS).map((zone) => (
                        <button
                          key={zone.name}
                          type="button"
                          onClick={() => {
                            if (selectedRiskZone?.name === zone.name) {
                              setSelectedRiskZone(null);
                              return;
                            }
                            setSelectedFlight(null);
                            setSelectedPort(null);
                            setSelectedTradeArc(null);
                            setSelectedRiskZone(zone);
                          }}
                          className={`flex items-start gap-2 rounded-lg border p-2 text-left transition ${
                            selectedRiskZone?.name === zone.name
                              ? zone.risk === "high"
                                ? "border-red-500/50 bg-red-500/10"
                                : zone.risk === "medium"
                                  ? "border-amber-500/50 bg-amber-500/10"
                                  : "border-blue-500/50 bg-blue-500/10"
                              : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8"
                          }`}
                        >
                          <span
                            className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                            style={{
                              background:
                                zone.risk === "high" ? "#ef4444" : zone.risk === "medium" ? "#f59e0b" : "#3b82f6",
                            }}
                          />
                          <div>
                            <p className="text-[11px] font-medium leading-tight text-zinc-200">{zone.name}</p>
                            <p className="mt-0.5 text-[10px] text-zinc-500">{zone.affected}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setWeeklyChangesOpen((o) => !o)}
                      className="flex w-full items-center justify-between gap-2 text-left"
                      aria-expanded={weeklyChangesOpen}
                      aria-label={weeklyChangesOpen ? "Collapse weekly changes" : "Expand weekly changes"}
                    >
                      <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Weekly Changes</p>
                      <span
                        className="inline-flex shrink-0 text-zinc-400 transition-transform duration-200 ease-out"
                        style={{ transform: weeklyChangesOpen ? "rotate(0deg)" : "rotate(180deg)" }}
                        aria-hidden
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </span>
                    </button>
                    {weeklyChangesOpen && (
                      <div className="mt-2 space-y-1.5">
                        {weeklyChanges.length === 0 ? (
                          <p className="text-[11px] text-zinc-500">No significant route changes this week.</p>
                        ) : (
                          weeklyChanges.map((item, idx) => {
                            const positive = item.type === "opened" || item.type === "restored";
                            return (
                              <div key={`${item.route}-${idx}`} className="rounded-lg border border-white/10 bg-white/5 p-2">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ${
                                      positive ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                                    }`}
                                  >
                                    {item.type}
                                  </span>
                                  <p className="text-[11px] font-medium text-zinc-200">{item.route}</p>
                                </div>
                                <p className="mt-1 text-[10px] text-zinc-400">{item.change}</p>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-3">
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">Legend</p>
                    <div className="flex flex-col gap-1 text-[10px] text-zinc-400">
                      <span className="flex items-center gap-2">
                        <span className="inline-block w-5 border-t-2 border-dashed border-blue-500" /> Sea lane
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="inline-block w-5 border-t-2 border-amber-500" /> Land corridor
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> Port
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-sm leading-none text-emerald-400 drop-shadow-[0_0_4px_#22c55e]">✈</span>
                        <span>Live flight</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> High risk
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> Medium risk
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> Low risk
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {mapMode === "trade" && (
          <div
            className="absolute z-[1000] flex flex-col gap-1.5"
            style={{ bottom: "1.5rem", left: "1.5rem" }}
          >
            {(
              [
                { key: "sea" as const, label: "Sea routes", color: "#3b82f6" },
                { key: "flights" as const, label: "Live flights", color: "#22c55e" },
                { key: "land" as const, label: "Land corridors", color: "#f59e0b" },
                { key: "conflict" as const, label: "Risk zones", color: "#ef4444" },
              ] as const
            ).map(({ key, label, color }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTradeLayers((prev) => ({ ...prev, [key]: !prev[key] }))}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${
                  tradeLayers[key]
                    ? "border-white/20 bg-[#0A0E1A]/95 text-zinc-200"
                    : "border-white/10 bg-[#0A0E1A]/80 text-zinc-500"
                }`}
                style={{ borderColor: "rgba(255,255,255,0.1)" }}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: tradeLayers[key] ? color : "#374151" }}
                />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="px-2 py-1 text-left text-[10px] text-zinc-500">
        AI estimates are approximate and for context only. Use the &quot;Hide AI estimates&quot; toggle to gray out estimated countries.
      </p>

      {mapMode === "market" && selected && !compareMode && (
        <div className="mt-2 px-1">
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

      {mapMode === "market" && compareMode && compareCountries.length > 0 && !isMobile && (
        <div className="animate-[fadeIn_0.2s_ease-out] mt-2 rounded-2xl border border-white/10 bg-[#0F1520] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-200">Compare countries</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCompareCountries([])}
                className="rounded bg-white/10 px-2 py-1 text-xs text-zinc-400 hover:bg-white/15"
              >
                Clear
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
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">AI comparative insight</p>
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
                      <td className="py-2 pr-4 text-zinc-400">{extra.inflation != null ? `${extra.inflation.toFixed(1)}%` : "—"}</td>
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
                    style={{ height: `${pct}%`, backgroundColor: activeLayer.valueToColor(v) }}
                  />
                  <span className="max-w-full truncate text-[10px] text-zinc-500">{c.name.split(" ")[0]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
