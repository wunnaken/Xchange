/**
 * Client-side helpers for watchlist API (Supabase-backed when authenticated).
 * Falls back to localStorage when API returns 401 or fails (e.g. demo auth without Supabase).
 */

const WATCHLIST_LOCAL_KEY = "xchange-watchlist";

export type WatchlistItem = {
  ticker: string;
  name?: string;
  price?: string | number;
  change?: number;
};

function getLocalWatchlist(): WatchlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WATCHLIST_LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((i) => i && typeof i.ticker === "string") : [];
  } catch {
    return [];
  }
}

function setLocalWatchlist(items: WatchlistItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WATCHLIST_LOCAL_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export async function fetchWatchlist(): Promise<WatchlistItem[]> {
  try {
    const res = await fetch("/api/watchlist", { credentials: "include" });
    if (res.status === 401) return getLocalWatchlist();
    if (!res.ok) throw new Error("Failed to load watchlist");
    const data = await res.json();
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return getLocalWatchlist();
  }
}

function addToLocalWatchlist(ticker: string, name?: string): void {
  const list = getLocalWatchlist();
  if (list.some((i) => i.ticker.toUpperCase() === ticker.toUpperCase())) return;
  setLocalWatchlist([...list, { ticker: ticker.toUpperCase(), name: name ?? ticker }]);
}

export async function addToWatchlistApi(item: WatchlistItem): Promise<void> {
  const ticker = String(item.ticker || "").trim().toUpperCase();
  if (!ticker) throw new Error("ticker is required");
  try {
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ticker, name: item.name }),
    });
    if (res.status === 409) return; // already in list
    if (res.ok) return;
    if (res.status === 401 || res.status === 500) {
      addToLocalWatchlist(ticker, item.name);
      return;
    }
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to add to watchlist");
  } catch (e) {
    if (e instanceof TypeError || (e instanceof Error && e.message.includes("fetch"))) {
      addToLocalWatchlist(ticker, item.name);
      return;
    }
    throw e;
  }
}

export async function removeFromWatchlistApi(ticker: string): Promise<void> {
  const upper = ticker.trim().toUpperCase();
  try {
    const res = await fetch(`/api/watchlist?ticker=${encodeURIComponent(ticker)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) return;
    if (res.status === 401 || res.status === 500) {
      const list = getLocalWatchlist().filter((i) => i.ticker.toUpperCase() !== upper);
      setLocalWatchlist(list);
      return;
    }
    throw new Error("Failed to remove from watchlist");
  } catch (e) {
    if (e instanceof TypeError) {
      const list = getLocalWatchlist().filter((i) => i.ticker.toUpperCase() !== upper);
      setLocalWatchlist(list);
      return;
    }
    throw e;
  }
}

export function isTickerInWatchlist(items: WatchlistItem[], ticker: string): boolean {
  const upper = ticker.toUpperCase();
  return items.some((i) => i.ticker.toUpperCase() === upper);
}
