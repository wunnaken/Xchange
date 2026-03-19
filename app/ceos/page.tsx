"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CEOS,
  CEO_SECTORS,
  type CEOEntry,
  getInitials,
  sentimentColor,
} from "../../lib/ceo-data";
import {
  addToWatchlistApi,
  fetchWatchlist,
  isTickerInWatchlist,
  removeFromWatchlistApi,
} from "../../lib/watchlist-api";

const CANVAS_W = 3000;
const CANVAS_H = 2000;
const LINK_COLOR = "rgba(30, 58, 95, 0.4)";
const LINK_HOVER = "rgba(255,255,255,0.9)";
const PANEL_BG = "#0F1520";

const CEO_PANELS_KEY = "xchange-ceo-panels";

function getCeoPanelPrefs(): { detailPanelWidth: number; detailPanelCollapsed: boolean; filterPanelCollapsed: boolean } {
  if (typeof window === "undefined") return { detailPanelWidth: 400, detailPanelCollapsed: false, filterPanelCollapsed: false };
  try {
    const raw = localStorage.getItem(CEO_PANELS_KEY);
    if (!raw) return { detailPanelWidth: 400, detailPanelCollapsed: false, filterPanelCollapsed: false };
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && "detailPanelWidth" in parsed && "detailPanelCollapsed" in parsed && "filterPanelCollapsed" in parsed) {
      const p = parsed as { detailPanelWidth: number; detailPanelCollapsed: boolean; filterPanelCollapsed: boolean };
      return {
        detailPanelWidth: Math.min(700, Math.max(280, Number(p.detailPanelWidth) || 400)),
        detailPanelCollapsed: Boolean(p.detailPanelCollapsed),
        filterPanelCollapsed: Boolean(p.filterPanelCollapsed),
      };
    }
  } catch {
    // ignore
  }
  return { detailPanelWidth: 400, detailPanelCollapsed: false, filterPanelCollapsed: false };
}

function saveCeoPanelPrefs(prefs: { detailPanelWidth: number; detailPanelCollapsed: boolean; filterPanelCollapsed: boolean }) {
  try {
    localStorage.setItem(CEO_PANELS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

const CEO_MAP_CAMERA_KEY = "xchange-ceo-map-camera";

function getCeoMapCamera(): { k: number; x: number; y: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CEO_MAP_CAMERA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && "k" in parsed && "x" in parsed && "y" in parsed) {
      const p = parsed as { k: number; x: number; y: number };
      const k = Number(p.k);
      if (k >= 0.28 && k <= 4) return { k, x: Number(p.x), y: Number(p.y) };
    }
  } catch {
    // ignore
  }
  return null;
}

function saveCeoMapCamera(camera: { k: number; x: number; y: number }) {
  try {
    localStorage.setItem(CEO_MAP_CAMERA_KEY, JSON.stringify(camera));
  } catch {
    // ignore
  }
}

const CEO_FILTERS_KEY = "xchange-ceo-filters";

function getCeoFilters(): FilterState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CEO_FILTERS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const p = parsed as { search?: string; sectors?: string[]; sentiment?: string; tenure?: string; marketCap?: string };
    const sectors = Array.isArray(p.sectors) ? new Set(p.sectors) : new Set(CEO_SECTORS);
    const sentiment = (["all", "positive", "negative", "alerts"] as const).includes(p.sentiment as FilterState["sentiment"]) ? (p.sentiment as FilterState["sentiment"]) : "all";
    const tenure = (["all", "new", "established", "veteran"] as const).includes(p.tenure as FilterState["tenure"]) ? (p.tenure as FilterState["tenure"]) : "all";
    const marketCap = (["all", "mega", "large", "mid"] as const).includes(p.marketCap as FilterState["marketCap"]) ? (p.marketCap as FilterState["marketCap"]) : "all";
    return { search: typeof p.search === "string" ? p.search : "", sectors, sentiment, tenure, marketCap };
  } catch {
    return null;
  }
}

function saveCeoFilters(filters: FilterState) {
  try {
    localStorage.setItem(
      CEO_FILTERS_KEY,
      JSON.stringify({
        search: filters.search,
        sectors: Array.from(filters.sectors),
        sentiment: filters.sentiment,
        tenure: filters.tenure,
        marketCap: filters.marketCap,
      })
    );
  } catch {
    // ignore
  }
}

function truncateCompany(name: string, maxLen: number): string {
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen - 1) + "…";
}

function seedRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i);
  return () => {
    h = (h << 5) - h + 1;
    return Math.abs((h >>> 0) % 1000) / 1000;
  };
}

function getTier(marketCap: number): number {
  if (marketCap >= 1000) return 1;
  if (marketCap >= 500) return 2;
  if (marketCap >= 100) return 3;
  if (marketCap >= 50) return 4;
  return 5;
}

function tierRadius(tier: number): number {
  switch (tier) {
    case 1: return 28;
    case 2: return 22;
    case 3: return 16;
    case 4: return 12;
    default: return 8;
  }
}

function tierY(tier: number): number {
  switch (tier) {
    case 1: return 280;
    case 2: return 550;
    case 3: return 1000;
    case 4: return 1420;
    default: return 1820;
  }
}

type FilterState = {
  search: string;
  sectors: Set<string>;
  sentiment: "all" | "positive" | "negative" | "alerts";
  tenure: "all" | "new" | "established" | "veteran";
  marketCap: "all" | "mega" | "large" | "mid";
};

const defaultFilters = (): FilterState => ({
  search: "",
  sectors: new Set(CEO_SECTORS),
  sentiment: "all",
  tenure: "all",
  marketCap: "all",
});

type QuickPresetId = "spy500" | "qqq100" | "dow30" | "magnificent7" | "techGiants";

const QUICK_PRESET_BUTTON_LABEL: Record<QuickPresetId, string> = {
  spy500: "SPY 500",
  qqq100: "QQQ 100",
  dow30: "Dow 30",
  magnificent7: "Magnificent 7",
  techGiants: "Tech Giants",
};

const QUICK_PRESET_SHOW_LABEL: Record<QuickPresetId, string> = {
  // Special wording requested
  spy500: "S&P 500 Companies",
  qqq100: "QQQ 100",
  dow30: "Dow 30",
  magnificent7: "Magnificent 7",
  techGiants: "Tech Giants",
};

const QUICK_PRESET_TICKERS: Record<QuickPresetId, Set<string> | null> = {
  // All our CEOs are treated as belonging to the “S&P 500” preset.
  spy500: null,
  qqq100: new Set([
    "AAPL",
    "MSFT",
    "NVDA",
    "GOOGL",
    "AMZN",
    "META",
    "TSLA",
    "AVGO",
    "COST",
    "NFLX",
    "AMD",
    "ADBE",
    "QCOM",
    "INTC",
    "CSCO",
    "TXN",
    "AMGN",
    "HON",
    "SBUX",
    "ISRG",
    "VRTX",
    "ADP",
    "PANW",
    "LRCX",
    "MDLZ",
    "REGN",
    "GILD",
    "PYPL",
    "MELI",
    "KDP",
  ]),
  dow30: new Set([
    "AAPL",
    "MSFT",
    "UNH",
    "GS",
    "HD",
    "MCD",
    "CAT",
    "AMGN",
    "V",
    "BA",
    "CRM",
    "HON",
    "IBM",
    "JPM",
    "AXP",
    "JNJ",
    "WMT",
    "PG",
    "TRV",
    "CVX",
    "MMM",
    "MRK",
    "DIS",
    "NKE",
    "DOW",
    "INTC",
    "VZ",
    "CSCO",
    "KO",
    "WBA",
  ]),
  magnificent7: new Set(["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA"]),
  techGiants: new Set([
    "AAPL",
    "MSFT",
    "NVDA",
    "GOOGL",
    "AMZN",
    "META",
    "TSLA",
    "ORCL",
    "CRM",
    "ADBE",
    "INTC",
    "AMD",
    "QCOM",
    "SHOP",
    "UBER",
    "NFLX",
    "SPOT",
  ]),
};

function getLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  // Keep simple punctuation so “O'Neil” still reads nicely.
  return last.replace(/[^\p{L}'-]/gu, "");
}

function filterCEOs(ceos: CEOEntry[], filters: FilterState): CEOEntry[] {
  return ceos.filter((c) => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!c.name.toLowerCase().includes(q) && !c.company.toLowerCase().includes(q) && !c.ticker.toLowerCase().includes(q))
        return false;
    }
    if (!filters.sectors.has(c.sector)) return false;
    if (filters.sentiment === "positive" && c.sentiment !== "positive") return false;
    if (filters.sentiment === "negative" && c.sentiment !== "negative") return false;
    if (filters.sentiment === "alerts" && !c.recentAlert) return false;
    const years = new Date().getFullYear() - c.tenureStart;
    if (filters.tenure === "new" && years >= 2) return false;
    if (filters.tenure === "established" && (years < 2 || years > 10)) return false;
    if (filters.tenure === "veteran" && years <= 10) return false;
    if (filters.marketCap === "mega" && c.marketCap < 500) return false;
    if (filters.marketCap === "large" && (c.marketCap < 100 || c.marketCap >= 500)) return false;
    if (filters.marketCap === "mid" && c.marketCap >= 100) return false;
    return true;
  });
}

type ConstellationNode = CEOEntry & { id: string; val: number; tier: number; fx: number; fy: number };

function buildGraphData(ceos: CEOEntry[]): { nodes: ConstellationNode[]; links: { source: string; target: string }[] } {
  const rnd = seedRandom(`constellation:${ceos.length}:${ceos.map((c) => c.ticker).slice(0, 6).join(",")}`);
  const byTier = new Map<number, CEOEntry[]>();
  ceos.forEach((c) => {
    const t = getTier(c.marketCap);
    if (!byTier.has(t)) byTier.set(t, []);
    byTier.get(t)!.push(c);
  });
  [1, 2, 3, 4, 5].forEach((t) => {
    const list = byTier.get(t) ?? [];
    list.sort((a, b) => b.marketCap - a.marketCap);
  });

  const nodes: ConstellationNode[] = [];

  if (ceos.length >= 220) {
    // Large universes (SPY 500): spread nodes to avoid clumping.
    const pad = 90;
    const cols = Math.ceil(Math.sqrt(ceos.length));
    const rows = Math.ceil(ceos.length / cols);
    const cellW = (CANVAS_W - pad * 2) / Math.max(1, cols);
    const cellH = (CANVAS_H - pad * 2) / Math.max(1, rows);
    const sorted = [...ceos].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
    sorted.forEach((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = pad + col * cellW + cellW * (0.15 + rnd() * 0.7);
      const y = pad + row * cellH + cellH * (0.15 + rnd() * 0.7);
      const tier = getTier(c.marketCap);
      const radius = tierRadius(tier);
      nodes.push({ ...c, id: c.id, val: radius, tier, fx: x, fy: y });
    });
  } else {
    // Smaller universes: tier bands.
    const padding = 120;
    [1, 2, 3, 4, 5].forEach((tier) => {
      const list = byTier.get(tier) ?? [];
      const count = list.length;
      const baseY = tierY(tier);
      const radius = tierRadius(tier);
      list.forEach((c, i) => {
        const x = count <= 1 ? CANVAS_W / 2 : padding + (i / (count - 1)) * (CANVAS_W - 2 * padding);
        const y = baseY + (rnd() - 0.5) * 60;
        nodes.push({ ...c, id: c.id, val: radius, tier, fx: x, fy: y });
      });
    });
  }

  const links: { source: string; target: string }[] = [];
  const linkSet = new Set<string>();
  function addLink(a: string, b: string) {
    const key = [a, b].sort().join("|");
    if (!linkSet.has(key)) {
      linkSet.add(key);
      links.push({ source: a, target: b });
    }
  }

  const tierLists = [1, 2, 3, 4, 5].map((t) => byTier.get(t) ?? []);

  tierLists.forEach((list, tierIndex) => {
    const nextTier = tierLists[tierIndex + 1] ?? [];
    list.forEach((c) => {
      const id = c.id;
      const connections: string[] = [];
      if (nextTier.length > 0) {
        const sameSectorBelow = nextTier.filter((x) => x.sector === c.sector);
        const sameSectorTarget = sameSectorBelow.length > 0 ? sameSectorBelow[Math.floor(rnd() * sameSectorBelow.length)] : nextTier[Math.floor(rnd() * nextTier.length)];
        if (sameSectorTarget) connections.push(sameSectorTarget.id);
        const cross = nextTier.filter((x) => x.id !== sameSectorTarget?.id);
        if (cross.length > 0 && connections.length < 3) {
          const pick = cross[Math.floor(rnd() * cross.length)];
          if (pick) connections.push(pick.id);
        }
      }
      if (tierIndex > 0) {
        const prevTier = tierLists[tierIndex - 1];
        if (prevTier.length > 0 && connections.length < 4) {
          const prev = prevTier[Math.floor(rnd() * prevTier.length)];
          if (prev) connections.push(prev.id);
        }
      }
      connections.slice(0, 4).forEach((targetId) => addLink(id, targetId));
    });
  });

  nodes.forEach((n) => {
    (n as Record<string, unknown>).x = n.fx;
    (n as Record<string, unknown>).y = n.fy;
  });

  return { nodes, links };
}

type CEOAlertItem = {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  company?: string;
  matchedTicker?: string;
};

const NODE_COLORS: Record<string, string> = {
  positive: "#00C896",
  neutral: "#60A5FA",
  negative: "#EF4444",
};

/** Placeholder tickers used in index presets before real symbols load — not valid for Finnhub/Claude company resolution. */
function isSyntheticMapTicker(ticker: string): boolean {
  const t = ticker.toUpperCase().trim();
  return (
    /^SPY500_\d+$/.test(t) ||
    t.startsWith("SPY500_FILL_") ||
    t.startsWith("QQQ100_FILL_") ||
    t.startsWith("DOW30_FILL_")
  );
}

const CEO_PROFILE_CACHE_VER = "v3";

function ceoProfileCacheKey(ticker: string): string {
  return `${ticker.toUpperCase()}:${CEO_PROFILE_CACHE_VER}`;
}

type CeoClaudeProfile = {
  tenure_start: string;
  tenure_years: number;
  legal_history: string | null;
  legal_severity: "none" | "minor" | "significant";
  sentiment: "Bullish" | "Bearish" | "Neutral";
  sentiment_reason: string;
  /** Approximate total return since CEO start; null if unknown */
  stock_since_tenure_percent_approx: number | null;
  /** One line for UI, e.g. approximate return narrative */
  stock_since_tenure_summary: string;
};

function mapClaudeSentimentToTint(s: string): "bullish" | "bearish" | "neutral" | null {
  const u = s.trim().toLowerCase();
  if (u === "bullish") return "bullish";
  if (u === "bearish") return "bearish";
  if (u === "neutral") return "neutral";
  return null;
}

function parseCeoClaudeProfile(raw: string): CeoClaudeProfile | null {
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)```$/im);
  if (fence?.[1]) s = fence[1].trim();
  try {
    const o = JSON.parse(s) as Record<string, unknown>;
    const tenure_start = typeof o.tenure_start === "string" ? o.tenure_start : "";
    const tyRaw = o.tenure_years;
    const tenure_years =
      typeof tyRaw === "number" && !Number.isNaN(tyRaw)
        ? tyRaw
        : typeof tyRaw === "string"
          ? Number.parseFloat(tyRaw) || 0
          : 0;
    let legal_history: string | null = null;
    if (o.legal_history === null) legal_history = null;
    else if (typeof o.legal_history === "string") legal_history = o.legal_history;
    const leg = typeof o.legal_severity === "string" ? o.legal_severity.toLowerCase() : "";
    const legal_severity: CeoClaudeProfile["legal_severity"] =
      leg === "minor" || leg === "significant" || leg === "none" ? leg : "none";
    const sentRaw = typeof o.sentiment === "string" ? o.sentiment.trim().toLowerCase() : "";
    const sentiment: CeoClaudeProfile["sentiment"] =
      sentRaw === "bullish" ? "Bullish" : sentRaw === "bearish" ? "Bearish" : "Neutral";
    const sentiment_reason = typeof o.sentiment_reason === "string" ? o.sentiment_reason : "";
    const spRaw = o.stock_since_tenure_percent_approx;
    let stock_since_tenure_percent_approx: number | null = null;
    if (spRaw === null) stock_since_tenure_percent_approx = null;
    else if (typeof spRaw === "number" && Number.isFinite(spRaw)) stock_since_tenure_percent_approx = spRaw;
    else if (typeof spRaw === "string") {
      const n = Number.parseFloat(spRaw);
      stock_since_tenure_percent_approx = Number.isFinite(n) ? n : null;
    }
    const stock_since_tenure_summary =
      typeof o.stock_since_tenure_summary === "string" ? o.stock_since_tenure_summary.trim() : "";
    return {
      tenure_start,
      tenure_years,
      legal_history,
      legal_severity,
      sentiment,
      sentiment_reason,
      stock_since_tenure_percent_approx,
      stock_since_tenure_summary,
    };
  } catch {
    return null;
  }
}

function claudeSentimentStyles(sentiment: CeoClaudeProfile["sentiment"]) {
  switch (sentiment) {
    case "Bullish":
      return { color: "#00ff88", bg: "#00ff8822", border: "#00ff8855" };
    case "Bearish":
      return { color: "#ff4444", bg: "#ff444422", border: "#ff444455" };
    default:
      return { color: "#60A5FA", bg: "#60A5FA22", border: "#60A5FA55" };
  }
}

function PanelFieldSkeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-white/10 ${className ?? "h-4 w-full"}`} />;
}

function CEOGraph({
  graphData,
  selectedId,
  compareIds,
  dimmedIds,
  highlightSector,
  hoveredNodeId,
  chartLocked,
  claudeTintByTicker,
  onNodeHover,
  onNodeClick,
  onNodeRightClick,
  onCameraChange,
  graphRef,
}: {
  graphData: { nodes: ConstellationNode[]; links: { source: string; target: string }[] };
  selectedId: string | null;
  compareIds: Set<string>;
  dimmedIds: Set<string>;
  highlightSector: string | null;
  hoveredNodeId: string | null;
  chartLocked: boolean;
  claudeTintByTicker: Record<string, "bullish" | "bearish" | "neutral">;
  onNodeHover: (node: CEOEntry | null) => void;
  onNodeClick: (node: CEOEntry) => void;
  onNodeRightClick: (node: CEOEntry) => void;
  onCameraChange?: (k: number, x: number, y: number) => void;
  graphRef: React.RefObject<{
    zoomToFit: (a?: number, b?: number, c?: (n: unknown) => boolean) => void;
    zoom: (n: number, ms?: number) => void;
    centerAt: (x?: number, y?: number, ms?: number) => void;
    graph2ScreenCoords: (x: number, y: number) => { x: number; y: number };
  } | null>;
}) {
  const [ForceGraph2D, setForceGraph2D] = useState<React.ComponentType<Record<string, unknown>> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  const connectedToHover = useMemo(() => {
    if (!hoveredNodeId) return new Set<string>();
    const set = new Set<string>();
    graphData.links.forEach((l) => {
      if (l.source === hoveredNodeId || (typeof l.source === "object" && (l.source as { id?: string }).id === hoveredNodeId)) set.add(typeof l.target === "string" ? l.target : (l.target as { id?: string }).id ?? "");
      if (l.target === hoveredNodeId || (typeof l.target === "object" && (l.target as { id?: string }).id === hoveredNodeId)) set.add(typeof l.source === "string" ? l.source : (l.source as { id?: string }).id ?? "");
    });
    return set;
  }, [hoveredNodeId, graphData.links]);

  useEffect(() => {
    import("react-force-graph-2d").then((mod) => setForceGraph2D(() => mod.default));
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0]?.contentRect ?? { width: 800, height: 600 };
      setSize({ w: width, h: height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const [hoverTooltip, setHoverTooltip] = useState<{ ceo: CEOEntry; x: number; y: number } | null>(null);
  const hoverTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverTooltipNodeIdRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (hoverTooltipTimerRef.current) clearTimeout(hoverTooltipTimerRef.current);
    };
  }, []);

  const resolveNodeColor = useCallback(
    (n: ConstellationNode) => {
      const t = (n.ticker ?? "").toUpperCase();
      const tint = claudeTintByTicker[t];
      if (tint === "bullish") return "#00ff88";
      if (tint === "bearish") return "#ff4444";
      return NODE_COLORS[n.sentiment as string] ?? NODE_COLORS.neutral;
    },
    [claudeTintByTicker]
  );

  const onRenderFramePre = useCallback((ctx: CanvasRenderingContext2D) => {
    const cx = CANVAS_W / 2;
    const cy = CANVAS_H / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(CANVAS_W, CANVAS_H) * 0.6);
    grad.addColorStop(0, "#0D1B3E");
    grad.addColorStop(1, "#050B1A");
    ctx.fillStyle = grad;
    ctx.fillRect(-500, -500, CANVAS_W + 1000, CANVAS_H + 1000);
  }, []);

  const nodeCanvasObject = useCallback(
    (node: ConstellationNode | undefined, ctx: CanvasRenderingContext2D, globalScale: number) => {
      if (!node) return;
      const n = node as ConstellationNode & { x?: number; y?: number };
      const px = n.x ?? n.fx;
      const py = n.y ?? n.fy;
      if (px == null || py == null) return;
      const circleR = Math.max(node.val, 14);
      const isDimmed = dimmedIds.has(node.id) || (hoveredNodeId && hoveredNodeId !== node.id && !connectedToHover.has(node.id));
      const selected = selectedId === node.id || compareIds.has(node.id);

      const nodeAlpha = isDimmed && hoveredNodeId ? 0.35 : highlightSector && node.sector !== highlightSector ? 0.5 : 1;

      // Canvas labels: fade in based on zoom to prevent crowding.
      const fadeStart = 0.6;
      const fadeEnd = 1.0;
      const fade = Math.max(0, Math.min(1, (globalScale - fadeStart) / (fadeEnd - fadeStart)));
      const tierGate = node.tier === 1 ? 0 : node.tier === 2 ? 0.15 : node.tier === 3 ? 0.3 : 0.55;
      const labelAlphaBase = Math.max(0, (fade - tierGate) / (1 - tierGate));

      const zoomTextScale = Math.max(0.85, Math.min(1.2, globalScale));

      let tickerText = (node.ticker ?? "").toUpperCase();
      let lastName = getLastName(node.name);

      const showSecondLine = node.tier <= 3;
      if (!showSecondLine) {
        // Tiny nodes: ticker only (truncate long tickers)
        if (tickerText.length > 5) tickerText = tickerText.slice(0, 3);
      } else {
        // Large/medium/small nodes: ticker + last name
        if (tickerText.length > 6) tickerText = tickerText.slice(0, 5);
        if (lastName.length > 10) lastName = lastName.slice(0, 9) + "…";
      }

      const { tickerFontSize, nameFontSize } = (() => {
        if (node.tier === 1) return { tickerFontSize: 11 * zoomTextScale, nameFontSize: 9 * zoomTextScale };
        if (node.tier === 2) return { tickerFontSize: 9 * zoomTextScale, nameFontSize: 8 * zoomTextScale };
        if (node.tier === 3) return { tickerFontSize: 8 * zoomTextScale, nameFontSize: 7 * zoomTextScale };
        return { tickerFontSize: 7 * zoomTextScale, nameFontSize: 0 };
      })();

      ctx.save();
      ctx.globalAlpha = nodeAlpha;

      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px, py, circleR + 1, 0, 2 * Math.PI);
      ctx.stroke();

      if (node.recentAlert) {
        ctx.strokeStyle = "rgba(239, 68, 68, 0.85)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      if (selected) {
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Draw text labels (ticker + last name) when enabled.
      if (labelAlphaBase > 0) {
        const finalAlpha = nodeAlpha * labelAlphaBase;
        if (finalAlpha > 0) {
          ctx.globalAlpha = finalAlpha;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "#fff";
          ctx.font = `800 ${tickerFontSize}px system-ui, sans-serif`;

          const gap = Math.max(1, tickerFontSize * 0.15);

          if (showSecondLine && nameFontSize > 0) {
            const y1 = py - (nameFontSize / 2 + gap / 2);
            const y2 = py + (tickerFontSize / 2 + gap / 2);
            ctx.fillText(tickerText, px, y1);
            ctx.fillStyle = "#A1A1AA";
            ctx.font = `400 ${nameFontSize}px system-ui, sans-serif`;
            ctx.fillText(lastName, px, y2);
          } else {
            ctx.fillText(tickerText, px, py);
          }
        }
      }
      ctx.restore();
    },
    [selectedId, compareIds, dimmedIds, highlightSector, hoveredNodeId, connectedToHover]
  );

  const linkCanvasObject = useCallback(
    (link: { source: { id?: string; x?: number; y?: number; fx?: number; fy?: number }; target: { id?: string; x?: number; y?: number; fx?: number; fy?: number } }, ctx: CanvasRenderingContext2D) => {
      const src = link.source as { id?: string; x?: number; y?: number; fx?: number; fy?: number };
      const tgt = link.target as { id?: string; x?: number; y?: number; fx?: number; fy?: number };
      const sx = src?.x ?? src?.fx;
      const sy = src?.y ?? src?.fy;
      const tx = tgt?.x ?? tgt?.fx;
      const ty = tgt?.y ?? tgt?.fy;
      if (sx == null || sy == null || tx == null || ty == null) return;
      const sid = src?.id ?? (link.source as unknown as string);
      const tid = tgt?.id ?? (link.target as unknown as string);
      const connectedToHighlight =
        (hoveredNodeId && (sid === hoveredNodeId || tid === hoveredNodeId)) ||
        (selectedId && (sid === selectedId || tid === selectedId)) ||
        compareIds.has(sid) ||
        compareIds.has(tid);
      ctx.save();
      ctx.strokeStyle = connectedToHighlight ? LINK_HOVER : LINK_COLOR;
      ctx.lineWidth = connectedToHighlight ? 1.4 : 0.8;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.restore();
    },
    [hoveredNodeId, selectedId, compareIds]
  );

  // Initial camera is applied by parent (CEOsPage) so saved position can be restored

  if (!ForceGraph2D) {
    return (
      <div ref={containerRef} className="flex h-full w-full items-center justify-center" style={{ background: "radial-gradient(ellipse at center, #0D1B3E 0%, #050B1A 100%)" }}>
        <p className="text-zinc-400">Loading graph…</p>
      </div>
    );
  }
  if (!graphData.nodes.length) {
    return (
      <div ref={containerRef} className="flex h-full w-full items-center justify-center" style={{ background: "radial-gradient(ellipse at center, #0D1B3E 0%, #050B1A 100%)" }}>
        <p className="text-zinc-400">No CEOs match the current filter</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      style={{ background: "#050B1A" }}
      onWheel={(e) => e.stopPropagation()}
    >
      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        nodeId="id"
        linkSource="source"
        linkTarget="target"
        // Disable react-force-graph's built-in tooltip content.
        // We render our own richer hover overlay above.
        nodeLabel={() => ""}
        linkLabel={() => ""}
        nodeVal={(n: ConstellationNode) => Math.max(n.val, 14)}
        nodeColor={resolveNodeColor}
        linkColor={() => LINK_COLOR}
        linkWidth={0.8}
        backgroundColor="transparent"
        width={size.w}
        height={size.h}
        nodeCanvasObjectMode="after"
        nodeCanvasObject={nodeCanvasObject}
        linkCanvasObjectMode="after"
        linkCanvasObject={linkCanvasObject}
        onRenderFramePre={onRenderFramePre}
        onNodeClick={(n: { id?: string; x?: number; y?: number }, event?: MouseEvent) => {
          const ceo = graphData.nodes.find((x) => x.id === n?.id);
          if (event?.detail === 2 && n?.x != null && n?.y != null && graphRef.current) {
            graphRef.current.centerAt(n.x, n.y, 400);
            graphRef.current.zoom(2, 400);
          }
          if (ceo) onNodeClick(ceo);
        }}
        onNodeRightClick={(n: { id?: string }) => {
          const ceo = graphData.nodes.find((x) => x.id === n?.id);
          if (ceo) onNodeRightClick(ceo);
        }}
        onNodeHover={(n: { id?: string; x?: number; y?: number; fx?: number; fy?: number } | null) => {
          if (hoverTooltipTimerRef.current) clearTimeout(hoverTooltipTimerRef.current);

          const ceo = n ? graphData.nodes.find((x) => x.id === n.id) ?? null : null;
          onNodeHover(ceo ?? null);

          if (!ceo || !n) {
            hoverTooltipNodeIdRef.current = null;
            setHoverTooltip(null);
            return;
          }

          const nodeX = n.x ?? n.fx;
          const nodeY = n.y ?? n.fy;
          if (nodeX == null || nodeY == null) return;

          const thisId = ceo.id;
          hoverTooltipNodeIdRef.current = thisId;
          hoverTooltipTimerRef.current = setTimeout(() => {
            if (hoverTooltipNodeIdRef.current !== thisId) return;
            if (!graphRef.current) return;
            const sc = graphRef.current.graph2ScreenCoords(nodeX, nodeY);
            setHoverTooltip({ ceo, x: sc.x, y: sc.y });
          }, 100);
        }}
        onZoomEnd={onCameraChange ? (t: { k: number; x: number; y: number }) => onCameraChange(t.k, t.x, t.y) : undefined}
        autoPauseRedraw={true}
        enableNodeDrag={false}
        enableZoomInteraction={!chartLocked}
        enablePanInteraction={!chartLocked}
        warmupTicks={10}
        d3AlphaDecay={0}
        d3AlphaMin={0}
        minZoom={0.28}
        maxZoom={4}
      />

      {hoverTooltip && (
        <div
          className="pointer-events-none absolute z-50 max-w-[260px] rounded-lg border border-white/10 bg-[#0F1520]/95 px-3 py-2 shadow-xl backdrop-blur"
          style={{
            left: hoverTooltip.x,
            top: hoverTooltip.y,
            transform: "translate(-50%, -105%)",
          }}
        >
          {(() => {
            const c = hoverTooltip.ceo;
            const t = (c.ticker ?? "").toUpperCase();
            const synthetic = isSyntheticMapTicker(t);
            const sent = sentimentColor(c.sentiment);
            const presetLabel = t.startsWith("SPY500_") || t.startsWith("SPY500_FILL_")
              ? "S&P 500 grid"
              : t.startsWith("QQQ100_FILL_")
                ? "Nasdaq 100 grid"
                : t.startsWith("DOW30_FILL_")
                  ? "Dow 30 grid"
                  : null;
            return (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 text-[13px] font-bold leading-tight text-zinc-100">{c.name}</div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: sent + "22",
                      color: sent,
                      border: `1px solid ${sent}55`,
                    }}
                  >
                    {c.sentiment === "positive" ? "Positive" : c.sentiment === "negative" ? "Negative" : "Neutral"}
                  </span>
                </div>
                {!synthetic ? (
                  <div className="mt-1 text-[11px] font-medium text-zinc-300">{t}</div>
                ) : presetLabel ? (
                  <div className="mt-1 text-[10px] text-zinc-500">{presetLabel}</div>
                ) : null}
                <div className="mt-0.5 text-[11px] text-zinc-400">{c.company}</div>
                {c.interimNames?.length ? (
                  <div className="mt-1 text-[10px] text-amber-200">Interim: {c.interimNames[0]}</div>
                ) : null}
                {c.coCeoNames?.length ? (
                  <div className="text-[10px] text-violet-200">Co-CEOs</div>
                ) : null}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function FilterPanel({
  filters,
  onFiltersChange,
  alertsCount,
  ceoOfWeek,
  recentAlerts,
  ceoOfWeekAlertTitle,
  weeklyAlerts,
  activeQuickPreset,
  onQuickPresetChange,
  presetShownCount,
  allViewLabel,
  activePresetShowLabel,
  onSelectTicker,
  collapsed,
  onToggleCollapse,
}: {
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
  alertsCount: number;
  ceoOfWeek: CEOEntry | null;
  recentAlerts: CEOAlertItem[];
  ceoOfWeekAlertTitle?: string | null;
  weeklyAlerts: CEOAlertItem[];
  activeQuickPreset: QuickPresetId | null;
  onQuickPresetChange: (id: QuickPresetId | null) => void;
  presetShownCount: number;
  allViewLabel: string;
  activePresetShowLabel: string | null;
  onSelectTicker: (ticker: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    const id = window.setTimeout(() => setNowMs(Date.now()), 0);
    const t = window.setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => {
      window.clearTimeout(id);
      window.clearInterval(t);
    };
  }, []);

  const timeAgo = (iso: string) => {
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return "";
    if (!nowMs) return "";
    const s = Math.max(0, Math.floor((nowMs - ts) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  };

  return (
    <div
      className="absolute left-0 top-0 z-20 flex h-full min-w-[48px] shrink-0 flex-col rounded-r-lg border-r border-white/10 shadow-xl transition-all duration-200"
      style={{
        width: collapsed ? 48 : 220,
        backgroundColor: collapsed ? "#0F1520" : "rgba(15, 21, 32, 0.96)",
        backdropFilter: collapsed ? "none" : "blur(8px)",
      }}
    >
      <button
        type="button"
        onClick={onToggleCollapse}
        className="absolute right-1 top-2 z-30 rounded p-2 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
        aria-label={collapsed ? "Expand panel" : "Collapse panel"}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {collapsed ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />}
        </svg>
      </button>
      {!collapsed && (
        <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-4 p-4 pt-12">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Quick Filter</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onQuickPresetChange(null)}
                className={`rounded-full border px-3 py-1.5 text-[11px] transition ${
                  activeQuickPreset === null
                    ? "border-[var(--accent-color)] bg-[var(--accent-color)]/15 text-[var(--accent-color)]"
                    : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:bg-white/10 hover:text-zinc-200"
                }`}
              >
                {allViewLabel}
              </button>
              {(
                [
                  "spy500",
                  "qqq100",
                  "dow30",
                  "techGiants",
                  "magnificent7",
                ] as QuickPresetId[]
              ).map((id) => {
                const btnLabel = QUICK_PRESET_BUTTON_LABEL[id];
                const isActive = activeQuickPreset === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onQuickPresetChange(isActive ? null : id)}
                    className={`rounded-full border px-3 py-1.5 text-[11px] transition ${
                      isActive
                        ? "border-[var(--accent-color)] bg-[var(--accent-color)]/15 text-[var(--accent-color)]"
                        : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:bg-white/10 hover:text-zinc-200"
                    }`}
                  >
                    {btnLabel}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] text-zinc-500">
              Showing {presetShownCount} CEOs in {activeQuickPreset ? activePresetShowLabel : allViewLabel}
            </p>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Sector</span>
              <div className="flex gap-1">
                <button type="button" onClick={() => onFiltersChange({ ...filters, sectors: new Set(CEO_SECTORS) })} className="text-[10px] text-[var(--accent-color)] hover:underline">All</button>
                <button type="button" onClick={() => onFiltersChange({ ...filters, sectors: new Set() })} className="text-[10px] text-zinc-500 hover:underline">Clear</button>
              </div>
            </div>
            <div className="space-y-1.5">
              {CEO_SECTORS.map((s) => (
                <label key={s} className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={filters.sectors.has(s)}
                    onChange={() => {
                      const next = new Set(filters.sectors);
                      if (next.has(s)) next.delete(s);
                      else next.add(s);
                      onFiltersChange({ ...filters, sectors: next });
                    }}
                    className="rounded border-white/20 text-[var(--accent-color)]"
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-zinc-400">Sentiment</span>
            <select
              value={filters.sentiment}
              onChange={(e) => onFiltersChange({ ...filters, sentiment: e.target.value as FilterState["sentiment"] })}
              className="w-full rounded-lg border border-white/10 bg-[#0F1520] px-3 py-2 text-sm text-zinc-200 focus:border-[var(--accent-color)] focus:outline-none [&>option]:bg-[#0F1520] [&>option]:text-zinc-200"
            >
              <option value="all">All</option>
              <option value="positive">Positive only</option>
              <option value="negative">Negative only</option>
              <option value="alerts">Recent alerts only</option>
            </select>
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-zinc-400">Tenure</span>
            <select
              value={filters.tenure}
              onChange={(e) => onFiltersChange({ ...filters, tenure: e.target.value as FilterState["tenure"] })}
              className="w-full rounded-lg border border-white/10 bg-[#0F1520] px-3 py-2 text-sm text-zinc-200 focus:border-[var(--accent-color)] focus:outline-none [&>option]:bg-[#0F1520] [&>option]:text-zinc-200"
            >
              <option value="all">All</option>
              <option value="new">New (&lt; 2 years)</option>
              <option value="established">Established (2–10 years)</option>
              <option value="veteran">Veteran (10+ years)</option>
            </select>
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-zinc-400">Market cap</span>
            <select
              value={filters.marketCap}
              onChange={(e) => onFiltersChange({ ...filters, marketCap: e.target.value as FilterState["marketCap"] })}
              className="w-full rounded-lg border border-white/10 bg-[#0F1520] px-3 py-2 text-sm text-zinc-200 focus:border-[var(--accent-color)] focus:outline-none [&>option]:bg-[#0F1520] [&>option]:text-zinc-200"
            >
              <option value="all">All</option>
              <option value="mega">Mega cap (&gt;500B)</option>
              <option value="large">Large cap (100–500B)</option>
              <option value="mid">Mid cap (&lt;100B)</option>
            </select>
          </div>
          {ceoOfWeek && (
            <div className="rounded-lg border border-[var(--accent-color)]/30 bg-white/5 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--accent-color)]">CEO of the week</p>
              <p className="mt-1 font-semibold text-zinc-100">{ceoOfWeek.name}</p>
              <p className="text-xs text-zinc-400">{ceoOfWeek.company} ({ceoOfWeek.ticker})</p>
              <p className="mt-1 text-[10px] text-zinc-500">{ceoOfWeekAlertTitle ?? "Most talked about this week"}</p>
              <button type="button" onClick={() => onSelectTicker(ceoOfWeek.ticker)} className="mt-2 text-xs text-[var(--accent-color)] hover:underline">View on graph →</button>
            </div>
          )}
          <div className="border-t border-white/10 pt-3">
            <p className="mb-2 text-xs font-medium text-zinc-400">Recent alerts</p>
            {recentAlerts.length === 0 ? (
              <p className="text-xs text-zinc-500">No recent CEO changes</p>
            ) : (
              <ul className="space-y-2">
                {recentAlerts.slice(0, 5).map((a) => {
                  const t = (a.matchedTicker ?? "").toUpperCase();
                  return (
                    <li key={a.url}>
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-md px-2 py-1 hover:bg-white/5"
                        onClick={(e) => {
                          if (t) {
                            e.preventDefault();
                            onSelectTicker(t);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-zinc-200">{a.company ?? "Company"}</span>
                              {t ? <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-300">{t}</span> : null}
                            </div>
                            <div className="mt-0.5 line-clamp-2 text-xs text-zinc-300">{a.title}</div>
                          </div>
                        </div>
                        <div className="mt-1 text-[10px] text-zinc-500">{a.source} · {timeAgo(a.publishedAt)}</div>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="border-t border-white/10 pt-3">
            <p className="mb-2 text-xs font-medium text-zinc-400">Weekly CEO changes</p>
            {weeklyAlerts.length === 0 ? (
              <p className="text-xs text-zinc-500">No CEO change headlines this week</p>
            ) : (
              <ul className="space-y-2">
                {weeklyAlerts.slice(0, 10).map((a) => {
                  const t = (a.matchedTicker ?? "").toUpperCase();
                  return (
                    <li key={a.url}>
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-md px-2 py-1 hover:bg-white/5"
                        onClick={(e) => {
                          if (t) {
                            e.preventDefault();
                            onSelectTicker(t);
                          }
                        }}
                        title={a.title}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-zinc-200">{a.company ?? "Company"}</span>
                          {t ? <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-300">{t}</span> : null}
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-xs text-zinc-300">{a.title.length > 80 ? a.title.slice(0, 80) + "…" : a.title}</div>
                        <div className="mt-1 text-[10px] text-zinc-500">{a.source} · {timeAgo(a.publishedAt)}</div>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailPanel({
  ceo,
  onClose,
  alertsCount,
  profileCacheRef,
  onClaudeGraphSentiment,
}: {
  ceo: CEOEntry;
  onClose: () => void;
  alertsCount: number;
  profileCacheRef: React.MutableRefObject<Map<string, CeoClaudeProfile>>;
  onClaudeGraphSentiment: (ticker: string, tint: "bullish" | "bearish" | "neutral") => void;
}) {
  const [news, setNews] = useState<{ title: string; url: string; source: string; publishedAt: string; sentiment: string }[]>([]);
  const [newsOverallSentiment, setNewsOverallSentiment] = useState<"positive" | "neutral" | "negative" | null>(null);
  const [legal, setLegal] = useState<{ date: string; headline: string; url: string; source: string; active: boolean }[]>([]);
  const [quote, setQuote] = useState<{ price: number } | null>(null);
  const [stockSince, setStockSince] = useState<{ ok: boolean; percentChange?: number; startYear?: number } | null>(null);
  const [assessment, setAssessment] = useState<{ leadershipScore: number; scoreLabel: string; summary: string; strengths: string[]; watchPoints: string[]; longTermOutlook: string; investorVerdict: string } | null>(null);
  const [assessLoading, setAssessLoading] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [claudeProfile, setClaudeProfile] = useState<CeoClaudeProfile | null>(null);
  const [claudeProfileLoading, setClaudeProfileLoading] = useState(false);
  const tenureYears = new Date().getFullYear() - ceo.tenureStart;
  const slotSynthetic = isSyntheticMapTicker(ceo.ticker);

  useEffect(() => {
    const t = ceo.ticker.toUpperCase();
    if (slotSynthetic) {
      setClaudeProfile(null);
      setClaudeProfileLoading(false);
      return;
    }
    const ck = ceoProfileCacheKey(ceo.ticker);
    const cached = profileCacheRef.current.get(ck);
    if (cached) {
      setClaudeProfile(cached);
      setClaudeProfileLoading(false);
      const tint = mapClaudeSentimentToTint(cached.sentiment);
      if (tint) onClaudeGraphSentiment(t, tint);
      return;
    }
    setClaudeProfile(null);
    setClaudeProfileLoading(true);
    let cancelled = false;
    const prompt = `Return ONLY valid JSON, no markdown, no explanation:
{
  "tenure_start": "Month Year",
  "tenure_years": number,
  "legal_history": "string describing any significant legal issues, or null if none",
  "legal_severity": "none" | "minor" | "significant",
  "sentiment": "Bullish" | "Bearish" | "Neutral",
  "sentiment_reason": "one sentence max",
  "stock_since_tenure_percent_approx": number | null,
  "stock_since_tenure_summary": "one concise sentence: approximate total shareholder return (price appreciation + dividends) from roughly the start of this CEO's tenure to now for the given exchange-listed ticker, or null/empty if you cannot estimate"
}

CEO: ${ceo.name}
Company: ${ceo.company}
Ticker: ${ceo.ticker}`;

    void (async () => {
      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
        });
        const data = (await res.json()) as { content?: string };
        if (!res.ok || cancelled) return;
        const parsed = data.content ? parseCeoClaudeProfile(data.content) : null;
        if (cancelled || !parsed) return;
        profileCacheRef.current.set(ck, parsed);
        setClaudeProfile(parsed);
        const tint = mapClaudeSentimentToTint(parsed.sentiment);
        if (tint) onClaudeGraphSentiment(t, tint);
      } catch {
        // keep fallbacks in UI
      } finally {
        if (!cancelled) setClaudeProfileLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ceo.ticker, ceo.name, ceo.company, slotSynthetic, profileCacheRef, onClaudeGraphSentiment]);

  useEffect(() => {
    fetch(`/api/ceo-news?name=${encodeURIComponent(ceo.name)}&company=${encodeURIComponent(ceo.company)}`)
      .then((r) => r.json())
      .then((d) => {
        setNews(d?.articles ?? []);
        setNewsOverallSentiment(d?.overallSentiment ?? null);
      })
      .catch(() => {
        setNews([]);
        setNewsOverallSentiment(null);
      });
  }, [ceo.id, ceo.name, ceo.company]);

  useEffect(() => {
    if (slotSynthetic) {
      setStockSince(null);
      return;
    }
    setStockSince(null);
    fetch(`/api/ceo-stock-performance?ticker=${encodeURIComponent(ceo.ticker)}&tenureStartYear=${encodeURIComponent(String(ceo.tenureStart))}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) setStockSince({ ok: true, percentChange: d.percentChange, startYear: d.startYear });
        else setStockSince({ ok: false });
      })
      .catch(() => setStockSince({ ok: false }));
  }, [ceo.ticker, ceo.tenureStart, slotSynthetic]);

  useEffect(() => {
    fetch(`/api/ceo-legal?name=${encodeURIComponent(ceo.name)}`)
      .then((r) => r.json())
      .then((d) => setLegal(d?.items ?? []))
      .catch(() => setLegal([]));
  }, [ceo.id, ceo.name]);

  useEffect(() => {
    if (slotSynthetic) {
      setQuote(null);
      return;
    }
    fetch(`/api/ticker-quote?ticker=${encodeURIComponent(ceo.ticker)}`)
      .then((r) => r.json())
      .then((d) => {
        const p = d?.price;
        const price = typeof p === "number" && Number.isFinite(p) && p > 0 ? p : null;
        setQuote(price != null ? { price } : null);
      })
      .catch(() => setQuote(null));
  }, [ceo.ticker, slotSynthetic]);

  useEffect(() => {
    let mounted = true;
    fetchWatchlist().then((list) => {
      if (mounted) setInWatchlist(isTickerInWatchlist(list, ceo.ticker));
    });
    return () => { mounted = false; };
  }, [ceo.ticker]);

  // When CEO changes, clear assessment then load cached one for this CEO so we never show another CEO's assessment
  useEffect(() => {
    setAssessment(null);
    const cacheKey = `ceo-assess-${ceo.id}`;
    if (typeof localStorage === "undefined") return;
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return;
    try {
      const parsed = JSON.parse(cached) as { _ts?: number; leadershipScore?: number; scoreLabel?: string; summary?: string; strengths?: string[]; watchPoints?: string[]; longTermOutlook?: string; investorVerdict?: string };
      if (Date.now() - (parsed._ts ?? 0) < 24 * 60 * 60 * 1000 && parsed.leadershipScore != null && parsed.summary != null) {
        const { _ts, ...rest } = parsed;
        setAssessment({
          leadershipScore: rest.leadershipScore ?? 0,
          scoreLabel: rest.scoreLabel ?? "",
          summary: rest.summary ?? "",
          strengths: Array.isArray(rest.strengths) ? rest.strengths : [],
          watchPoints: Array.isArray(rest.watchPoints) ? rest.watchPoints : [],
          longTermOutlook: rest.longTermOutlook ?? "",
          investorVerdict: rest.investorVerdict ?? "",
        });
      }
    } catch {
      // ignore invalid cache
    }
  }, [ceo.id]);

  const handleWatchlist = async () => {
    setWatchlistLoading(true);
    try {
      if (inWatchlist) {
        await removeFromWatchlistApi(ceo.ticker);
        setInWatchlist(false);
      } else {
        await addToWatchlistApi({ ticker: ceo.ticker, name: ceo.company });
        setInWatchlist(true);
      }
    } finally {
      setWatchlistLoading(false);
    }
  };

  const runAssessment = async () => {
    setAssessLoading(true);
    const cacheKey = `ceo-assess-${ceo.id}`;
    try {
      const cached = typeof localStorage !== "undefined" ? localStorage.getItem(cacheKey) : null;
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - (parsed._ts ?? 0) < 24 * 60 * 60 * 1000) {
          delete parsed._ts;
          setAssessment(parsed);
          setAssessLoading(false);
          return;
        }
      }
      const res = await fetch("/api/ceo-assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: ceo.name,
          company: ceo.company,
          ticker: ceo.ticker,
          tenureYears,
          headlines: news.map((a) => a.title),
        }),
      });
      if (!res.ok) throw new Error("Assessment failed");
      const data = await res.json();
      setAssessment(data);
      if (typeof localStorage !== "undefined") localStorage.setItem(cacheKey, JSON.stringify({ ...data, _ts: Date.now() }));
    } catch {
      setAssessment(null);
    }
    setAssessLoading(false);
  };

  const shownSentiment = newsOverallSentiment ?? ceo.sentiment;
  const fallbackSentimentColor = sentimentColor(shownSentiment);
  const avatarColor = claudeProfile ? claudeSentimentStyles(claudeProfile.sentiment).color : fallbackSentimentColor;
  return (
    <div className="flex h-full w-full flex-col overflow-hidden border-l border-white/10 bg-[#0F1520]/98 shadow-2xl backdrop-blur-sm">
      <div className="flex shrink-0 items-start justify-between border-b border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white" style={{ backgroundColor: avatarColor }}>
            {getInitials(ceo.name)}
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-100">{ceo.name}</h2>
            <p className="text-sm text-zinc-400">{ceo.company}</p>
            <span className="mt-1 inline-block rounded bg-white/10 px-2 py-0.5 text-xs font-medium text-zinc-300">{ceo.ticker}</span>
            <span className="ml-1 inline-block rounded bg-white/5 px-2 py-0.5 text-[10px] text-zinc-500">{ceo.sector}</span>
            {ceo.interimNames?.length ? (
              <span className="ml-1 inline-block rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-200" title="Interim leadership">
                Interim: {ceo.interimNames[0]}
              </span>
            ) : null}
            {ceo.coCeoNames?.length ? (
              <span className="ml-1 inline-block rounded bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-200" title="Co-CEO leadership">
                Co-CEOs
              </span>
            ) : null}
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-300" aria-label="Close">×</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {claudeProfileLoading && !claudeProfile ? (
          <PanelFieldSkeleton className="h-4 w-52" />
        ) : claudeProfile ? (
          <p className="text-sm text-zinc-400">
            CEO since {claudeProfile.tenure_start} · {claudeProfile.tenure_years} years
          </p>
        ) : (
          <p className="text-sm text-zinc-400">CEO since {ceo.tenureStart} · {tenureYears} years</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-400">Sentiment:</span>
          {claudeProfileLoading && !claudeProfile ? (
            <PanelFieldSkeleton className="h-5 w-28" />
          ) : claudeProfile ? (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: claudeSentimentStyles(claudeProfile.sentiment).bg,
                color: claudeSentimentStyles(claudeProfile.sentiment).color,
                border: `1px solid ${claudeSentimentStyles(claudeProfile.sentiment).border}`,
              }}
              title={claudeProfile.sentiment_reason || undefined}
            >
              {claudeProfile.sentiment}
            </span>
          ) : (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: fallbackSentimentColor + "22",
                color: fallbackSentimentColor,
                border: `1px solid ${fallbackSentimentColor}55`,
              }}
            >
              {shownSentiment === "positive" ? "Positive" : shownSentiment === "negative" ? "Negative" : "Neutral"}
            </span>
          )}
        </div>
        {ceo.recentAlert && alertsCount > 0 && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">
            <strong>Leadership change detected</strong>
            <p className="mt-1 text-xs text-red-200/80">See recent news for details.</p>
          </div>
        )}
        {slotSynthetic ? (
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-zinc-500">Stock</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              Placeholder tickers such as <span className="font-mono text-zinc-300">{ceo.ticker}</span> are not listed symbols, so quotes and Finnhub history stay empty. When the index ticker list loads, real symbols replace these slots. This is usually{" "}
              <span className="text-zinc-300">not</span> a rate limit.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-zinc-500">Stock</p>
            {quote != null ? (
              <p className="text-lg font-semibold text-zinc-100">
                ${quote.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            ) : (
              <p className="text-sm text-zinc-500">Live price unavailable</p>
            )}
            {claudeProfileLoading && !claudeProfile ? (
              <PanelFieldSkeleton className="mt-2 h-3.5 w-full max-w-[240px]" />
            ) : claudeProfile?.stock_since_tenure_summary ? (
              <p className="mt-2 text-xs leading-snug text-zinc-400">
                <span className="font-medium text-zinc-500">Since tenure (AI est.): </span>
                {claudeProfile.stock_since_tenure_summary}
                {typeof claudeProfile.stock_since_tenure_percent_approx === "number" &&
                Number.isFinite(claudeProfile.stock_since_tenure_percent_approx) ? (
                  <span
                    className={
                      claudeProfile.stock_since_tenure_percent_approx >= 0 ? "text-emerald-400" : "text-red-400"
                    }
                  >
                    {" "}
                    (
                    {claudeProfile.stock_since_tenure_percent_approx >= 0 ? "+" : ""}
                    {claudeProfile.stock_since_tenure_percent_approx.toFixed(1)}%)
                  </span>
                ) : null}
              </p>
            ) : claudeProfile != null &&
              claudeProfile.stock_since_tenure_percent_approx != null &&
              Number.isFinite(claudeProfile.stock_since_tenure_percent_approx) ? (
              <p className="mt-2 text-xs text-zinc-400">
                <span className="font-medium text-zinc-500">Since tenure (AI est.): </span>
                <span
                  className={
                    claudeProfile.stock_since_tenure_percent_approx >= 0 ? "text-emerald-400" : "text-red-400"
                  }
                >
                  {claudeProfile.stock_since_tenure_percent_approx >= 0 ? "+" : ""}
                  {claudeProfile.stock_since_tenure_percent_approx.toFixed(1)}%
                </span>
              </p>
            ) : stockSince?.ok ? (
              <p className="mt-2 text-xs text-zinc-500">
                Stock since {ceo.name} took over ({stockSince.startYear}):{" "}
                <span className={(stockSince.percentChange ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {(stockSince.percentChange ?? 0) >= 0 ? "+" : ""}
                  {(stockSince.percentChange ?? 0).toFixed(2)}%
                </span>
              </p>
            ) : stockSince?.ok === false ? (
              <p className="mt-2 text-xs text-zinc-500">Historical performance unavailable from data provider.</p>
            ) : (
              <p className="mt-2 text-xs text-zinc-500">Loading performance…</p>
            )}
          </div>
        )}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-200">Recent news</h3>
          {news.length === 0 ? <p className="text-xs text-zinc-500">No recent articles</p> : (
            <ul className="space-y-2">
              {news.map((a, i) => (
                <li key={i} className="rounded border border-white/5 bg-white/5 p-2">
                  <p className="line-clamp-2 text-xs text-zinc-200">{a.title}</p>
                  <p className="mt-1 text-[10px] text-zinc-500">{a.source} · {new Date(a.publishedAt).toLocaleDateString()}</p>
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[10px] text-[var(--accent-color)] hover:underline">Read full story →</a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-200">Legal history</h3>
          {legal.length > 0 ? (
            <ul className="space-y-2">
              {legal.map((l, i) => (
                <li key={i} className={`rounded border p-2 text-xs ${l.active ? "border-red-500/30 bg-red-500/5 text-red-200" : "border-white/5 bg-white/5 text-zinc-400"}`}>
                  <p className="font-medium">{l.date}</p>
                  <p className="line-clamp-2">{l.headline}</p>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[10px] text-[var(--accent-color)]">Source</a>
                </li>
              ))}
            </ul>
          ) : claudeProfileLoading && !claudeProfile ? (
            <PanelFieldSkeleton className="h-14 w-full" />
          ) : claudeProfile ? (
            <p className={`text-xs ${claudeProfile.legal_severity === "significant" ? "text-red-200/90" : claudeProfile.legal_severity === "minor" ? "text-amber-200/90" : "text-zinc-300"}`}>
              {claudeProfile.legal_history ?? "No significant legal issues reported."}
            </p>
          ) : (
            <p className="text-xs text-emerald-500/90">No significant legal issues found</p>
          )}
        </div>
        <div>
          {assessment ? (
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-sm font-semibold text-zinc-200">AI leadership assessment</p>
              <p className="mt-1 text-xs text-zinc-400">Score: {assessment.leadershipScore}/10 — {assessment.scoreLabel}</p>
              <p className="mt-2 text-xs text-zinc-300">{assessment.summary}</p>
              <p className="mt-2 text-xs font-medium text-zinc-400">Strengths</p>
              <ul className="list-disc pl-4 text-xs text-zinc-400">{assessment.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
              <p className="mt-2 text-xs font-medium text-zinc-400">Watch points</p>
              <ul className="list-disc pl-4 text-xs text-zinc-400">{assessment.watchPoints.map((s, i) => <li key={i}>{s}</li>)}</ul>
              <p className="mt-2 text-xs text-zinc-300">{assessment.investorVerdict}</p>
            </div>
          ) : (
            <button type="button" onClick={runAssessment} disabled={assessLoading} className="w-full rounded-lg bg-[var(--accent-color)] py-2 text-sm font-medium text-[#020308] hover:opacity-90 disabled:opacity-50">Generate AI assessment</button>
          )}
        </div>
        <button type="button" onClick={handleWatchlist} disabled={watchlistLoading} className="w-full rounded-lg border border-white/20 py-2 text-sm font-medium text-zinc-200 hover:bg-white/5 disabled:opacity-50">
          {inWatchlist ? `✓ Watching ${ceo.ticker}` : "Add to watchlist"}
        </button>
      </div>
    </div>
  );
}

function CompareModal({ ceos, onClose }: { ceos: CEOEntry[]; onClose: () => void }) {
  if (ceos.length === 0) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-white/10 bg-[#0F1520] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h3 className="text-lg font-semibold text-zinc-100">Compare CEOs</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-white/10">×</button>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {ceos.map((c) => (
            <div key={c.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="font-semibold text-zinc-100">{c.name}</p>
              <p className="text-xs text-zinc-400">{c.company} ({c.ticker})</p>
              <p className="mt-1 text-[10px] text-zinc-500">Tenure: {new Date().getFullYear() - c.tenureStart} years · Sentiment: {c.sentiment}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-zinc-500">Side-by-side tenure, sentiment, and stock performance. Use detail panel for full data.</p>
      </div>
    </div>
  );
}

export default function CEOsPage() {
  const pathname = usePathname();
  const [filters, setFilters] = useState<FilterState>(() => getCeoFilters() ?? defaultFilters());
  const [selected, setSelected] = useState<CEOEntry | null>(null);
  const [compare, setCompare] = useState<CEOEntry[]>([]);
  const [filterPanelCollapsed, setFilterPanelCollapsed] = useState(() => getCeoPanelPrefs().filterPanelCollapsed);
  const [alertsCount, setAlertsCount] = useState(0);
  const graphRef = useRef<{
    zoomToFit: (a?: number, b?: number, c?: (n: unknown) => boolean) => void;
    zoom: (n: number, ms?: number) => void;
    centerAt: (x?: number, y?: number, ms?: number) => void;
    graph2ScreenCoords: (x: number, y: number) => { x: number; y: number };
  } | null>(null);
  const shiftRef = useRef(false);
  const [highlightSector, setHighlightSector] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [chartLocked, setChartLocked] = useState(false);
  const [showLinesInfo, setShowLinesInfo] = useState(false);
  const [activeQuickPreset, setActiveQuickPreset] = useState<QuickPresetId | null>(null);
  const [ceoAlerts, setCeoAlerts] = useState<CEOAlertItem[]>([]);
  const [weeklyCeoAlerts, setWeeklyCeoAlerts] = useState<CEOAlertItem[]>([]);
  const [spy500Tickers, setSpy500Tickers] = useState<string[] | null>(null);
  const [qqq100Tickers, setQqq100Tickers] = useState<string[] | null>(null);
  const [dow30Tickers, setDow30Tickers] = useState<string[] | null>(null);
  const [detailPanelWidth, setDetailPanelWidth] = useState(() => getCeoPanelPrefs().detailPanelWidth);
  const [detailPanelCollapsed, setDetailPanelCollapsed] = useState(() => getCeoPanelPrefs().detailPanelCollapsed);

  const ceoProfileCacheRef = useRef<Map<string, CeoClaudeProfile>>(new Map());
  const [graphClaudeByTicker, setGraphClaudeByTicker] = useState<Record<string, "bullish" | "bearish" | "neutral">>({});
  const handleClaudeGraphSentiment = useCallback((ticker: string, tint: "bullish" | "bearish" | "neutral") => {
    const key = ticker.toUpperCase();
    setGraphClaudeByTicker((prev) => ({ ...prev, [key]: tint }));
  }, []);

  const CEOS_BY_TICKER = useMemo(() => new Map(CEOS.map((c) => [c.ticker.toUpperCase(), c])), []);

  const ceoUniverse = useMemo(() => {
    const placeholderLastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis", "Garcia", "Rodriguez", "Lee", "Walker", "Hall", "Allen", "Young", "King", "Wright", "Scott", "Green", "Baker", "Adams", "Nelson", "Carter", "Mitchell", "Perez", "Roberts"];
    const alertTickers = new Set(
      ceoAlerts
        .map((a) => a.matchedTicker?.toUpperCase())
        .filter((t): t is string => Boolean(t))
    );

    const makePlaceholder = (ticker: string, preset: QuickPresetId): CEOEntry => {
      const rnd = seedRandom(`ceo-placeholder:${preset}:${ticker}`);
      const h = Math.floor(rnd() * 1000);
      const last = placeholderLastNames[h % placeholderLastNames.length] ?? "Smith";
      const first = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Jamie", "Riley", "Quinn", "Avery", "Robin"][h % 10] ?? "Alex";
      const tenureStart = 1995 + (h % 30);
      const capPick = h % 100;
      const marketCap = capPick > 90 ? 3500 : capPick > 75 ? 900 : capPick > 55 ? 300 : capPick > 25 ? 120 : 60;
      const sentiment: CEOEntry["sentiment"] = (() => {
        const m = h % 10;
        if (m <= 2) return "negative";
        if (m <= 6) return "neutral";
        return "positive";
      })();
      const company =
        ticker.startsWith("SPY500_") || ticker.startsWith("SPY500_FILL_")
          ? "S&P 500 constituent"
          : ticker.startsWith("QQQ100_FILL_")
            ? "Nasdaq 100 constituent"
            : ticker.startsWith("DOW30_FILL_")
              ? "Dow 30 constituent"
              : ticker;
      return {
        id: `${ticker}-placeholder-${preset}`,
        name: `${first} ${last}`,
        company,
        ticker,
        sector: "Technology",
        tenureStart,
        sentiment,
        marketCap,
        recentAlert: alertTickers.has(ticker),
      };
    };

    const baseFromCEOs = CEOS.map((c) => ({
      ...c,
      recentAlert: alertTickers.has(c.ticker.toUpperCase()),
    }));

    if (!activeQuickPreset) return baseFromCEOs;

    const presetTickers = (() => {
      if (activeQuickPreset === "spy500") {
        const fetched = spy500Tickers && spy500Tickers.length > 0 ? spy500Tickers : null;
        const arr = (fetched ? [...fetched] : Array.from({ length: 500 }, (_, i) => `SPY500_${i + 1}`)).slice(0, 500);
        while (arr.length < 500) arr.push(`SPY500_FILL_${arr.length + 1}`);
        const alerts = Array.from(alertTickers);
        for (let i = 0; i < alerts.length && i < arr.length; i++) {
          arr[i] = alerts[i];
        }
        return arr;
      }
      const baseSet = QUICK_PRESET_TICKERS[activeQuickPreset];
      const arr = baseSet ? Array.from(baseSet) : [];
      if (activeQuickPreset === "qqq100") {
        const fetched = qqq100Tickers && qqq100Tickers.length > 0 ? qqq100Tickers : null;
        const base = fetched ? [...fetched] : arr;
        const next = base.slice(0, 100);
        while (next.length < 100) next.push(`QQQ100_FILL_${next.length + 1}`);
        // Replace filler tickers with any tickers we have live alerts for.
        const baseSize = baseSet ? baseSet.size : 0;
        const alerts = Array.from(alertTickers).filter((t) => !next.includes(t));
        let replaceIdx = next.length - 1;
        for (let i = 0; i < alerts.length && replaceIdx >= baseSize; i++) {
          next[replaceIdx] = alerts[i];
          replaceIdx--;
        }
        return next.slice(0, 100);
      }
      if (activeQuickPreset === "dow30") {
        const fetched = dow30Tickers && dow30Tickers.length > 0 ? dow30Tickers : null;
        const next = (fetched ? [...fetched] : arr).slice(0, 30);
        while (next.length < 30) next.push(`DOW30_FILL_${next.length + 1}`);
        return next;
      }
      return arr;
    })();

    return presetTickers.map((ticker) => {
      const key = ticker.toUpperCase();
      const existing = CEOS_BY_TICKER.get(key);
      if (existing) {
        return { ...existing, recentAlert: alertTickers.has(key) };
      }
      return makePlaceholder(key, activeQuickPreset);
    });
  }, [activeQuickPreset, ceoAlerts, CEOS_BY_TICKER, spy500Tickers, qqq100Tickers, dow30Tickers]);

  const filtered = useMemo(() => filterCEOs(ceoUniverse, filters), [ceoUniverse, filters]);
  const graphData = useMemo(() => buildGraphData(filtered), [filtered]);

  const presetShownCount = filtered.length;
  const activePresetShowLabel = activeQuickPreset ? QUICK_PRESET_SHOW_LABEL[activeQuickPreset] : null;
  const allViewLabel = `Overall`;

  const ceoOfWeek = useMemo(() => {
    const ticker = ceoAlerts[0]?.matchedTicker?.toUpperCase();
    if (!ticker) return null;
    return ceoUniverse.find((c) => c.ticker.toUpperCase() === ticker) ?? null;
  }, [ceoAlerts, ceoUniverse]);

  const weeklyAlerts = weeklyCeoAlerts;

  const searchMatches = useMemo(() => {
    if (!filters.search.trim()) return [];
    const q = filters.search.toLowerCase();
    return filtered.filter((c) => c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q) || c.ticker.toLowerCase().includes(q)).slice(0, 8);
  }, [filtered, filters.search]);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = detailPanelWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      setDetailPanelWidth(Math.min(700, Math.max(280, startW + delta)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [detailPanelWidth]);

  const dimmedIds = useMemo(() => {
    if (!filters.search) return new Set<string>();
    const q = filters.search.toLowerCase();
    const matchIds = new Set(filtered.filter((c) => c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q) || c.ticker.toLowerCase().includes(q)).map((c) => c.id));
    return new Set(graphData.nodes.map((n) => n.id).filter((id) => !matchIds.has(id)));
  }, [filters.search, filtered, graphData.nodes]);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const r = await fetch("/api/ceo-alerts", { cache: "no-store" });
        const d = await r.json();
        if (!mounted) return;
        setAlertsCount(d?.count ?? 0);
        setCeoAlerts(Array.isArray(d?.alerts) ? d.alerts : []);
        setWeeklyCeoAlerts(Array.isArray(d?.weekly) ? d.weekly : []);
      } catch {
        if (!mounted) return;
        setAlertsCount(0);
        setCeoAlerts([]);
        setWeeklyCeoAlerts([]);
      }
    };
    load();
    const t = setInterval(load, 2 * 60 * 1000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    const loadIndexTickers = async () => {
      if (activeQuickPreset === "spy500" && spy500Tickers == null) {
        try {
          const r = await fetch("/api/ceo-alerts?index=spy500", { cache: "no-store" });
          const d = await r.json();
          setSpy500Tickers(Array.isArray(d?.tickers) ? d.tickers : []);
        } catch {
          setSpy500Tickers([]);
        }
      }
      if (activeQuickPreset === "qqq100" && qqq100Tickers == null) {
        try {
          const r = await fetch("/api/ceo-alerts?index=qqq100", { cache: "no-store" });
          const d = await r.json();
          setQqq100Tickers(Array.isArray(d?.tickers) ? d.tickers : []);
        } catch {
          setQqq100Tickers([]);
        }
      }
      if (activeQuickPreset === "dow30" && dow30Tickers == null) {
        try {
          const r = await fetch("/api/ceo-alerts?index=dow30", { cache: "no-store" });
          const d = await r.json();
          setDow30Tickers(Array.isArray(d?.tickers) ? d.tickers : []);
        } catch {
          setDow30Tickers([]);
        }
      }
    };
    void loadIndexTickers();
  }, [activeQuickPreset, spy500Tickers, qqq100Tickers, dow30Tickers]);

  const filtersPersistSkippedRef = useRef(false);
  useEffect(() => {
    if (!filtersPersistSkippedRef.current) {
      filtersPersistSkippedRef.current = true;
      return;
    }
    saveCeoFilters(filters);
  }, [filters]);

  const panelsPersistSkippedRef = useRef(false);
  // Persist panel positions when they change (skip first run so we don't overwrite restored prefs)
  useEffect(() => {
    if (!panelsPersistSkippedRef.current) {
      panelsPersistSkippedRef.current = true;
      return;
    }
    saveCeoPanelPrefs({
      detailPanelWidth,
      detailPanelCollapsed,
      filterPanelCollapsed,
    });
  }, [detailPanelWidth, detailPanelCollapsed, filterPanelCollapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { shiftRef.current = e.shiftKey; };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); };
  }, []);

  // When landing on (or returning to) the CEOs page, center map and zoom out (delay so graph is mounted)
  useEffect(() => {
    if (pathname !== "/ceos" || !graphData.nodes.length) return;
    const t = setTimeout(() => {
      if (graphRef.current) {
        graphRef.current.zoomToFit?.(0, 40);
        graphRef.current.zoom?.(0.28, 0);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [pathname, graphData.nodes.length]);

  const handleCameraChange = useCallback((k: number, x: number, y: number) => {
    saveCeoMapCamera({ k, x, y });
  }, []);

  // Right panel stays blank until user clicks a CEO (no auto-select)

  const handleNodeClick = useCallback((ceo: CEOEntry) => {
    // If the filter panel is collapsed, selecting a CEO should reveal it again.
    setFilterPanelCollapsed(false);
    // If the right detail panel is collapsed, selecting a CEO should reveal it again.
    setDetailPanelCollapsed(false);
    if (shiftRef.current) {
      setCompare((prev) => {
        const next = prev.filter((c) => c.id !== ceo.id);
        if (next.length === prev.length && next.length < 3) next.push(ceo);
        else if (next.length === prev.length) next.shift();
        return next;
      });
    } else {
      setCompare([]);
      setSelected(ceo);
    }
  }, []);

  const handleExport = useCallback(() => {
    const headers = "Company,CEO,Sector,Tenure,Sentiment\n";
    const rows = CEOS.map((c) => `${c.company},${c.name},${c.sector},${c.tenureStart},${c.sentiment}`).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "xchange-ceo-list.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-x-hidden overflow-y-hidden bg-[#0A0E1A]">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-[#0F1520] px-4" style={{ borderColor: "var(--app-border, rgba(255,255,255,0.1))" }}>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">CEO Intelligence</h1>
          <p className="text-sm text-zinc-500">Track the leaders behind the world&apos;s biggest companies</p>
        </div>
        <div className="flex items-center gap-3">
          {alertsCount > 0 && (
            <span className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-medium text-red-400">
              {alertsCount} CEO changes this month
            </span>
          )}
          <div className="relative">
            <input
              type="text"
              placeholder="Search CEO or company..."
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-48 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-[var(--accent-color)] focus:outline-none sm:w-64"
            />
            {searchMatches.length > 0 && (
              <ul className="absolute left-0 top-full z-50 mt-1 max-h-60 w-64 overflow-y-auto rounded-lg border border-white/10 bg-[#0F1520] py-1 shadow-xl">
                {searchMatches.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/10"
                      onClick={() => {
                        setSelected(c);
                        setCompare([]);
                        setFilterPanelCollapsed(false);
                        setDetailPanelCollapsed(false);
                        setFilters((f) => ({ ...f, search: "" }));
                      }}
                    >
                      {c.name} · {c.company} ({c.ticker})
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" onClick={handleExport} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/15">Export CEO list</button>
        </div>
      </header>
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        <div className="absolute inset-0 z-0 hidden md:block">
          <CEOGraph
            graphData={graphData}
            selectedId={selected?.id ?? null}
            compareIds={new Set(compare.map((c) => c.id))}
            dimmedIds={dimmedIds}
            highlightSector={highlightSector}
            hoveredNodeId={hoveredNodeId}
            chartLocked={chartLocked}
            claudeTintByTicker={graphClaudeByTicker}
            onNodeHover={(n) => setHoveredNodeId(n?.id ?? null)}
            onNodeClick={handleNodeClick}
            onNodeRightClick={(c) => { setSelected(c); setFilterPanelCollapsed(false); setDetailPanelCollapsed(false); }}
            onCameraChange={handleCameraChange}
            graphRef={graphRef}
          />
        </div>
        <FilterPanel
          filters={filters}
          onFiltersChange={setFilters}
          alertsCount={alertsCount}
          ceoOfWeek={ceoOfWeek}
          recentAlerts={ceoAlerts}
          ceoOfWeekAlertTitle={ceoAlerts[0]?.title ?? null}
          weeklyAlerts={weeklyAlerts}
          activeQuickPreset={activeQuickPreset}
          onQuickPresetChange={(id) => setActiveQuickPreset((cur) => (cur === id ? null : id))}
          presetShownCount={presetShownCount}
          allViewLabel={allViewLabel}
          activePresetShowLabel={activePresetShowLabel}
          onSelectTicker={(t) => {
            const ceo = ceoUniverse.find((c) => c.ticker.toUpperCase() === t.toUpperCase());
            if (ceo) {
              setSelected(ceo);
              setCompare([]);
              setFilterPanelCollapsed(false);
              setDetailPanelCollapsed(false);
            }
          }}
          collapsed={filterPanelCollapsed}
          onToggleCollapse={() => setFilterPanelCollapsed((x) => !x)}
        />
        <div
          className="absolute top-2 z-20 flex flex-wrap items-center gap-2 rounded-lg bg-black/50 p-2 transition-[left] duration-200"
          style={{ left: (filterPanelCollapsed ? 48 : 220) + 12 }}
        >
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLinesInfo((v) => !v)}
                className="rounded p-1.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-300"
                aria-label="What do the lines mean?"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
              </button>
              {showLinesInfo && (
                <>
                  <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-lg border border-white/10 bg-[#0F1520] p-3 shadow-xl">
                    <p className="text-xs text-zinc-300">Lines connect CEOs in the same sector (typically to the tier below); some cross-sector links are shown for context.</p>
                    <button type="button" onClick={() => setShowLinesInfo(false)} className="mt-2 text-[10px] text-zinc-500 underline hover:text-zinc-400">Close</button>
                  </div>
                  <div className="fixed inset-0 z-10" aria-hidden onClick={() => setShowLinesInfo(false)} />
                </>
              )}
            </div>
            <button type="button" onClick={() => graphRef.current?.zoom?.(1.2)} className="rounded p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200" title="Zoom in">+</button>
            <button type="button" onClick={() => graphRef.current?.zoom?.(0.28, 300)} className="rounded p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200" title="Zoom out to max">−</button>
            <button type="button" onClick={() => graphRef.current?.zoomToFit?.(200, 40)} className="rounded p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200" title="Fit all">⊡</button>
            <button type="button" onClick={() => graphRef.current?.zoomToFit?.(200, 40)} className="flex items-center justify-center rounded p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200" title="Reset view">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21h5v-5" /></svg>
            </button>
            <button
              type="button"
              onClick={() => setChartLocked((x) => !x)}
              className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-xs ${chartLocked ? "bg-amber-500/20 text-amber-300" : "text-zinc-400 hover:bg-white/10 hover:text-zinc-200"}`}
              title={chartLocked ? "Unlock map: scroll will zoom/pan map" : "Lock map: scroll will move page"}
            >
              {chartLocked ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M7 11V7a5 5 0 0 1 9.9-1" /><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /></svg>
              )}
              {chartLocked ? "Locked" : "Lock"}
            </button>
          </div>
        {selected && (
          <>
            {/* Desktop: right-side CEO detail panel (same content as earlier bottom panel) */}
            <div className="absolute right-0 top-0 bottom-0 z-30 hidden md:flex md:flex-row">
              {detailPanelCollapsed ? (
                <button
                  type="button"
                  onClick={() => setDetailPanelCollapsed(false)}
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center border-l border-white/10 bg-[#0F1520] text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                  aria-label="Expand CEO panel"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
              ) : (
                <>
                  <div
                    role="separator"
                    aria-label="Resize panel"
                    className="hidden w-1 flex-shrink-0 cursor-col-resize bg-white/5 hover:bg-[var(--accent-color)]/30 md:block"
                    onMouseDown={startResize}
                  />
                  <div
                    className="flex min-h-0 flex-1 flex-col overflow-hidden border-l border-white/10 bg-[#0F1520] shadow-2xl md:flex-shrink-0"
                    style={{ width: detailPanelWidth, minWidth: 320 }}
                  >
                    <div className="flex shrink-0 items-center justify-end border-b border-white/5 px-2 py-1">
                      <button type="button" onClick={() => setDetailPanelCollapsed(true)} className="rounded p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200" aria-label="Collapse panel">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <DetailPanel
                        ceo={selected}
                        onClose={() => setSelected(null)}
                        alertsCount={alertsCount}
                        profileCacheRef={ceoProfileCacheRef}
                        onClaudeGraphSentiment={handleClaudeGraphSentiment}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
            {/* Mobile: bottom sheet overlay */}
            <div className="fixed inset-0 z-50 flex items-end bg-black/60 md:hidden" onClick={() => setSelected(null)} aria-hidden>
              <div className="max-h-[85vh] w-full overflow-hidden rounded-t-xl bg-[#0F1520] shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <DetailPanel
                  ceo={selected}
                  onClose={() => setSelected(null)}
                  alertsCount={alertsCount}
                  profileCacheRef={ceoProfileCacheRef}
                  onClaudeGraphSentiment={handleClaudeGraphSentiment}
                />
              </div>
            </div>
          </>
        )}
        <div className="absolute inset-x-0 bottom-0 z-10 max-h-[40vh] overflow-y-auto rounded-t-lg border-t border-white/10 bg-[#0F1520]/95 p-4 md:hidden scrollbar-hide">
          <p className="mb-2 text-sm font-medium text-zinc-400">CEO list</p>
          <ul className="space-y-2">
            {filtered.slice(0, 50).map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => { setSelected(c); setFilterPanelCollapsed(false); setDetailPanelCollapsed(false); }} className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-left">
                  <p className="font-medium text-zinc-100">{c.name}</p>
                  <p className="text-xs text-zinc-400">{c.company} ({c.ticker}) · {c.sector}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {compare.length >= 2 && <CompareModal ceos={compare} onClose={() => setCompare([])} />}
    </div>
  );
}
