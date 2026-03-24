"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { XchangeLogoImage } from "./XchangeLogoImage";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { MarketTickerBar } from "./MarketTickerBar";
import { useTheme } from "./ThemeContext";
import type { User } from "./AuthContext";
import { getSidebarPrefs, saveSidebarPrefs, type SidebarPrefs } from "../lib/sidebar-preferences";
import { hasBeenWelcomed } from "../lib/briefing";
import { SiteFooter } from "./SiteFooter";
import { VerifiedBadge } from "./VerifiedBadge";
import { useLoginStreakTick } from "./StreakProvider";
import { getPredictNotifications, markPredictNotificationsRead } from "../lib/predict";
import { getInAppNotifications } from "../lib/price-alerts";
import { usePriceContext } from "../lib/price-context";

const SIDEBAR_WIDTH = 220;
const SIDEBAR_BG = "#0A0E1A";

const MAIN_NAV: { href: string; label: string; icon?: "radar" }[] = [
  { href: "/feed", label: "Feed" },
  { href: "/communities", label: "Communities" },
  { href: "/messages", label: "Messages" },
  { href: "/news", label: "News" },
  { href: "/map", label: "Maps" },
  { href: "/bonds", label: "Bonds" },
  { href: "/sentiment", label: "Sentiment Radar" },
  { href: "/growth", label: "Growth" },
  { href: "/ceos", label: "CEOs" },
  { href: "/calendar", label: "Calendar" },
  { href: "/journal", label: "Journal" },
  { href: "/predict", label: "PredictNow" },
  { href: "/datahub", label: "DataHub" },
  { href: "/insider-trades", label: "InsiderTrades" },
  { href: "/watchlist", label: "My Watchlist" },
  { href: "/workspace", label: "Workspace" },
];

const MAIN_NAV_HREFS = MAIN_NAV.map((i) => i.href);

const BOTTOM_NAV: { href: string; label: string }[] = [
  { href: "/settings", label: "Settings" },
  { href: "/feedback", label: "Feedback" },
];

function getInitials(user: User) {
  const name = (user.name || user.username || user.email || "?").trim();
  if (!name) return "?";
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function SidebarLogo({ narrow }: { narrow: boolean }) {
  return (
    <Link
      href="/"
      className={`flex items-center transition opacity-90 hover:opacity-100 ${narrow ? "justify-center" : "gap-2.5"}`}
      aria-label="Xchange – Home"
    >
      <XchangeLogoImage size={42} />
      {!narrow && (
        <span className="text-xl font-semibold tracking-tight" style={{ color: "var(--accent-color)" }}>
          Xchange
        </span>
      )}
    </Link>
  );
}

function NavItem({
  href,
  label,
  icon,
  isActive,
  collapsed,
  onClick,
  customizeMode,
  onHide,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging,
}: {
  href: string;
  label: string;
  icon?: "radar";
  isActive: boolean;
  collapsed: boolean;
  onClick?: () => void;
  customizeMode?: boolean;
  onHide?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
}) {
  const showControls = customizeMode && !collapsed && onHide !== undefined;

  return (
    <div
      className={`group flex items-center gap-1 rounded-lg transition-colors duration-200 hover:bg-white/5 ${isDragging ? "opacity-50" : ""}`}
      draggable={draggable}
      onDragStart={draggable && onDragStart ? (e) => { e.dataTransfer?.setData("text/plain", href); onDragStart(e); } : undefined}
      onDragOver={draggable ? onDragOver : undefined}
      onDrop={draggable ? onDrop : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
    >
      {customizeMode && !collapsed && (
        <span
          className="cursor-grab touch-none shrink-0 rounded p-1 text-zinc-500 hover:text-zinc-400 active:cursor-grabbing"
          aria-hidden
          title="Drag to reorder"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 6h2v2H8V6zm0 5h2v2H8v-2zm0 5h2v2H8v-2zm5-10h2v2h-2V6zm0 5h2v2h-2v-2zm0 5h2v2h-2v-2z" />
          </svg>
        </span>
      )}
      <Link
        href={href}
        onClick={onClick}
        className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
          isActive ? "bg-[var(--accent-color)]/20 text-[var(--accent-color)]" : "text-zinc-400 hover:text-[var(--accent-color)]"
        } ${collapsed ? "justify-center px-2" : ""}`}
        title={collapsed ? label : undefined}
        aria-current={isActive ? "page" : undefined}
      >
        <span className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center">
          {icon === "radar" ? (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          ) : (
            <span
              className={`h-1.5 w-1.5 rounded-full transition-transform transition-opacity duration-200 ${
                isActive
                  ? "scale-125 bg-[var(--accent-color)] opacity-100"
                  : "bg-zinc-500 opacity-40 group-hover:opacity-100 group-hover:scale-125"
              }`}
            />
          )}
        </span>
        {!collapsed && (
          <span className="truncate transform text-sm transition-transform duration-150 group-hover:translate-x-0.5 group-hover:scale-105">
            {label}
          </span>
        )}
      </Link>
      {showControls && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onHide?.(); }}
          className="shrink-0 rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-red-400"
          aria-label={`Hide ${label}`}
          title="Hide from sidebar"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [hiddenPanelOpen, setHiddenPanelOpen] = useState(false);
  const [inAppNotifs, setInAppNotifs] = useState<ReturnType<typeof getInAppNotifications>>([]);
  const [notificationCount, setNotificationCount] = useState(0);
  const profileRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const messagesDropdownRef = useRef<HTMLDivElement>(null);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [recentDms, setRecentDms] = useState<{ id: string; other_user: { name: string; username: string } | null; last_message_preview: string | null; last_message_at: string }[]>([]);

  useEffect(() => {
    setInAppNotifs(getInAppNotifications());
    const onChange = () => setInAppNotifs(getInAppNotifications());
    window.addEventListener("xchange-in-app-notifications-changed", onChange);
    return () => window.removeEventListener("xchange-in-app-notifications-changed", onChange);
  }, []);

  useEffect(() => {
    const n = inAppNotifs.length + getPredictNotifications().length;
    setNotificationCount(Math.min(99, n));
  }, [inAppNotifs.length]);
  const hiddenPanelRef = useRef<HTMLDivElement>(null);

  const { connectionState } = usePriceContext();
  const [customizeMode, setCustomizeMode] = useState(false);
  const [prefs, setPrefs] = useState<SidebarPrefs>(() => ({
    order: [...MAIN_NAV_HREFS],
    hidden: [],
    collapsed: false,
  }));
  const [windowWidth, setWindowWidth] = useState(1024);

  useLoginStreakTick();

  useEffect(() => {
    const onResize = () => setWindowWidth(typeof window !== "undefined" ? window.innerWidth : 1024);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    setPrefs(getSidebarPrefs(MAIN_NAV_HREFS));
    const onStorage = () => setPrefs(getSidebarPrefs(MAIN_NAV_HREFS));
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const visibleOrder = prefs.order.filter((href) => !prefs.hidden.includes(href));
  const hiddenItems = prefs.hidden
    .map((href) => MAIN_NAV.find((i) => i.href === href))
    .filter((i): i is (typeof MAIN_NAV)[number] => i != null);

  const savePrefs = useCallback((next: SidebarPrefs) => {
    setPrefs(next);
    saveSidebarPrefs(next);
  }, []);

  const [draggingHref, setDraggingHref] = useState<string | null>(null);
  const [showWelcomeOverlay, setShowWelcomeOverlay] = useState(false);
  const verified = user?.isVerified ?? false;
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetchUnread = () => {
      fetch("/api/conversations/unread")
        .then((r) => r.json())
        .then((d: { count: number }) => setUnreadMessages(d.count ?? 0))
        .catch(() => {});
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (!hasBeenWelcomed()) {
      setShowWelcomeOverlay(true);
    }
  }, [user]);

  const moveTo = useCallback(
    (fromHref: string, toHref: string) => {
      if (fromHref === toHref) return;
      const nextOrder = prefs.order.filter((h) => h !== fromHref);
      const toIdx = nextOrder.indexOf(toHref);
      if (toIdx < 0) return;
      nextOrder.splice(toIdx, 0, fromHref);
      savePrefs({ ...prefs, order: nextOrder });
    },
    [prefs, savePrefs]
  );

  const hideTab = useCallback(
    (href: string) => {
      savePrefs({ ...prefs, hidden: [...prefs.hidden, href] });
    },
    [prefs, savePrefs]
  );

  const restoreTab = useCallback(
    (href: string) => {
      savePrefs({ ...prefs, hidden: prefs.hidden.filter((h) => h !== href) });
      setHiddenPanelOpen(false);
    },
    [prefs, savePrefs]
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) setProfileOpen(false);
      if (notificationsRef.current && !notificationsRef.current.contains(target)) setNotificationsOpen(false);
      if (hiddenPanelRef.current && !hiddenPanelRef.current.contains(target)) setHiddenPanelOpen(false);
      if (messagesDropdownRef.current && !messagesDropdownRef.current.contains(target)) setMessagesOpen(false);
    };
    if (profileOpen || notificationsOpen || hiddenPanelOpen || messagesOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [profileOpen, notificationsOpen, hiddenPanelOpen, messagesOpen]);

  const isActive = useCallback(
    (href: string) => {
      if (href === "/feed") return pathname === "/feed";
      if (href === "/workspace") return pathname === "/ai" || pathname === "/dashboard" || pathname === "/whiteboard";
      return pathname === href || pathname.startsWith(href + "/");
    },
    [pathname]
  );

  const isNarrowScreen = windowWidth < 1024;
  const collapsed = isNarrowScreen || prefs.collapsed;
  const sidebarWidth = collapsed ? (sidebarOpen ? SIDEBAR_WIDTH : 72) : SIDEBAR_WIDTH;
  const narrow = collapsed && !sidebarOpen;

  const toggleSidebarCollapsed = useCallback(() => {
    const next = { ...prefs, collapsed: !prefs.collapsed };
    setPrefs(next);
    saveSidebarPrefs(next);
  }, [prefs]);

  return (
    <div className="min-h-screen app-page font-[&quot;Times_New_Roman&quot;,serif]" style={{ paddingLeft: sidebarWidth }}>
      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-50 flex h-full flex-col border-r border-white/10 transition-all duration-200 ${
          collapsed && !sidebarOpen ? "" : ""
        }`}
        style={{
          width: sidebarWidth,
          backgroundColor: SIDEBAR_BG,
        }}
      >
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
        )}

        <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-white/10 px-3 lg:justify-start">
          <div className={narrow ? "flex w-full justify-center" : ""}>
            <SidebarLogo narrow={narrow} />
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded p-2 text-zinc-400 hover:bg-white/5 hover:text-zinc-200 lg:hidden"
            aria-label="Close menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search bar */}
        <div className="border-b border-white/10 px-3 py-3">
          <Link
            href="/search"
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-left text-sm text-zinc-500 transition-colors hover:border-[var(--accent-color)]/30 hover:bg-white/10 hover:text-zinc-300"
            aria-label="Search any stock, crypto, forex"
          >
            <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {!collapsed && <span className="truncate">Search any stock, crypto, forex...</span>}
          </Link>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" aria-label="Main navigation">
          {visibleOrder.map((href) => {
            const item = MAIN_NAV.find((i) => i.href === href);
            if (!item) return null;
            return (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                isActive={isActive(item.href)}
                collapsed={collapsed}
                onClick={() => setSidebarOpen(false)}
                customizeMode={customizeMode}
                onHide={() => hideTab(item.href)}
                draggable={customizeMode}
                onDragStart={() => setDraggingHref(item.href)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggingHref) moveTo(draggingHref, item.href);
                  setDraggingHref(null);
                }}
                onDragEnd={() => setDraggingHref(null)}
                isDragging={draggingHref === item.href}
              />
            );
          })}
          <div className={`mt-1 flex flex-col gap-0.5 ${collapsed ? "items-center" : ""}`}>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setCustomizeMode((m) => !m)}
                className="min-w-0 flex-1 rounded-lg px-3 py-2 text-left text-xs font-medium text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-400"
              >
                {customizeMode ? (collapsed ? "✓" : "Done") : (collapsed ? "⋯" : "Customize sidebar")}
              </button>
              {!isNarrowScreen && (
                <button
                  type="button"
                  onClick={toggleSidebarCollapsed}
                  className="shrink-0 rounded p-2 text-zinc-500 transition-colors hover:bg-white/5 hover:text-[var(--accent-color)]"
                  title={prefs.collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  aria-label={prefs.collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  {prefs.collapsed ? (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M18 19l-7-7 7-7" /></svg>
                  )}
                </button>
              )}
            </div>
            {prefs.hidden.length > 0 && (
              <div className="relative" ref={hiddenPanelRef}>
                <button
                  type="button"
                  onClick={() => setHiddenPanelOpen((o) => !o)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-400"
                  aria-expanded={hiddenPanelOpen}
                  aria-label={`${prefs.hidden.length} hidden tabs`}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white/10 text-[10px]">
                    👁‍🗨
                  </span>
                  {!collapsed && (
                    <>
                      <span>Hidden tabs</span>
                      <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">{prefs.hidden.length}</span>
                    </>
                  )}
                </button>
                {hiddenPanelOpen && (
                  <div
                    className={`absolute top-full z-50 mt-1 min-w-[180px] rounded-xl border border-white/10 bg-[#0F1520] py-2 shadow-xl ${collapsed ? "left-full ml-1" : "left-0"}`}
                    role="menu"
                  >
                    <p className="px-3 py-1.5 text-xs text-zinc-500">Click Restore to show again</p>
                    {hiddenItems.map((item) => (
                      <button
                        key={item.href}
                        type="button"
                        onClick={() => restoreTab(item.href)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/5 hover:text-[var(--accent-color)]"
                        role="menuitem"
                      >
                        <span className="relative flex h-4 w-4 flex-shrink-0 items-center justify-center">
                          <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 opacity-60" />
                        </span>
                        <span className="truncate">{item.label}</span>
                        <span className="ml-auto text-xs text-[var(--accent-color)]">Restore</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </nav>

        <div className="border-t border-white/10 p-3 space-y-0.5">
          {BOTTOM_NAV.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              isActive={isActive(item.href)}
              collapsed={collapsed}
              onClick={() => setSidebarOpen(false)}
            />
          ))}
          {verified ? (
            <div className={`group flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 ${collapsed ? "items-center justify-center px-2" : ""}`} title="Verified Trader">
              <div className="flex min-w-0 items-center gap-3">
                <span className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center">
                  <VerifiedBadge size={16} />
                </span>
                {!collapsed && <span className="truncate">Verified Trader</span>}
              </div>
            </div>
          ) : (
            <Link
              href="/verify"
              onClick={() => setSidebarOpen(false)}
              className={`group flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 transition-colors duration-200 hover:bg-white/5 hover:text-[var(--accent-color)] ${collapsed ? "justify-center px-2" : ""}`}
              title={collapsed ? "Get Verified" : undefined}
            >
              <span className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 opacity-40 transition-transform transition-opacity duration-200 group-hover:scale-125 group-hover:opacity-100 group-hover:bg-[var(--accent-color)]" />
              </span>
              {!collapsed && <span className="truncate transition-transform duration-150 group-hover:translate-x-0.5 group-hover:scale-105">Get Verified</span>}
            </Link>
          )}
        </div>
      </aside>

      {/* Top navbar */}
      <header
        className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b px-4 backdrop-blur"
        style={{ borderColor: "var(--app-border)", backgroundColor: "var(--app-navbar-bg)", color: "var(--app-navbar-text)" }}
        role="banner"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link
            href="/watchlist"
            className="flex shrink-0 items-center justify-center rounded p-2 text-zinc-400 transition-colors hover:bg-white/5 hover:text-[var(--accent-color)]"
            aria-label="My Watchlist"
            title="My Watchlist"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1 flex items-center gap-1.5">
            <MarketTickerBar />
            <span
              className="shrink-0 rounded-full p-1"
              title={
                connectionState === "connected"
                  ? "Live prices via Finnhub WebSocket"
                  : connectionState === "connecting"
                    ? "Reconnecting…"
                    : "Using cached prices"
              }
              aria-label={
                connectionState === "connected"
                  ? "Live prices"
                  : connectionState === "connecting"
                    ? "Reconnecting"
                    : "Cached prices"
              }
            >
              <span
                className={`block h-1.5 w-1.5 rounded-full ${
                  connectionState === "connected"
                    ? "bg-emerald-400"
                    : connectionState === "connecting"
                      ? "bg-amber-400 animate-pulse"
                      : "bg-red-500/80"
                }`}
              />
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {/* Notifications */}
          <div className="relative" ref={notificationsRef}>
            <button
              type="button"
              onClick={() => { setNotificationsOpen((o) => !o); setNotificationCount(0); }}
              className="relative rounded p-2 text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {notificationCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent-color)] text-[10px] font-bold text-[#020308] ring-2 ring-[#0A0E1A]" suppressHydrationWarning>
                  {notificationCount}
                </span>
              )}
            </button>
            {notificationsOpen && (
              <div
                className="absolute right-0 top-full z-50 mt-1 w-80 animate-[fadeIn_0.15s_ease-out] rounded-xl border border-white/10 py-2 shadow-xl"
                style={{ backgroundColor: "#0F1520" }}
                role="menu"
              >
                <button
                  type="button"
                  onClick={() => { markPredictNotificationsRead(); setNotificationsOpen(false); }}
                  className="w-full px-4 py-2 text-left text-xs font-medium text-[var(--accent-color)] hover:bg-white/5"
                >
                  Mark all as read
                </button>
                <div className="my-1 h-px bg-white/10" />
                {inAppNotifs.length > 0 && (
                  <>
                    {inAppNotifs.slice(0, 5).map((n) => (
                      <Link key={n.id} href={n.link} onClick={() => setNotificationsOpen(false)} className="flex items-start gap-3 px-4 py-2.5 hover:bg-white/5">
                        <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                        <div>
                          <p className="text-sm font-medium text-zinc-200">{n.message}</p>
                          <p className="text-xs text-zinc-500">{new Date(n.time).toLocaleString()}</p>
                        </div>
                      </Link>
                    ))}
                    <div className="my-1 h-px bg-white/10" />
                  </>
                )}
                {typeof window !== "undefined" && getPredictNotifications().length > 0 && (
                  <>
                    {getPredictNotifications().slice(0, 4).map((n) => (
                      <Link key={n.id} href={n.link} onClick={() => setNotificationsOpen(false)} className="flex items-start gap-3 px-4 py-2.5 hover:bg-white/5">
                        <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                        <div>
                          <p className="text-sm font-medium text-zinc-200">{n.message}</p>
                          <p className="text-xs text-zinc-500">{new Date(n.time).toLocaleDateString()}</p>
                        </div>
                      </Link>
                    ))}
                    <div className="my-1 h-px bg-white/10" />
                  </>
                )}
                {inAppNotifs.length === 0 && getPredictNotifications().length === 0 && (
                  <p className="px-4 py-3 text-sm text-zinc-500">No new notifications</p>
                )}
              </div>
            )}
          </div>
          {/* Messages dropdown */}
          <div className="relative" ref={messagesDropdownRef}>
            <button
              type="button"
              onClick={() => {
                const next = !messagesOpen;
                setMessagesOpen(next);
                if (next && user) {
                  fetch("/api/conversations")
                    .then((r) => r.json())
                    .then((d: { dms?: typeof recentDms }) => setRecentDms((d.dms ?? []).slice(0, 5)))
                    .catch(() => {});
                }
              }}
              className="relative rounded p-2 text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
              aria-label="Messages"
              aria-expanded={messagesOpen}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {unreadMessages > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--accent-color)] px-0.5 text-[10px] font-bold text-[#020308]">
                  {unreadMessages > 99 ? "99+" : unreadMessages}
                </span>
              )}
            </button>
            {messagesOpen && (
              <div
                className="absolute right-0 top-full z-50 mt-1 w-72 animate-[fadeIn_0.15s_ease-out] rounded-xl border border-white/10 py-2 shadow-xl"
                style={{ backgroundColor: "#0F1520" }}
                role="menu"
              >
                <div className="flex items-center justify-between px-4 py-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Messages</span>
                  <Link
                    href="/messages"
                    onClick={() => setMessagesOpen(false)}
                    className="text-xs text-[var(--accent-color)] hover:underline"
                  >
                    Open all
                  </Link>
                </div>
                <div className="my-1 h-px bg-white/10" />
                {recentDms.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-zinc-500">No recent messages</p>
                ) : (
                  recentDms.map((dm) => (
                    <Link
                      key={dm.id}
                      href={`/messages?dm=${dm.id}`}
                      onClick={() => setMessagesOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-[var(--accent-color)]">
                        {(dm.other_user?.name || dm.other_user?.username || "?")[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-200">
                          {dm.other_user?.name || dm.other_user?.username || "Unknown"}
                        </p>
                        {dm.last_message_preview && (
                          <p className="truncate text-xs text-zinc-500">{dm.last_message_preview}</p>
                        )}
                      </div>
                    </Link>
                  ))
                )}
                <div className="my-1 h-px bg-white/10" />
                <Link
                  href="/messages"
                  onClick={() => setMessagesOpen(false)}
                  className="block px-4 py-2 text-center text-xs text-[var(--accent-color)] hover:bg-white/5"
                >
                  View all messages
                </Link>
              </div>
            )}
          </div>
          {/* Profile dropdown */}
          <div className="relative" ref={profileRef}>
            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => setProfileOpen((o) => !o)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-zinc-300 transition hover:border-[var(--accent-color)]/50 hover:bg-white/5 hover:text-[var(--accent-color)]"
                  aria-label="User menu"
                  aria-expanded={profileOpen}
                  aria-haspopup="true"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </button>
                {profileOpen && (
                  <div
                    className="absolute right-0 top-full z-50 mt-1 min-w-[220px] animate-[fadeIn_0.15s_ease-out] rounded-xl border border-white/10 py-2 shadow-xl"
                    style={{ backgroundColor: "#0F1520" }}
                    role="menu"
                  >
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-[var(--accent-color)]">
                          {getInitials(user)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-100">{user.name || "Trader"}</p>
                          <p className="truncate text-xs text-zinc-500">@{user.username?.trim() || "trader"}</p>
                        </div>
                      </div>
                    </div>
                    <div className="my-2 h-px bg-white/10" />
                    <Link
                      href="/profile"
                      onClick={() => setProfileOpen(false)}
                      className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 transition-colors duration-200 hover:bg-white/5 hover:text-[var(--accent-color)]"
                      role="menuitem"
                    >
                      <span className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center">
                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 opacity-40 transition-transform transition-opacity duration-200 group-hover:opacity-100 group-hover:scale-125" />
                      </span>
                      <span className="truncate transition-transform duration-150 group-hover:translate-x-0.5 group-hover:scale-105">View Profile</span>
                    </Link>
                    <Link
                      href="/growth#choose-profile"
                      onClick={() => setProfileOpen(false)}
                      className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 transition-colors duration-200 hover:bg-white/5 hover:text-[var(--accent-color)]"
                      role="menuitem"
                    >
                      <span className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center">
                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 opacity-40 transition-transform transition-opacity duration-200 group-hover:opacity-100 group-hover:scale-125" />
                      </span>
                      <span className="truncate transition-transform duration-150 group-hover:translate-x-0.5 group-hover:scale-105">My Risk Profile</span>
                    </Link>
                    <div className="my-2 h-px bg-white/10" />
                    <div className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 transition-colors duration-200 hover:bg-white/5">
                      <span className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center">
                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 opacity-40 transition-transform transition-opacity duration-200 group-hover:opacity-100 group-hover:scale-125" />
                      </span>
                      <span className="truncate transition-transform duration-150 group-hover:translate-x-0.5 group-hover:scale-105">Appearance</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={theme === "light"}
                        aria-label="Toggle dark/light mode"
                        onClick={(e) => { e.preventDefault(); setTheme(theme === "dark" ? "light" : "dark"); }}
                        className="relative ml-auto h-6 w-11 flex-shrink-0 rounded-full transition-colors"
                        style={{ backgroundColor: theme === "dark" ? "#374151" : "var(--accent-color)" }}
                      >
                        <span
                          className="absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow transition-transform"
                          style={{ transform: theme === "light" ? "translateX(20px)" : "translateX(0)" }}
                        />
                      </button>
                    </div>
                    <div className="my-2 h-px bg-white/10" />
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        signOut();
                        router.push("/");
                      }}
                      className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 transition-colors duration-200 hover:bg-white/5 hover:text-red-400"
                      role="menuitem"
                    >
                      <span className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center">
                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 opacity-40 transition-transform transition-opacity duration-200 group-hover:opacity-100 group-hover:scale-125" />
                      </span>
                      <span className="truncate transition-transform duration-150 group-hover:translate-x-0.5 group-hover:scale-105">Sign Out</span>
                    </button>
                  </div>
                )}
              </>
            ) : (
              <Link
                href="/auth/sign-in"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-zinc-300 transition hover:border-[var(--accent-color)]/50 hover:bg-white/5 hover:text-[var(--accent-color)]"
                aria-label="Sign in"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className={pathname === "/ceos" || pathname === "/dashboard" || pathname === "/messages" ? "h-[calc(100vh-3.5rem)] min-h-0 overflow-hidden" : "min-h-[calc(100vh-3.5rem)]"}>{children}</main>
      {pathname !== "/ceos" && pathname !== "/dashboard" && pathname !== "/messages" && <SiteFooter />}
    </div>
  );
}
