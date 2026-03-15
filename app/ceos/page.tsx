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
  const rnd = seedRandom("constellation");
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

  const padding = 120;
  const nodes: ConstellationNode[] = [];

  [1, 2, 3, 4, 5].forEach((tier) => {
    const list = byTier.get(tier) ?? [];
    const count = list.length;
    const baseY = tierY(tier);
    const radius = tierRadius(tier);
    list.forEach((c, i) => {
      const x = count <= 1 ? CANVAS_W / 2 : padding + (i / (count - 1)) * (CANVAS_W - 2 * padding);
      const y = baseY + (rnd() - 0.5) * 60;
      const node: ConstellationNode = {
        ...c,
        id: c.id,
        val: radius,
        tier,
        fx: x,
        fy: y,
      };
      nodes.push(node);
    });
  });

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

const NODE_COLORS: Record<string, string> = {
  positive: "#00C896",
  neutral: "#60A5FA",
  negative: "#EF4444",
};

function CEOGraph({
  graphData,
  selectedId,
  compareIds,
  dimmedIds,
  highlightSector,
  hoveredNodeId,
  chartLocked,
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
  onNodeHover: (node: CEOEntry | null) => void;
  onNodeClick: (node: CEOEntry) => void;
  onNodeRightClick: (node: CEOEntry) => void;
  onCameraChange?: (k: number, x: number, y: number) => void;
  graphRef: React.RefObject<{ zoomToFit: (a?: number, b?: number, c?: (n: unknown) => boolean) => void; zoom: (n: number, ms?: number) => void; centerAt: (x?: number, y?: number, ms?: number) => void } | null>;
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
      const r = Math.max(node.val, 14);
      const isDimmed = dimmedIds.has(node.id) || (hoveredNodeId && hoveredNodeId !== node.id && !connectedToHover.has(node.id));
      const selected = selectedId === node.id || compareIds.has(node.id);
      const label = truncateCompany(node.company, 12);
      const fontSize = Math.max(11, Math.min(14, r * 0.55));

      ctx.save();
      if (isDimmed && hoveredNodeId) ctx.globalAlpha = 0.35;
      else if (highlightSector && node.sector !== highlightSector) ctx.globalAlpha = 0.5;
      else ctx.globalAlpha = 1;

      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px, py, r + 1, 0, 2 * Math.PI);
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

      ctx.globalAlpha = 1;
      ctx.font = `${fontSize}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.fillText(label, px, py);
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

  const nodeLabel = useCallback(
    (n: CEOEntry) => `${n.name}\n${n.company} · ${n.ticker}\nCEO since ${n.tenureStart}`,
    []
  );

  if (!ForceGraph2D || !graphData.nodes.length) {
    return (
      <div ref={containerRef} className="flex h-full w-full items-center justify-center" style={{ background: "radial-gradient(ellipse at center, #0D1B3E 0%, #050B1A 100%)" }}>
        <p className="text-zinc-400">Loading graph…</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden"
      style={{ background: "#050B1A" }}
      onWheel={(e) => e.stopPropagation()}
    >
      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        nodeId="id"
        linkSource="source"
        linkTarget="target"
        nodeVal={(n: ConstellationNode) => Math.max(n.val, 14)}
        nodeColor={(n: { sentiment?: string }) => NODE_COLORS[n.sentiment as string] ?? NODE_COLORS.neutral}
        linkColor={() => LINK_COLOR}
        linkWidth={0.8}
        backgroundColor="transparent"
        width={size.w}
        height={size.h}
        nodeLabel={nodeLabel}
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
        onNodeHover={(n: { id?: string } | null) => {
          const ceo = n ? graphData.nodes.find((x) => x.id === n.id) ?? null : null;
          onNodeHover(ceo ?? null);
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
    </div>
  );
}

function FilterPanel({
  filters,
  onFiltersChange,
  alertsCount,
  ceoOfWeek,
  onSelectCEO,
  collapsed,
  onToggleCollapse,
}: {
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
  alertsCount: number;
  ceoOfWeek: CEOEntry | null;
  onSelectCEO: (c: CEOEntry) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const alerts = CEOS.filter((c) => c.recentAlert);

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
              <p className="mt-1 text-[10px] text-zinc-500">Most talked about this week</p>
              <button type="button" onClick={() => onSelectCEO(ceoOfWeek)} className="mt-2 text-xs text-[var(--accent-color)] hover:underline">View on graph →</button>
            </div>
          )}
          <div className="border-t border-white/10 pt-3">
            <p className="mb-2 text-xs font-medium text-zinc-400">Recent alerts</p>
            {alerts.length === 0 ? (
              <p className="text-xs text-zinc-500">No recent CEO changes</p>
            ) : (
              <ul className="space-y-2">
                {alerts.slice(0, 8).map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => onSelectCEO(c)} className="flex w-full items-center gap-2 text-left text-sm text-zinc-300 hover:text-zinc-100">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
                      {c.name}
                      <span className="text-[10px] text-zinc-500">New CEO / News</span>
                    </button>
                  </li>
                ))}
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
}: {
  ceo: CEOEntry;
  onClose: () => void;
  alertsCount: number;
}) {
  const [news, setNews] = useState<{ title: string; url: string; source: string; publishedAt: string; sentiment: string }[]>([]);
  const [legal, setLegal] = useState<{ date: string; headline: string; url: string; source: string; active: boolean }[]>([]);
  const [quote, setQuote] = useState<{ price: number; changePercent: number } | null>(null);
  const [assessment, setAssessment] = useState<{ leadershipScore: number; scoreLabel: string; summary: string; strengths: string[]; watchPoints: string[]; longTermOutlook: string; investorVerdict: string } | null>(null);
  const [assessLoading, setAssessLoading] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const tenureYears = new Date().getFullYear() - ceo.tenureStart;

  useEffect(() => {
    fetch(`/api/ceo-news?name=${encodeURIComponent(ceo.name)}&company=${encodeURIComponent(ceo.company)}`)
      .then((r) => r.json())
      .then((d) => setNews(d?.articles ?? []))
      .catch(() => setNews([]));
  }, [ceo.id, ceo.name, ceo.company]);

  useEffect(() => {
    fetch(`/api/ceo-legal?name=${encodeURIComponent(ceo.name)}`)
      .then((r) => r.json())
      .then((d) => setLegal(d?.items ?? []))
      .catch(() => setLegal([]));
  }, [ceo.id, ceo.name]);

  useEffect(() => {
    fetch(`/api/ticker-quote?ticker=${encodeURIComponent(ceo.ticker)}`)
      .then((r) => r.json())
      .then((d) => setQuote(d?.price != null ? { price: d.price, changePercent: d.changePercent ?? 0 } : null))
      .catch(() => setQuote(null));
  }, [ceo.ticker]);

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

  const color = sentimentColor(ceo.sentiment);
  return (
    <div className="flex h-full w-full flex-col overflow-hidden border-l border-white/10 bg-[#0F1520]/98 shadow-2xl backdrop-blur-sm">
      <div className="flex shrink-0 items-start justify-between border-b border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white" style={{ backgroundColor: color }}>
            {getInitials(ceo.name)}
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-100">{ceo.name}</h2>
            <p className="text-sm text-zinc-400">{ceo.company}</p>
            <span className="mt-1 inline-block rounded bg-white/10 px-2 py-0.5 text-xs font-medium text-zinc-300">{ceo.ticker}</span>
            <span className="ml-1 inline-block rounded bg-white/5 px-2 py-0.5 text-[10px] text-zinc-500">{ceo.sector}</span>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-300" aria-label="Close">×</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        <p className="text-sm text-zinc-400">CEO since {ceo.tenureStart} · {tenureYears} years</p>
        <p className="text-xs">
          Sentiment: <span style={{ color }}>{ceo.sentiment}</span>
        </p>
        {ceo.recentAlert && alertsCount > 0 && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">
            <strong>Leadership change detected</strong>
            <p className="mt-1 text-xs text-red-200/80">See recent news for details.</p>
          </div>
        )}
        {quote != null && (
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-zinc-500">Stock</p>
            <p className="text-lg font-semibold text-zinc-100">${quote.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className={quote.changePercent >= 0 ? "text-emerald-400" : "text-red-400"}>{quote.changePercent >= 0 ? "+" : ""}{quote.changePercent.toFixed(2)}%</span></p>
            <p className="text-[10px] text-zinc-500">Stock since {ceo.name} took over: approximate data in chart</p>
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
          {legal.length === 0 ? <p className="text-xs text-emerald-500/90">No significant legal issues found</p> : (
            <ul className="space-y-2">
              {legal.map((l, i) => (
                <li key={i} className={`rounded border p-2 text-xs ${l.active ? "border-red-500/30 bg-red-500/5 text-red-200" : "border-white/5 bg-white/5 text-zinc-400"}`}>
                  <p className="font-medium">{l.date}</p>
                  <p className="line-clamp-2">{l.headline}</p>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[10px] text-[var(--accent-color)]">Source</a>
                </li>
              ))}
            </ul>
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
  const [filters, setFilters] = useState<FilterState>(defaultFilters());
  const [selected, setSelected] = useState<CEOEntry | null>(null);
  const [compare, setCompare] = useState<CEOEntry[]>([]);
  const [filterPanelCollapsed, setFilterPanelCollapsed] = useState(false);
  const [alertsCount, setAlertsCount] = useState(0);
  const graphRef = useRef<{ zoomToFit: (a?: number, b?: number, c?: (n: unknown) => boolean) => void; zoom: (n: number, ms?: number) => void; centerAt: (x?: number, y?: number, ms?: number) => void } | null>(null);
  const shiftRef = useRef(false);
  const hasAutoSelectedRef = useRef(false);

  const [highlightSector, setHighlightSector] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [chartLocked, setChartLocked] = useState(false);
  const [showLinesInfo, setShowLinesInfo] = useState(false);
  const [detailPanelWidth, setDetailPanelWidth] = useState(400);
  const [detailPanelCollapsed, setDetailPanelCollapsed] = useState(false);

  const filtered = useMemo(() => filterCEOs(CEOS, filters), [filters]);
  const graphData = useMemo(() => buildGraphData(filtered), [filtered]);

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
  const ceoOfWeek = useMemo(() => CEOS[Math.abs(Math.floor(Math.sin(Date.now() / 86400000) * CEOS.length)) % CEOS.length], []);

  useEffect(() => {
    fetch("/api/ceo-alerts")
      .then((r) => r.json())
      .then((d) => setAlertsCount(d?.count ?? 0))
      .catch(() => setAlertsCount(0));
  }, []);

  // Restore panel positions/collapsed state when user comes back to the page
  useEffect(() => {
    if (pathname !== "/ceos") return;
    const prefs = getCeoPanelPrefs();
    setDetailPanelWidth(prefs.detailPanelWidth);
    setDetailPanelCollapsed(prefs.detailPanelCollapsed);
    setFilterPanelCollapsed(prefs.filterPanelCollapsed);
  }, [pathname]);

  // Restore left panel filter data when user comes back to the page
  useEffect(() => {
    if (pathname !== "/ceos") return;
    const saved = getCeoFilters();
    if (saved) setFilters(saved);
  }, [pathname]);

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

  // Auto-open the right panel with the first CEO so the user doesn't have to click to see it
  useEffect(() => {
    if (pathname !== "/ceos" || filtered.length === 0 || hasAutoSelectedRef.current) return;
    hasAutoSelectedRef.current = true;
    setSelected(filtered[0]);
  }, [pathname, filtered]);

  const handleNodeClick = useCallback((ceo: CEOEntry) => {
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
            onNodeHover={(n) => setHoveredNodeId(n?.id ?? null)}
            onNodeClick={handleNodeClick}
            onNodeRightClick={(c) => setSelected(c)}
            onCameraChange={handleCameraChange}
            graphRef={graphRef}
          />
        </div>
        <FilterPanel
          filters={filters}
          onFiltersChange={setFilters}
          alertsCount={alertsCount}
          ceoOfWeek={ceoOfWeek}
          onSelectCEO={(c) => { setSelected(c); setCompare([]); }}
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
                      <DetailPanel ceo={selected} onClose={() => setSelected(null)} alertsCount={alertsCount} />
                    </div>
                  </div>
                </>
              )}
            </div>
            {/* Mobile: bottom sheet overlay */}
            <div className="fixed inset-0 z-50 flex items-end bg-black/60 md:hidden" onClick={() => setSelected(null)} aria-hidden>
              <div className="max-h-[85vh] w-full overflow-hidden rounded-t-xl bg-[#0F1520] shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <DetailPanel ceo={selected} onClose={() => setSelected(null)} alertsCount={alertsCount} />
              </div>
            </div>
          </>
        )}
        <div className="absolute inset-x-0 bottom-0 z-10 max-h-[40vh] overflow-y-auto rounded-t-lg border-t border-white/10 bg-[#0F1520]/95 p-4 md:hidden scrollbar-hide">
          <p className="mb-2 text-sm font-medium text-zinc-400">CEO list</p>
          <ul className="space-y-2">
            {filtered.slice(0, 50).map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setSelected(c)} className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-left">
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
