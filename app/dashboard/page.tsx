"use client";

import "react-grid-layout/css/styles.css";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  getDashboardList,
  getDashboard,
  saveDashboard,
  deleteDashboard,
  getDefaultDashboard,
  createNewDashboard,
  getLastDashboardId,
  setLastDashboardId,
  WIDGET_CONFIG,
  DASHBOARD_PRESETS,
  type LayoutItem,
  type SavedDashboard,
  type WidgetId,
  type DashboardTheme,
  MAX_DASHBOARDS_COUNT,
} from "../../lib/dashboard";
import { setLastWorkspaceTab } from "../../lib/workspace-tab";
import { WidgetWrapper } from "../../components/widgets/WidgetWrapper";
import { WidgetContent } from "../../components/widgets/WidgetContents";

const ReactGridLayout = dynamic(() => import("react-grid-layout").then((mod) => mod.default), {
  ssr: false,
  loading: () => <div className="flex h-64 items-center justify-center text-zinc-500">Loading grid...</div>,
});

const HEADER_BG = "#080B14";
const CATEGORIES = ["Market Data", "Social", "Tools", "AI & Analysis", "Personal", "Custom"];

export default function DashboardPage() {
  const [list, setList] = useState<SavedDashboard[]>([]);
  const [current, setCurrent] = useState<SavedDashboard | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [themePanelOpen, setThemePanelOpen] = useState(false);
  const [customBgHex, setCustomBgHex] = useState("");
  const [dashDropdownOpen, setDashDropdownOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("My Dashboard");
  const [newDashModal, setNewDashModal] = useState(false);
  const [newDashName, setNewDashName] = useState("");
  const [newDashTemplate, setNewDashTemplate] = useState<"blank" | "morning" | "crypto" | "longterm" | "daytrader">("blank");
  const [width, setWidth] = useState(1200);
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [apiSaving, setApiSaving] = useState(false);
  const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1024;

  useEffect(() => { setLastWorkspaceTab("dashboard"); }, []);

  const loadList = useCallback(() => {
    const l = getDashboardList();
    setList(l);
    if (l.length > 0 && !current) setCurrent(getDashboard(l[0].id) ?? l[0]);
  }, [current]);

  useEffect(() => {
    const init = async () => {
      const lastId = getLastDashboardId();

      // 1) Supabase first
      try {
        const res = await fetch("/api/dashboard", { cache: "no-store" });
        if (!res.ok) throw new Error(`api ${res.status}`);
        const data = (await res.json()) as { dashboards?: SavedDashboard[] };
        const dashboards = Array.isArray(data.dashboards) ? data.dashboards : [];

        if (dashboards.length > 0) {
          setList(dashboards);
          const toLoad =
            lastId && dashboards.some((d) => d.id === lastId)
              ? dashboards.find((d) => d.id === lastId) ?? dashboards[0]
              : dashboards[0];
          setCurrent(toLoad);
          setLastDashboardId(toLoad.id);
          return;
        }

        // Supabase returned zero dashboards: create a default one in Supabase.
        const def = getDefaultDashboard("My Dashboard");
        try {
          const res = await fetch("/api/dashboard", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dashboardId: def.id,
              name: def.name,
              layout: def.layout,
              widgets: def.widgets,
              theme: def.theme,
            }),
          });
          if (res.ok) {
            const saved = (await res.json()) as { dashboard?: SavedDashboard };
            const dash = saved.dashboard ?? def;
            setCurrent(dash);
            setList([dash]);
            setLastDashboardId(dash.id);
            return;
          }
        } catch {
          // ignore and fallback to localStorage below
        }
      } catch {
        // fall through to localStorage
      }

      // 2) LocalStorage fallback
      const l = getDashboardList();
      setList(l);
      if (l.length > 0) {
        if (!current) {
          const toLoad =
            lastId && l.some((d) => d.id === lastId)
              ? getDashboard(lastId) ?? l[0]
              : getDashboard(l[0].id) ?? l[0];
          setCurrent(toLoad);
          setLastDashboardId(toLoad.id);
        }
        return;
      }

      // 3) If nothing exists, create a default dashboard
      const def = getDefaultDashboard("My Dashboard");
      saveDashboard(def);

      // Best-effort: try to persist the default to Supabase.
      // If it fails, the user can still work with the local dashboard.
      try {
        const res = await fetch("/api/dashboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dashboardId: def.id,
            name: def.name,
            layout: def.layout,
            widgets: def.widgets,
            theme: def.theme,
          }),
        });
        if (res.ok) {
          const saved = (await res.json()) as { dashboard?: SavedDashboard };
          const dash = saved.dashboard ?? def;
          setCurrent(dash);
          setList([dash]);
          setLastDashboardId(dash.id);
          return;
        }
      } catch {
        // ignore
      }

      setCurrent(def);
      setList(getDashboardList());
      setLastDashboardId(def.id);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (current) setNameValue(current.name);
  }, [current?.id, current?.name]);

  useEffect(() => {
    if (themePanelOpen && current) setCustomBgHex(current.theme?.background ?? "#0A0E1A");
  }, [themePanelOpen, current?.id]);

  useEffect(() => {
    const onResize = () => setWidth(typeof window !== "undefined" ? window.innerWidth : 1200);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onVisibility = async () => {
      if (document.visibilityState !== "visible") return;
      // Prefer Supabase refresh; fall back to localStorage.
      try {
        const res = await fetch("/api/dashboard", { cache: "no-store" });
        if (!res.ok) throw new Error(`api ${res.status}`);
        const data = (await res.json()) as { dashboards?: SavedDashboard[] };
        const dashboards = Array.isArray(data.dashboards) ? data.dashboards : [];
        setList(dashboards);
        if (current && dashboards.length > 0) {
          const match = dashboards.find((d) => d.id === current.id);
          if (match) setCurrent(match);
        }
      } catch {
        const l = getDashboardList();
        setList(l);
        if (current && l.length > 0) {
          const fresh = getDashboard(current.id);
          if (fresh) setCurrent(fresh);
          else if (l.some((d) => d.id === current.id)) setCurrent(getDashboard(current.id) ?? current);
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [current?.id]);

  const layoutChangeInProgress = useRef(false);
  const currentLayoutRef = useRef<LayoutItem[]>([]);
  currentLayoutRef.current = current?.layout ?? [];
  const currentRef = useRef<SavedDashboard | null>(null);
  currentRef.current = current;
  const autoSaveTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  useEffect(() => {
    layoutChangeInProgress.current = false;
  }, [current?.id]);
  const handleLayoutChange = useCallback(
    (newLayout: readonly LayoutItem[]) => {
      if (!current || layoutChangeInProgress.current) return;
      const prev = currentLayoutRef.current;
      const sortKey = (l: readonly LayoutItem[]) => JSON.stringify([...l].sort((a, b) => a.i.localeCompare(b.i)).map((i) => [i.i, i.x, i.y, i.w, i.h]));
      if (sortKey(prev) === sortKey(newLayout)) return;
      layoutChangeInProgress.current = true;
      const nextLayout = [...newLayout];
      currentLayoutRef.current = nextLayout;
      setCurrent((c) => (c ? { ...c, layout: nextLayout } : c));
      queueMicrotask(() => { layoutChangeInProgress.current = false; });
    },
    [current?.id]
  );

  // Auto-save layout after 2s of inactivity (debounced) while in Edit Mode.
  useEffect(() => {
    if (!isDesktop || !editMode) return;
    if (!current) return;

    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    autoSaveTimerRef.current = window.setTimeout(async () => {
      const dash = currentRef.current;
      if (!dash) return;
      if (saveInFlightRef.current) return;

      const layoutToSave = (currentLayoutRef.current ?? [])
        .filter((i) => i.i !== "macro-map-mini")
        .filter((item, idx, arr) => arr.findIndex((x) => x.i === item.i) === idx);

      const payload = {
        dashboardId: dash.id,
        name: dash.name,
        layout: layoutToSave,
        widgets: dash.widgets,
        theme: dash.theme,
      };

      try {
        saveInFlightRef.current = true;
        setApiSaving(true);
        const res = await fetch("/api/dashboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`api ${res.status}`);
        const json = (await res.json()) as { dashboard?: SavedDashboard };
        if (json.dashboard) {
          setCurrent(json.dashboard);
          setList((prev) => {
            const idx = prev.findIndex((d) => d.id === json.dashboard!.id);
            if (idx >= 0) return prev.map((d, i) => (i === idx ? json.dashboard! : d)).slice(0, MAX_DASHBOARDS_COUNT);
            return [json.dashboard!, ...prev].slice(0, MAX_DASHBOARDS_COUNT);
          });
          setLastDashboardId(json.dashboard.id);
        } else {
          // Keep local state updated with layout even if server returned no row.
          setCurrent((prev) => (prev ? { ...prev, layout: layoutToSave, updatedAt: new Date().toISOString() } : prev));
        }
      } catch {
        // Local fallback (no explicit "saved locally" UI).
        const fallback = { ...dash, layout: layoutToSave, updatedAt: new Date().toISOString() };
        saveDashboard(fallback);
        setCurrent(fallback);
        setList(getDashboardList());
      } finally {
        saveInFlightRef.current = false;
        setApiSaving(false);
      }
    }, 2000);

    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [current?.layout, current?.id, current?.widgets, current?.theme, isDesktop, editMode]);

  const handleAddWidget = useCallback(
    (widgetId: WidgetId) => {
      if (!current || current.widgets.includes(widgetId)) return;
      const config = WIDGET_CONFIG[widgetId];
      const newLayout = [...current.layout];
      const maxY = newLayout.length ? Math.max(...newLayout.map((i) => i.y + i.h)) : 0;
      newLayout.push({
        i: widgetId,
        x: 0,
        y: maxY,
        w: config.defaultW,
        h: config.defaultH,
        minW: config.minW,
        minH: config.minH,
      });
      const next = { ...current, layout: newLayout, widgets: [...current.widgets, widgetId] };
      setCurrent(next);
      setAddPanelOpen(false);
    },
    [current]
  );

  const handleRemoveWidget = useCallback(
    (id: string) => {
      if (!current) return;
      const next = {
        ...current,
        layout: current.layout.filter((i) => i.i !== id),
        widgets: current.widgets.filter((w) => w !== id),
      };
      setCurrent(next);
    },
    [current]
  );

  const handleSwitchDashboard = useCallback((dash: SavedDashboard) => {
    const full = getDashboard(dash.id) ?? dash;
    setCurrent(full);
    setNameValue(full.name);
    setLastDashboardId(full.id);
    setDashDropdownOpen(false);
  }, []);

  const handleRenameDashboard = useCallback(
    (newName: string) => {
      if (!current) return;
      const updated = { ...current, name: newName.trim() || current.name };
      setCurrent(updated);
      setNameValue(updated.name);
      setEditingName(false);
      // Persist name change immediately so it doesn't rely on layout edits.
      (async () => {
        const layoutToSave = (updated.layout ?? [])
          .filter((i) => i.i !== "macro-map-mini")
          .filter((item, idx, arr) => arr.findIndex((x) => x.i === item.i) === idx);

        const payload = {
          dashboardId: updated.id,
          name: updated.name,
          layout: layoutToSave,
          widgets: updated.widgets,
          theme: updated.theme,
        };
        try {
          setApiSaving(true);
          const res = await fetch("/api/dashboard", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error(`api ${res.status}`);
          const json = (await res.json()) as { dashboard?: SavedDashboard };
          if (json.dashboard) {
            setCurrent(json.dashboard);
            setList((prev) => {
              const idx = prev.findIndex((d) => d.id === json.dashboard?.id);
              if (idx >= 0) return prev.map((d, i) => (i === idx ? json.dashboard! : d));
              return [json.dashboard!, ...prev];
            });
            setLastDashboardId(json.dashboard.id);
          }
        } catch {
          // Fallback to localStorage if the API is unavailable.
          saveDashboard({ ...updated, layout: layoutToSave, updatedAt: new Date().toISOString() });
          setList(getDashboardList());
        } finally {
          setApiSaving(false);
        }
      })();
    },
    [current]
  );

  const handleSaveDashboard = useCallback(async () => {
    if (!current) return;
    const layoutToSave = (current.layout ?? [])
      .filter((i) => i.i !== "macro-map-mini")
      .filter((item, idx, arr) => arr.findIndex((x) => x.i === item.i) === idx);
    const toSave = { ...current, layout: layoutToSave, updatedAt: new Date().toISOString() };
    setApiSaving(true);
    try {
      const res = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dashboardId: toSave.id,
          name: toSave.name,
          layout: toSave.layout,
          widgets: toSave.widgets,
          theme: toSave.theme,
        }),
      });
      if (!res.ok) throw new Error(`api ${res.status}`);
      const json = (await res.json()) as { dashboard?: SavedDashboard };
      const saved = json.dashboard ?? toSave;
      setCurrent(saved);
      setList((prev) => {
        const idx = prev.findIndex((d) => d.id === saved.id);
        const next = idx >= 0 ? prev.map((d) => (d.id === saved.id ? saved : d)) : [saved, ...prev];
        return next.slice(0, MAX_DASHBOARDS_COUNT);
      });
      setLastDashboardId(saved.id);
    } catch {
      // Fallback to localStorage if the API is unavailable.
      saveDashboard(toSave);
      setCurrent(toSave);
      setLastDashboardId(toSave.id);
      setList(getDashboardList());
    } finally {
      setApiSaving(false);
      setSaveFeedback(true);
      setTimeout(() => setSaveFeedback(false), 2000);
    }
  }, [current]);

  const handleCreateNew = useCallback(() => {
    const name = newDashName.trim() || "New Dashboard";
    const dash = createNewDashboard(name, newDashTemplate);
    setCurrent(dash);
    setNameValue(dash.name);
    setList(getDashboardList());
    setLastDashboardId(dash.id);
    setNewDashModal(false);
    setNewDashName("");
    setNewDashTemplate("blank");

    // Best-effort: persist the new dashboard to Supabase.
    (async () => {
      try {
        setApiSaving(true);
        const payload = {
          dashboardId: dash.id,
          name: dash.name,
          layout: dash.layout,
          widgets: dash.widgets,
          theme: dash.theme,
        };
        const res = await fetch("/api/dashboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const json = (await res.json()) as { dashboard?: SavedDashboard };
          if (json.dashboard) {
            setCurrent(json.dashboard);
            setList([json.dashboard]);
            setLastDashboardId(json.dashboard.id);
          }
        }
      } catch {
        // ignore; user can still use local dashboard
      } finally {
        setApiSaving(false);
      }
    })();
  }, [newDashName, newDashTemplate]);

  const theme = current?.theme ?? {};
  const gridStyle = {
    backgroundColor: theme.background ?? "#0A0E1A",
    backgroundImage: theme.backgroundImage ?? undefined,
  };

  const layout = (current?.layout ?? [])
    .filter((i) => i.i !== "macro-map-mini")
    .filter((item, idx, arr) => arr.findIndex((x) => x.i === item.i) === idx);
  // In edit mode we want widgets to always capture mouse events for dragging/resizing.
  // (Scroll/zoom passthrough is handled separately via view-mode pointer-events CSS.)
  const canEdit = editMode;

  const ROW_H = 60;
  const layoutBottom = layout.length ? Math.max(...layout.map((i) => i.y + i.h)) * ROW_H + 80 : 400;
  const layoutWidth = Math.max(width, 1200);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef(pan);
  panRef.current = pan;
  const panStart = useRef({ x: 0, y: 0, cursorX: 0, cursorY: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const isPanningRef = useRef(isPanning);
  isPanningRef.current = isPanning;
  const [scale, setScale] = useState(1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasInitialCenter = useRef(false);

  const centerView = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || !current || layout.length === 0) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (cw === 0 || ch === 0) return;
    const fitScale = Math.min(1, (cw / layoutWidth) * 0.95, (ch / layoutBottom) * 0.95);
    setScale(fitScale);
    setPan({ x: 0, y: 0 });
  }, [layoutWidth, layoutBottom, current, layout.length]);

  useEffect(() => {
    if (!current || layout.length === 0) return;
    hasInitialCenter.current = false;
  }, [current?.id]);

  useEffect(() => {
    if (hasInitialCenter.current || !current || layout.length === 0) return;
    const id = requestAnimationFrame(() => {
      const el = scrollContainerRef.current;
      if (!el || hasInitialCenter.current) return;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (cw === 0 || ch === 0) return;
      hasInitialCenter.current = true;
      const fitScale = Math.min(1, (cw / layoutWidth) * 0.95, (ch / layoutBottom) * 0.95);
      setScale(fitScale);
      setPan({ x: 0, y: 0 });
    });
    return () => cancelAnimationFrame(id);
  }, [current?.id, layout.length, layoutWidth, layoutBottom]);

  const handlePanStart = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // View mode: allow panning even when cursor is over widgets,
      // but don't steal clicks from interactive elements.
      if (!editMode) {
        const interactive = target.closest(
          "button,a,input,textarea,select,label,[role='button'],[contenteditable='true']"
        );
        if (interactive) return;
      } else {
        // Edit mode: keep panning off widgets (widgets handle drag/resize).
        if (target.closest(".react-grid-item")) return;
      }

      panStart.current = {
        x: panRef.current.x,
        y: panRef.current.y,
        cursorX: e.clientX,
        cursorY: e.clientY,
      };
      setIsPanning(true);
    },
    [editMode]
  );

  const handlePanMove = useCallback((e: MouseEvent) => {
    if (!isPanningRef.current) return;
    setPan({
      x: panStart.current.x + (e.clientX - panStart.current.cursorX),
      y: panStart.current.y + (e.clientY - panStart.current.cursorY),
    });
  }, []);

  const handlePanEnd = useCallback(() => setIsPanning(false), []);

  useEffect(() => {
    if (!isPanning) return;
    window.addEventListener("mousemove", handlePanMove);
    window.addEventListener("mouseup", handlePanEnd);
    return () => {
      window.removeEventListener("mousemove", handlePanMove);
      window.removeEventListener("mouseup", handlePanEnd);
    };
  }, [isPanning, handlePanMove, handlePanEnd]);

  const MIN_SCALE = 0.2;
  const MAX_SCALE = 1.8;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      // In view mode, allow zooming over widgets too.
      // In edit mode, keep wheel from interfering with dragging/resizing.
      if (canEdit && (e.target as HTMLElement).closest(".react-grid-item")) return;
    const s = scaleRef.current;
    const zoomOut = e.deltaY > 0;
    const wouldChange = (zoomOut && s > MIN_SCALE) || (!zoomOut && s < MAX_SCALE);
    if (wouldChange) e.preventDefault();
    if (!wouldChange) return;
    const delta = zoomOut ? -0.05 : 0.05;
    setScale((prev) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta)));
    },
    [canEdit]
  );

  return (
    <div className={"flex h-full flex-col bg-[#0A0E1A] text-zinc-200 " + (canEdit ? "dashboard-page-in-edit" : "")} style={{ minHeight: "calc(100vh - 3.5rem)" }}>
      <header
        className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-white/10 px-4"
        style={{ backgroundColor: HEADER_BG }}
      >
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex items-center gap-0 rounded-lg border border-white/10 bg-white/5 p-0.5">
            <Link href="/ai" className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 transition hover:bg-white/5 hover:text-[var(--accent-color)]" title="AI Chat">AI Chat</Link>
            <span className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-zinc-100">Dashboard</span>
            <Link href="/whiteboard" className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 transition hover:bg-white/5 hover:text-[var(--accent-color)]" title="Whiteboard">Whiteboard</Link>
          </div>
          {editingName ? (
            <input
              type="text"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={() => handleRenameDashboard(nameValue)}
              onKeyDown={(e) => e.key === "Enter" && handleRenameDashboard(nameValue)}
              className="max-w-[200px] rounded border border-white/20 bg-white/5 px-2 py-1 text-sm text-zinc-100 focus:border-[var(--accent-color)] focus:outline-none"
              autoFocus
            />
          ) : (
            <button type="button" onClick={() => isDesktop && setEditingName(true)} className="truncate text-left text-sm font-medium text-zinc-100 hover:text-[var(--accent-color)]">
              {current?.name ?? "My Dashboard"}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-[10px] text-zinc-500 sm:inline">Edit Mode</span>
          <button
            type="button"
            role="switch"
            aria-checked={editMode}
            onClick={() => setEditMode((e) => !e)}
            className={`relative h-6 w-11 rounded-full transition ${editMode ? "bg-[var(--accent-color)]" : "bg-zinc-600"}`}
          >
            <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition left-1 ${editMode ? "translate-x-5" : ""}`} />
          </button>
          {editMode && <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-400">Editing</span>}
          {apiSaving && <span className="text-[10px] text-zinc-500">saving...</span>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setAddPanelOpen(true)} className="rounded bg-[var(--accent-color)] px-3 py-1.5 text-xs font-medium text-[#020308] hover:opacity-90">
            + Add Widget
          </button>
          <div className="relative">
            <button type="button" onClick={() => setDashDropdownOpen((o) => !o)} className="rounded px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-200" title="My Dashboards">
              My Dashboards
            </button>
            {dashDropdownOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-white/10 bg-[#0F1520] py-2 shadow-xl">
                {list.filter((d, i, arr) => arr.findIndex((x) => x.id === d.id) === i).map((d) => (
                  <div key={d.id} className="flex items-center gap-1 px-3 py-2 hover:bg-white/5">
                    <button type="button" onClick={() => handleSwitchDashboard(d)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm">
                      <span className={"truncate " + (d.id === current?.id ? "font-medium text-[var(--accent-color)]" : "text-zinc-200")}>{d.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const res = await fetch(
                            `/api/dashboard?dashboardId=${encodeURIComponent(d.id)}`,
                            { method: "DELETE" }
                          );
                          if (!res.ok) throw new Error(`api ${res.status}`);

                          const res2 = await fetch("/api/dashboard", { cache: "no-store" });
                          const json = (await res2.json()) as { dashboards?: SavedDashboard[] };
                          const dashboards = Array.isArray(json.dashboards) ? json.dashboards : [];

                          if (dashboards.length > 0) {
                            setList(dashboards);
                            if (current?.id === d.id) {
                              setCurrent(dashboards[0]);
                              setNameValue(dashboards[0].name);
                              setLastDashboardId(dashboards[0].id);
                            }
                          } else {
                            // Re-create default locally if Supabase returns empty after delete.
                            const def = getDefaultDashboard("My Dashboard");
                            saveDashboard(def);
                            setList(getDashboardList());
                            if (current?.id === d.id) {
                              setCurrent(def);
                              setNameValue(def.name);
                              setLastDashboardId(def.id);
                            }
                          }
                        } catch {
                          // Fallback to localStorage.
                          deleteDashboard(d.id);
                          const next = getDashboardList();
                          setList(next);
                          if (current?.id === d.id) {
                            setCurrent(next[0] ?? null);
                            setNameValue(next[0]?.name ?? "My Dashboard");
                          }
                        } finally {
                          setDashDropdownOpen(false);
                        }
                      }}
                      className="shrink-0 rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-red-400"
                      title="Delete dashboard"
                      aria-label="Delete"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {list.length < MAX_DASHBOARDS_COUNT && (
                  <button type="button" onClick={() => { setDashDropdownOpen(false); setNewDashModal(true); }} className="w-full px-3 py-2 text-left text-sm text-[var(--accent-color)] hover:bg-white/5">
                    + New Dashboard
                  </button>
                )}
              </div>
            )}
          </div>
          <button type="button" onClick={centerView} className="rounded px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-200" title="Center view">
            Center
          </button>
          <button type="button" onClick={() => setThemePanelOpen((o) => !o)} className="rounded px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-200" title="Customize Theme">
            Customize Theme
          </button>
        </div>
      </header>

      <div
        ref={scrollContainerRef}
        className={`relative min-h-0 flex-1 ${scale < 1 ? "flex items-center justify-center overflow-hidden" : scale > 1 ? "overflow-hidden" : "overflow-auto"} ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
        style={gridStyle}
        onMouseDown={handlePanStart}
        onWheel={handleWheel}
      >
        {!isDesktop && editMode && (
          <p className="p-2 text-center text-xs text-amber-400">Dashboard editing available on desktop.</p>
        )}
        {current && (
          <div className={scale < 1 ? "flex min-h-0 flex-1 items-center justify-center" : ""}>
          <div
            className="inline-block origin-top-left shrink-0"
            style={{
              width: layoutWidth * scale,
              height: layoutBottom * scale,
              margin: scale < 1 ? undefined : 0,
              transform: "translate(" + pan.x + "px, " + pan.y + "px)",
            }}
          >
            <div
              style={{
                width: layoutWidth,
                height: layoutBottom,
                transform: "scale(" + scale + ")",
                transformOrigin: "0 0",
              }}
            >
            <ReactGridLayout
              width={width}
              layout={layout}
              onLayoutChange={handleLayoutChange}
              isDraggable={canEdit}
              isResizable={canEdit}
              gridConfig={{
                cols: 12,
                rowHeight: ROW_H,
                margin: [8, 8],
                containerPadding: [16, 16],
              }}
              dragConfig={{ enabled: canEdit, handle: ".widget-header", bounded: false, threshold: 3 }}
              resizeConfig={{ enabled: canEdit, handles: ["se"] }}
              className={theme.showGridLines !== false && canEdit ? "dashboard-grid-lines" : ""}
              style={{ minHeight: "100%" }}
            >
              {layout.map((item) => (
                <div key={item.i}>
                  <WidgetWrapper
                    id={item.i}
                    widgetId={item.i as WidgetId}
                    editMode={canEdit}
                    onRemove={() => handleRemoveWidget(item.i)}
                    onSettings={() => {}}
                    onRefresh={() => {}}
                  >
                    <WidgetContent widgetId={item.i as WidgetId} />
                  </WidgetWrapper>
                </div>
              ))}
            </ReactGridLayout>
            </div>
          </div>
          </div>
        )}

      </div>

      {/* Save dashboard bar at bottom */}
      {current && (
        <div className="flex shrink-0 items-center justify-center gap-3 border-t border-white/10 py-2" style={{ backgroundColor: HEADER_BG }}>
          <button
            type="button"
            onClick={handleSaveDashboard}
            className="flex items-center gap-2 rounded-lg border border-[var(--accent-color)]/30 bg-[var(--accent-color)]/10 px-4 py-2 text-sm font-medium text-[var(--accent-color)] transition hover:bg-[var(--accent-color)]/20 disabled:opacity-60"
            title="Save dashboard"
            aria-label="Save dashboard"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            Save dashboard
          </button>
          {saveFeedback && <span className="text-sm text-emerald-400">Saved</span>}
        </div>
      )}

      {addPanelOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={() => setAddPanelOpen(false)}>
          <div className="w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#0F1520] p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-zinc-100">Add Widget</h2>
            <input type="search" placeholder="Search widgets..." className="mt-3 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500" />
            <div className="mt-4 space-y-4">
              {CATEGORIES.map((cat) => (
                <div key={cat}>
                  <h3 className="text-xs font-medium uppercase text-zinc-500">{cat}</h3>
                  <div className="mt-2 space-y-2">
                    {(Object.entries(WIDGET_CONFIG) as [WidgetId, typeof WIDGET_CONFIG[WidgetId]][]).filter(([, c]) => c.category === cat).map(([id, c]) => (
                      <div key={id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-3">
                        <div>
                          <p className="text-sm font-medium text-zinc-200">{c.icon ? `${c.icon} ` : ""}{c.name}</p>
                          <p className="text-[11px] text-zinc-500">{c.description}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddWidget(id)}
                          disabled={current?.widgets.includes(id)}
                          className="rounded bg-[var(--accent-color)] px-3 py-1 text-xs font-medium text-[#020308] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {current?.widgets.includes(id) ? "Added ✓" : "Add"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {themePanelOpen && current && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={() => setThemePanelOpen(false)}>
          <div className="w-full max-w-sm overflow-y-auto border-l border-white/10 bg-[#0F1520] p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-zinc-100">Customize Theme</h2>
            <p className="mt-2 text-xs text-zinc-500">Background</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {["#0A0E1A", "#050810", "#0D0D0D", "#0A0E2A", "#0f172a", "#1e1b4b"].map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => {
                    const next = { ...current, theme: { ...current.theme, background: hex } };
                    setCurrent(next);
                    setCustomBgHex(hex);
                  }}
                  className="h-8 w-8 rounded-full border-2 border-white/20"
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
            <p className="mt-3 text-xs text-zinc-500">Custom color</p>
            <div className="mt-2 flex gap-2">
              <input
                type="color"
                value={(customBgHex || (current.theme?.background ?? "#0A0E1A")).slice(0, 7)}
                onChange={(e) => {
                  const hex = e.target.value;
                  const next = { ...current, theme: { ...current.theme, background: hex } };
                  setCurrent(next);
                  setCustomBgHex(hex);
                }}
                className="h-9 w-14 cursor-pointer rounded border border-white/20 bg-transparent"
              />
              <input
                type="text"
                value={customBgHex || (current.theme?.background ?? "#0A0E1A")}
                onChange={(e) => setCustomBgHex(e.target.value)}
                onBlur={(e) => {
                  const v = (e.target as HTMLInputElement).value.trim();
                  const hex = v.startsWith("#") ? v : "#" + v;
                  if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                    const next = { ...current, theme: { ...current.theme, background: hex } };
                    setCurrent(next);
                    setCustomBgHex(hex);
                  } else {
                    setCustomBgHex(current.theme?.background ?? "#0A0E1A");
                  }
                }}
                placeholder="#0A0E1A"
                className="flex-1 rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500"
              />
            </div>
            <p className="mt-4 text-xs font-medium text-zinc-500">Presets</p>
            <p className="text-[11px] text-zinc-600">Replace widgets and fit to view</p>
            <div className="mt-2 space-y-1">
              {DASHBOARD_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    const next = { ...current, layout: preset.layout, widgets: preset.widgets };
                    setCurrent(next);
                    setThemePanelOpen(false);
                    requestAnimationFrame(() => centerView());
                  }}
                  className="block w-full rounded px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/10"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {newDashModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setNewDashModal(false)}>
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0F1520] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-zinc-100">New Dashboard</h2>
            <input type="text" value={newDashName} onChange={(e) => setNewDashName(e.target.value)} placeholder="Dashboard name" className="mt-3 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-zinc-100 placeholder:text-zinc-500" />
            <p className="mt-3 text-xs text-zinc-500">Template</p>
            <div className="mt-2 space-y-1">
              {(["blank", "morning", "crypto", "longterm", "daytrader"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setNewDashTemplate(t)} className={`block w-full rounded px-3 py-2 text-left text-sm ${newDashTemplate === t ? "bg-[var(--accent-color)]/20 text-[var(--accent-color)]" : "text-zinc-400 hover:bg-white/5"}`}>
                  {t === "blank" ? "Blank" : t === "morning" ? "Morning Setup" : t === "crypto" ? "Crypto Trader" : t === "longterm" ? "Long Term Investor" : "Day Trader"}
                </button>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setNewDashModal(false)} className="flex-1 rounded border border-white/20 py-2 text-sm">Cancel</button>
              <button type="button" onClick={handleCreateNew} className="flex-1 rounded bg-[var(--accent-color)] py-2 text-sm font-medium text-[#020308]">Create</button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .dashboard-grid-lines .react-grid-layout {
          background-image: linear-gradient(var(--grid-line-color, #1a2535) 1px, transparent 1px),
            linear-gradient(90deg, var(--grid-line-color, #1a2535) 1px, transparent 1px);
          background-size: calc(100% / 12) 60px;
        }
        .react-grid-item.react-draggable-dragging { opacity: 0.5; user-select: none; }
        .react-grid-item.react-resizable-resizing { user-select: none; }
        .dashboard-page-in-edit .react-grid-item { user-select: none; -webkit-user-select: none; }
      `}</style>
    </div>
  );
}
