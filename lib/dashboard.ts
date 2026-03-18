/**
 * Custom Dashboard — layout, widgets config, localStorage persistence.
 */

export type LayoutItem = { i: string; x: number; y: number; w: number; h: number; minW?: number; minH?: number; maxW?: number; maxH?: number };

export type WidgetId =
  | "watchlist"
  | "market-overview"
  | "live-chart"
  | "news-feed"
  | "ai-assistant"
  | "fear-greed"
  | "journal-summary"
  | "streaks"
  | "economic-calendar"
  | "prediction-markets"
  | "ceo-alerts"
  | "crypto-dashboard"
  | "community-feed"
  | "xp-rank"
  | "custom-note"
  | "sector-heatmap"
  | "top-movers"
  | "sentiment-radar";

export type DashboardTheme = {
  background?: string;
  backgroundImage?: string;
  backgroundBlur?: number;
  backgroundOpacity?: number;
  widgetBg?: string;
  widgetBorder?: "none" | "subtle" | "glow";
  widgetRadius?: "sharp" | "rounded" | "pill";
  gridLineColor?: string;
  showGridLines?: boolean;
  accentColor?: string;
};

export type DashboardPreset = { name: string; layout: LayoutItem[]; widgets: WidgetId[] };

export const DASHBOARD_PRESETS: DashboardPreset[] = [
  {
    name: "Crypto",
    layout: [
      { i: "market-overview", x: 0, y: 0, w: 4, h: 4, minW: 3, minH: 3 },
      { i: "crypto-dashboard", x: 4, y: 0, w: 4, h: 4, minW: 3, minH: 3 },
      { i: "fear-greed", x: 8, y: 0, w: 2, h: 4, minW: 2, minH: 3 },
      { i: "news-feed", x: 0, y: 4, w: 6, h: 5, minW: 3, minH: 4 },
      { i: "prediction-markets", x: 6, y: 4, w: 4, h: 5, minW: 3, minH: 3 },
    ],
    widgets: ["market-overview", "crypto-dashboard", "fear-greed", "news-feed", "prediction-markets"],
  },
  {
    name: "Morning",
    layout: [
      { i: "news-feed", x: 0, y: 0, w: 6, h: 5, minW: 3, minH: 4 },
      { i: "economic-calendar", x: 6, y: 0, w: 4, h: 5, minW: 3, minH: 3 },
      { i: "market-overview", x: 0, y: 5, w: 4, h: 4, minW: 3, minH: 3 },
      { i: "ai-assistant", x: 4, y: 5, w: 3, h: 5, minW: 3, minH: 4 },
    ],
    widgets: ["news-feed", "economic-calendar", "market-overview", "ai-assistant"],
  },
  {
    name: "Day Trader",
    layout: [
      { i: "live-chart", x: 0, y: 0, w: 6, h: 5, minW: 4, minH: 4 },
      { i: "top-movers", x: 6, y: 0, w: 3, h: 4, minW: 2, minH: 3 },
      { i: "market-overview", x: 0, y: 5, w: 4, h: 4, minW: 3, minH: 3 },
      { i: "news-feed", x: 4, y: 5, w: 5, h: 5, minW: 3, minH: 4 },
    ],
    widgets: ["live-chart", "top-movers", "market-overview", "news-feed"],
  },
];

export type SavedDashboard = {
  id: string;
  name: string;
  layout: LayoutItem[];
  widgets: WidgetId[];
  theme: DashboardTheme;
  updatedAt: string;
};

const STORAGE_PREFIX = "xchange-dashboard-";
const LIST_KEY = "xchange-dashboard-list";
const LAST_DASHBOARD_ID_KEY = "xchange-dashboard-last-id";
const MAX_DASHBOARDS = 4;

export function getLastDashboardId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_DASHBOARD_ID_KEY);
}

export function setLastDashboardId(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_DASHBOARD_ID_KEY, id);
}

const DEFAULT_THEME: DashboardTheme = {
  background: "#0A0E1A",
  widgetBg: "#0F1520",
  widgetBorder: "subtle",
  widgetRadius: "rounded",
  gridLineColor: "#1a2535",
  showGridLines: true,
};

export const WIDGET_CONFIG: Record<
  WidgetId,
  { name: string; icon: string; minW: number; minH: number; defaultW: number; defaultH: number; category: string; description: string }
> = {
  watchlist: { name: "Watchlist", icon: "", minW: 3, minH: 3, defaultW: 4, defaultH: 4, category: "Market Data", description: "Your watchlist tickers with prices and sparklines" },
  "market-overview": { name: "Market Overview", icon: "", minW: 3, minH: 3, defaultW: 4, defaultH: 4, category: "Market Data", description: "Major indices: SPY, QQQ, DXY, VIX, BTC" },
  "live-chart": { name: "Live Chart", icon: "", minW: 4, minH: 4, defaultW: 6, defaultH: 5, category: "Market Data", description: "TradingView-style chart with timeframe toggles" },
  "news-feed": { name: "News Feed", icon: "", minW: 3, minH: 4, defaultW: 6, defaultH: 6, category: "Social", description: "Latest headlines with source and time" },
  "ai-assistant": { name: "AI Assistant", icon: "", minW: 3, minH: 4, defaultW: 3, defaultH: 6, category: "AI & Analysis", description: "Mini chat with Claude" },
  "fear-greed": { name: "Fear & Greed", icon: "", minW: 2, minH: 3, defaultW: 2, defaultH: 4, category: "Market Data", description: "Crypto fear & greed gauge" },
  "journal-summary": { name: "Trade Journal Summary", icon: "", minW: 2, minH: 3, defaultW: 3, defaultH: 4, category: "Personal", description: "Win rate, P&L, open trades" },
  streaks: { name: "Streaks", icon: "", minW: 2, minH: 2, defaultW: 2, defaultH: 3, category: "Personal", description: "Login, journal, briefing streaks" },
  "economic-calendar": { name: "Economic Calendar", icon: "", minW: 3, minH: 3, defaultW: 4, defaultH: 5, category: "Market Data", description: "Today and tomorrow events" },
  "prediction-markets": { name: "Prediction Markets", icon: "", minW: 3, minH: 3, defaultW: 4, defaultH: 5, category: "Tools", description: "Trending markets and your XP" },
  "ceo-alerts": { name: "CEO Alerts", icon: "", minW: 2, minH: 2, defaultW: 3, defaultH: 3, category: "Market Data", description: "Recent CEO changes and news" },
  "crypto-dashboard": { name: "Crypto Dashboard", icon: "", minW: 3, minH: 3, defaultW: 4, defaultH: 4, category: "Market Data", description: "BTC dominance, top crypto, fear & greed" },
  "community-feed": { name: "Community Feed", icon: "", minW: 3, minH: 4, defaultW: 4, defaultH: 6, category: "Social", description: "Latest posts from communities" },
  "xp-rank": { name: "XP & Rank", icon: "", minW: 2, minH: 2, defaultW: 2, defaultH: 3, category: "Personal", description: "Current XP and rank progress" },
  "custom-note": { name: "Custom Note", icon: "", minW: 2, minH: 2, defaultW: 3, defaultH: 3, category: "Custom", description: "Trading notes and reminders" },
  "sector-heatmap": { name: "Sector Heatmap", icon: "", minW: 4, minH: 3, defaultW: 6, defaultH: 4, category: "Market Data", description: "11 sector performance tiles" },
  "top-movers": { name: "Top Movers", icon: "", minW: 2, minH: 3, defaultW: 3, defaultH: 4, category: "Market Data", description: "Top gainers and losers today" },
  "sentiment-radar": { name: "Sentiment Radar", icon: "", minW: 4, minH: 4, defaultW: 6, defaultH: 5, category: "Market Data", description: "Community and news sentiment by sector" },
};

function defaultLayout(): LayoutItem[] {
  const c = WIDGET_CONFIG;
  return [
    { i: "watchlist", x: 0, y: 0, w: 4, h: 4, minW: c.watchlist.minW, minH: c.watchlist.minH },
    { i: "market-overview", x: 4, y: 0, w: 4, h: 4, minW: c["market-overview"].minW, minH: c["market-overview"].minH },
    { i: "fear-greed", x: 8, y: 0, w: 2, h: 4, minW: c["fear-greed"].minW, minH: c["fear-greed"].minH },
    { i: "streaks", x: 10, y: 0, w: 2, h: 4, minW: c.streaks.minW, minH: c.streaks.minH },
    { i: "news-feed", x: 0, y: 4, w: 6, h: 6, minW: c["news-feed"].minW, minH: c["news-feed"].minH },
    { i: "ai-assistant", x: 6, y: 4, w: 3, h: 6, minW: c["ai-assistant"].minW, minH: c["ai-assistant"].minH },
    { i: "journal-summary", x: 9, y: 4, w: 3, h: 6, minW: c["journal-summary"].minW, minH: c["journal-summary"].minH },
    { i: "prediction-markets", x: 0, y: 10, w: 4, h: 5, minW: c["prediction-markets"].minW, minH: c["prediction-markets"].minH },
    { i: "economic-calendar", x: 4, y: 10, w: 4, h: 5, minW: c["economic-calendar"].minW, minH: c["economic-calendar"].minH },
  ];
}

function defaultWidgets(): WidgetId[] {
  return ["watchlist", "market-overview", "fear-greed", "streaks", "news-feed", "ai-assistant", "journal-summary", "prediction-markets", "economic-calendar"];
}

export function getDefaultDashboard(name: string): SavedDashboard {
  return {
    // `dashboards.id` is bigint in Supabase, so keep IDs numeric-only.
    id: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
    name: name || "My Dashboard",
    layout: defaultLayout(),
    widgets: defaultWidgets(),
    theme: { ...DEFAULT_THEME },
    updatedAt: new Date().toISOString(),
  };
}

export function getDashboardList(): SavedDashboard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LIST_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as SavedDashboard[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function getDashboard(id: string): SavedDashboard | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + id);
    if (!raw) return null;
    return JSON.parse(raw) as SavedDashboard;
  } catch {
    return null;
  }
}

export function saveDashboard(dash: SavedDashboard): void {
  if (typeof window === "undefined") return;
  try {
    const updated = { ...dash, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(STORAGE_PREFIX + dash.id, JSON.stringify(updated));
    const list = getDashboardList();
    const idx = list.findIndex((d) => d.id === dash.id);
    const next = idx >= 0 ? [...list] : [...list, updated];
    if (idx >= 0) next[idx] = updated;
    else next.push(updated);
    window.localStorage.setItem(LIST_KEY, JSON.stringify(next.slice(0, MAX_DASHBOARDS)));
  } catch {
    // ignore
  }
}

export function deleteDashboard(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_PREFIX + id);
    const list = getDashboardList().filter((d) => d.id !== id);
    window.localStorage.setItem(LIST_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function createNewDashboard(name: string, template: "blank" | "morning" | "crypto" | "longterm" | "daytrader"): SavedDashboard {
  // `dashboards.id` is bigint in Supabase, so keep IDs numeric-only.
  const id = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  let layout: LayoutItem[] = [];
  let widgets: WidgetId[] = [];

  if (template === "blank") {
    layout = [];
    widgets = [];
  } else if (template === "morning") {
    layout = [
      { i: "news-feed", x: 0, y: 0, w: 6, h: 5, minW: 3, minH: 4 },
      { i: "economic-calendar", x: 6, y: 0, w: 4, h: 5, minW: 3, minH: 3 },
      { i: "market-overview", x: 0, y: 5, w: 4, h: 4, minW: 3, minH: 3 },
      { i: "ai-assistant", x: 4, y: 5, w: 3, h: 5, minW: 3, minH: 4 },
    ];
    widgets = ["news-feed", "economic-calendar", "market-overview", "ai-assistant"];
  } else if (template === "crypto") {
    layout = [
      { i: "crypto-dashboard", x: 0, y: 0, w: 4, h: 4, minW: 3, minH: 3 },
      { i: "live-chart", x: 4, y: 0, w: 6, h: 5, minW: 4, minH: 4 },
      { i: "fear-greed", x: 0, y: 4, w: 2, h: 4, minW: 2, minH: 3 },
      { i: "news-feed", x: 2, y: 4, w: 6, h: 4, minW: 3, minH: 4 },
    ];
    widgets = ["crypto-dashboard", "live-chart", "fear-greed", "news-feed"];
  } else if (template === "longterm") {
    layout = [
      { i: "watchlist", x: 0, y: 0, w: 4, h: 4, minW: 3, minH: 3 },
      { i: "sector-heatmap", x: 4, y: 0, w: 6, h: 4, minW: 4, minH: 3 },
      { i: "ceo-alerts", x: 0, y: 4, w: 3, h: 3, minW: 2, minH: 2 },
      { i: "journal-summary", x: 3, y: 4, w: 3, h: 4, minW: 2, minH: 3 },
    ];
    widgets = ["watchlist", "sector-heatmap", "ceo-alerts", "journal-summary"];
  } else {
    layout = [
      { i: "live-chart", x: 0, y: 0, w: 6, h: 5, minW: 4, minH: 4 },
      { i: "top-movers", x: 6, y: 0, w: 3, h: 4, minW: 2, minH: 3 },
      { i: "market-overview", x: 0, y: 5, w: 4, h: 4, minW: 3, minH: 3 },
      { i: "news-feed", x: 4, y: 5, w: 5, h: 5, minW: 3, minH: 4 },
      { i: "streaks", x: 9, y: 5, w: 2, h: 3, minW: 2, minH: 2 },
    ];
    widgets = ["live-chart", "top-movers", "market-overview", "news-feed", "streaks"];
  }

  const dash: SavedDashboard = {
    id,
    name,
    layout,
    widgets,
    theme: { ...DEFAULT_THEME },
    updatedAt: new Date().toISOString(),
  };
  saveDashboard(dash);
  return dash;
}

export const DEFAULT_THEME_STATE = DEFAULT_THEME;
export const MAX_DASHBOARDS_COUNT = MAX_DASHBOARDS;
