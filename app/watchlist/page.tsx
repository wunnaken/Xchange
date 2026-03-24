"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchWatchlistWithStatus,
  migrateLocalWatchlistToApi,
  removeFromWatchlistApi,
  getWatchlistSyncIssue,
  type WatchlistItem,
} from "../../lib/watchlist-api";
import {
  isNearTrigger,
  addInAppNotification,
  type PriceAlert,
  MAX_ALERTS_FREE,
} from "../../lib/price-alerts";
import {
  fetchPriceAlertsCloud,
  migrateLocalAlertsToCloud,
  updatePriceAlertCloud,
  deletePriceAlertCloud,
  getPriceAlertSyncIssue,
} from "../../lib/price-alerts-cloud";
import { PriceAlertModal } from "../../components/PriceAlertModal";
import { useToast } from "../../components/ToastContext";
import { useLivePrices } from "../../lib/hooks/useLivePrice";
import { getFinnhubWS } from "../../lib/finnhub-websocket";
import { PriceDisplay } from "../../components/PriceDisplay";
import {
  DEFAULT_TICKERS,
  fetchTickerBarConfig,
  saveTickerBarConfig,
} from "../../lib/ticker-bar-api";

const WatchlistChart = dynamic(() => import("./WatchlistChart"), { ssr: false });

const MAX_HEADER_TICKERS = 12;

function normalizeHeaderSymbols(symbols: string[]) {
  return [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, MAX_HEADER_TICKERS);
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? "h-5 w-5"} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

function formatPrice(p: number) {
  return p >= 1 ? `$${p.toFixed(2)}` : `$${p.toFixed(4)}`;
}

export default function WatchlistPage() {
  const { showToast } = useToast();
  const toastRef = useRef(showToast);
  const [activeTab, setActiveTab] = useState<"watchlist" | "alerts">("watchlist");
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [headerSymbols, setHeaderSymbols] = useState<string[]>([]);
  const [headerUseWatchlist, setHeaderUseWatchlist] = useState(false);
  const watchlistTickers = items.map((i) => i.ticker);
  const liveQuotes = useLivePrices(watchlistTickers);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [alertQuotes, setAlertQuotes] = useState<Record<string, number>>({});
  const [alertsFilter, setAlertsFilter] = useState<"all" | "active" | "triggered" | "paused">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPrefillTicker, setModalPrefillTicker] = useState<string | undefined>();
  const [editingAlert, setEditingAlert] = useState<PriceAlert | null>(null);
  const [notificationsGranted, setNotificationsGranted] = useState(false);
  const [syncIssue, setSyncIssue] = useState(false);
  const [alertsSyncIssue, setAlertsSyncIssue] = useState(false);
  const [shareModal, setShareModal] = useState<{ ticker: string } | null>(null);
  const [shareConvs, setShareConvs] = useState<{ id: string; label: string }[]>([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareSending, setShareSending] = useState(false);

  useEffect(() => {
    toastRef.current = showToast;
  }, [showToast]);

  const refreshAlerts = useCallback(async () => {
    const result = await fetchPriceAlertsCloud();
    setAlerts(result.alerts);
    setAlertsSyncIssue(result.syncIssue);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const result = await fetchWatchlistWithStatus();
      setItems(result.items);
      setSyncIssue(result.syncIssue);
    } catch {
      setItems([]);
      setSyncIssue(getWatchlistSyncIssue());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      await refresh();
      // First load migration: move existing localStorage watchlist into Supabase when possible.
      const migration = await migrateLocalWatchlistToApi();
      if (!mounted) return;
      if (migration.syncIssue) {
        setSyncIssue(true);
      } else if (migration.attempted > 0) {
        await refresh();
      }
    };
    void run();
    const onChanged = () => {
      void refresh();
    };
    window.addEventListener("xchange-watchlist-changed", onChanged);
    return () => {
      mounted = false;
      window.removeEventListener("xchange-watchlist-changed", onChanged);
    };
  }, [refresh]);

  useEffect(() => {
    const load = async () => {
      const cfg = await fetchTickerBarConfig();
      setHeaderSymbols(normalizeHeaderSymbols(cfg.config.tickers));
      setHeaderUseWatchlist(cfg.config.useWatchlist);
    };
    void load();
  }, []);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      await refreshAlerts();
      const migration = await migrateLocalAlertsToCloud();
      if (!mounted) return;
      if (migration.migrated > 0 && !migration.syncIssue) {
        toastRef.current(`${migration.migrated} alerts synced to cloud`, "success");
      }
      if (migration.syncIssue) {
        setAlertsSyncIssue(true);
      } else if (migration.attempted > 0) {
        await refreshAlerts();
      }
    };
    void run();
    const retry = setInterval(() => {
      if (getPriceAlertSyncIssue()) void refreshAlerts();
    }, 5 * 60 * 1000);
    return () => {
      mounted = false;
      clearInterval(retry);
    };
  }, [refreshAlerts]);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationsGranted(Notification.permission === "granted");
    }
  }, []);

  // Price alerts: subscribe to WebSocket for each active alert ticker; check conditions on every price update
  const lastPricesRef = useRef<Record<string, number>>({});
  useEffect(() => {
    const list = alerts.filter((a) => a.status === "active");
    const tickers = [...new Set(list.map((a) => a.ticker))];
    if (tickers.length === 0) return;

    const ws = getFinnhubWS();
    if (!ws) return;

    const unsubs: (() => void)[] = [];
    tickers.forEach((ticker) => {
      fetch(`/api/ticker-quote?ticker=${encodeURIComponent(ticker)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          const prevClose = d?.previousClose ?? d?.pc ?? d?.price;
          if (prevClose != null && typeof prevClose === "number") ws.setPrevClose(ticker, prevClose);
          setAlertQuotes((prev) => ({ ...prev, [ticker]: d?.price ?? prev[ticker] }));
        })
        .catch(() => {});

      const unsub = ws.onPrice(ticker, (price, _change, _changePercent) => {
        setAlertQuotes((prev) => ({ ...prev, [ticker]: price }));
        const now = new Date().toISOString();
        let updated = false;
        const nextList = alerts.map((a) => {
          if (a.status !== "active" || a.ticker !== ticker) return a;
          const lastPrice = lastPricesRef.current[ticker];
          const crossed =
            a.condition === "above"
              ? (lastPrice == null && price >= a.targetPrice) || (lastPrice != null && lastPrice < a.targetPrice && price >= a.targetPrice)
              : (lastPrice == null && price <= a.targetPrice) || (lastPrice != null && lastPrice > a.targetPrice && price <= a.targetPrice);
          lastPricesRef.current[ticker] = price;
          if (!crossed) return { ...a, currentPrice: price };
          updated = true;
          if (a.notifyBrowser && typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              new Notification("Xchange Price Alert", {
                body: `${a.ticker} has reached ${formatPrice(price)} — your target was ${formatPrice(a.targetPrice)}`,
                icon: "/logo.png",
                tag: a.id,
              });
            } catch {}
          }
          if (a.notifyInApp) {
            addInAppNotification({
              type: "price_alert",
              ticker: a.ticker,
              message: `Price Alert: ${a.ticker} reached ${formatPrice(price)}`,
              price,
              targetPrice: a.targetPrice,
              link: `/search/${a.ticker}`,
            });
          }
          toastRef.current(
            `${a.ticker} hit ${formatPrice(price)} — your target price`,
            a.condition === "above" ? "success" : "error",
            5000
          );
          return {
            ...a,
            status: a.repeat ? ("active" as const) : ("triggered" as const),
            triggeredAt: a.repeat ? a.triggeredAt : now,
            currentPrice: price,
          };
        });
        if (updated) {
          setAlerts(nextList);
          nextList
            .filter((a) => a.ticker === ticker)
            .forEach((a) => {
              void updatePriceAlertCloud(a.id, {
                status: a.status,
                currentPrice: a.currentPrice,
                triggeredAt: a.triggeredAt,
              }).then((r) => {
                if (r.syncIssue) setAlertsSyncIssue(true);
              });
            });
        }
      });
      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [alerts]);

  const removeTickerFromHeader = (sym: string) => {
    setHeaderSymbols((prev) => {
      const next = prev.filter((s) => s !== sym);
      void saveTickerBarConfig({ tickers: next, useWatchlist: false });
      setHeaderUseWatchlist(false);
      return next;
    });
  };

  const toggleHeaderTicker = (ticker: string) => {
    const sym = ticker.toUpperCase();
    setHeaderSymbols((prev) => {
      const next = prev.includes(sym) ? prev.filter((s) => s !== sym) : normalizeHeaderSymbols([...prev, sym]);
      void saveTickerBarConfig({ tickers: next, useWatchlist: false });
      setHeaderUseWatchlist(false);
      return next;
    });
  };

  const useDefault = () => {
    const defaults = [...DEFAULT_TICKERS].slice(0, MAX_HEADER_TICKERS);
    setHeaderSymbols(defaults);
    setHeaderUseWatchlist(false);
    void saveTickerBarConfig({ tickers: defaults, useWatchlist: false });
  };

  const handleRemove = async (ticker: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const result = await removeFromWatchlistApi(ticker);
      setSyncIssue(result.syncIssue);
      setItems((prev) => prev.filter((i) => i.ticker.toUpperCase() !== ticker.toUpperCase()));
      if (result.syncIssue) showToast("Saved locally (sync issue)", "warning");
    } catch {
      showToast("Could not update watchlist", "warning");
    }
  };

  const openShareModal = async (ticker: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShareModal({ ticker });
    setShareLoading(true);
    try {
      const res = await fetch("/api/conversations");
      const data = await res.json() as { dms: { id: string; other_user?: { name: string; username: string } | null }[]; groups: { id: string; name: string | null }[]; community: { id: string; name: string | null }[] };
      const convs: { id: string; label: string }[] = [
        ...data.dms.map((c) => ({ id: c.id, label: c.other_user?.name ?? c.other_user?.username ?? "DM" })),
        ...data.groups.map((c) => ({ id: c.id, label: c.name ?? "Group" })),
        ...data.community.map((c) => ({ id: c.id, label: c.name ?? "Community" })),
      ];
      setShareConvs(convs);
    } catch { setShareConvs([]); }
    setShareLoading(false);
  };

  const handleShareToConv = async (convId: string) => {
    if (!shareModal || shareSending) return;
    setShareSending(true);
    try {
      await fetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: `__ticker:${shareModal.ticker}` }),
      });
      setShareModal(null);
      showToast(`${shareModal.ticker} shared to chat`, "success");
    } catch { /* ignore */ }
    setShareSending(false);
  };

  const openAlertModal = (prefillTicker?: string, alert?: PriceAlert | null) => {
    setModalPrefillTicker(prefillTicker);
    setEditingAlert(alert ?? null);
    setModalOpen(true);
  };

  const closeAlertModal = () => {
    setModalOpen(false);
    setModalPrefillTicker(undefined);
    setEditingAlert(null);
  };

  const requestNotificationPermission = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setNotificationsGranted(p === "granted");
  };

  const handlePauseResume = (alert: PriceAlert) => {
    const list = alerts.map((a) =>
      a.id === alert.id ? { ...a, status: (a.status === "paused" ? "active" : "paused") as PriceAlert["status"] } : a
    );
    setAlerts(list);
    const status = list.find((a) => a.id === alert.id)?.status;
    void updatePriceAlertCloud(alert.id, { status }).then((r) => {
      if (r.syncIssue) setAlertsSyncIssue(true);
    });
  };

  const handleDeleteAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    void deletePriceAlertCloud(id).then((r) => {
      if (r.syncIssue) setAlertsSyncIssue(true);
    });
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-zinc-100">My Watchlist</h1>
        <p className="mt-4 text-zinc-500">Loading…</p>
      </div>
    );
  }

  const isInHeader = (ticker: string) => headerSymbols.includes(ticker.toUpperCase());
  const activeCount = alerts.filter((a) => a.status === "active").length;
  const triggeredCount = alerts.filter((a) => a.status === "triggered").length;
  const pausedCount = alerts.filter((a) => a.status === "paused").length;
  const freeTierUsed = alerts.filter((a) => a.status === "active" || a.status === "paused").length;

  const filteredAlerts =
    alertsFilter === "all"
      ? [...alerts]
      : alertsFilter === "active"
        ? alerts.filter((a) => a.status === "active")
        : alertsFilter === "triggered"
          ? alerts.filter((a) => a.status === "triggered")
          : alerts.filter((a) => a.status === "paused");

  // Sort: triggered first (recent first), then active by closest to triggering, then paused by created
  filteredAlerts.sort((a, b) => {
    if (a.status === "triggered" && b.status !== "triggered") return -1;
    if (a.status !== "triggered" && b.status === "triggered") return 1;
    if (a.status === "triggered" && b.status === "triggered") {
      return (b.triggeredAt ?? b.createdAt).localeCompare(a.triggeredAt ?? a.createdAt);
    }
    if (a.status === "active" && b.status === "active") {
      const priceA = alertQuotes[a.ticker] ?? a.currentPrice ?? 0;
      const priceB = alertQuotes[b.ticker] ?? b.currentPrice ?? 0;
      const distA = priceA > 0 ? Math.abs((a.targetPrice - priceA) / priceA) * 100 : 999;
      const distB = priceB > 0 ? Math.abs((b.targetPrice - priceB) / priceB) * 100 : 999;
      return distA - distB;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-zinc-100">My Watchlist</h1>
        <div className="flex rounded-full border border-white/10 bg-white/5 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("watchlist")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "watchlist" ? "bg-white/15 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Watchlist
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("alerts")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "alerts" ? "bg-white/15 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Price Alerts
          </button>
        </div>
      </div>
      {syncIssue && (
        <p className="mt-2 text-xs text-amber-400">Sync issue: using local backup. Changes will sync when API is available.</p>
      )}
      {alertsSyncIssue && (
        <p className="mt-1 text-xs text-amber-400">Alerts saved locally. Retrying cloud sync every 5 minutes.</p>
      )}

      {activeTab === "watchlist" && (
        <>
          <section className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-zinc-200">Header bar tickers</h2>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Tickers shown in the top rotating bar. Use the icon on each watchlist card to add. Remove any below with ×. Default = SPY, QQQ, BTC, etc.
            </p>
            {headerUseWatchlist && (
              <p className="mt-2 text-xs text-emerald-400">Ticker bar is currently following your watchlist.</p>
            )}
            {headerSymbols.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-400">Using default tickers (SPY, QQQ, BTC, ETH, GLD, OIL, DXY, EUR/USD).</p>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {headerSymbols.map((sym) => (
                  <span
                    key={sym}
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-sm text-zinc-200"
                  >
                    {sym}
                    <button
                      type="button"
                      onClick={() => removeTickerFromHeader(sym)}
                      className="rounded-full p-0.5 text-zinc-400 hover:bg-red-500/20 hover:text-red-400"
                      aria-label={`Remove ${sym} from header bar`}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </span>
                ))}
              </div>
            )}
            <button type="button" onClick={useDefault} className="mt-3 text-xs font-medium text-[var(--accent-color)] hover:underline">
              Use default tickers
            </button>
          </section>

          {items.length === 0 ? (
            <p className="mt-6 text-zinc-400">No assets in watchlist yet. Search for a stock or crypto to add.</p>
          ) : (
            <>
            <ul className="mt-6 space-y-2">
              {items.map((item) => {
                const q = liveQuotes[item.ticker];
                const inHeader = isInHeader(item.ticker);
                const tickerAlerts = alerts.filter((a) => a.ticker.toUpperCase() === item.ticker.toUpperCase());
                const alertForTicker =
                  tickerAlerts.find((a) => a.status === "active") ??
                  tickerAlerts.find((a) => a.status === "paused") ??
                  null;
                const near = alertForTicker && q?.price != null && alertForTicker.status === "active" && isNearTrigger(alertForTicker, q.price);
                const bellColor = alertForTicker ? (near ? "text-amber-400" : "text-emerald-400") : "text-zinc-400";
                return (
                  <li key={item.ticker}>
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-4 py-3 transition-colors hover:bg-white/10">
                      <Link
                        href={`/search/${encodeURIComponent(item.ticker)}`}
                        className="min-w-0 flex-1 flex items-center justify-between gap-3"
                      >
                        <span className="font-medium text-zinc-200">{item.ticker}</span>
                        <div className="flex shrink-0 items-center gap-4 text-sm">
                          {q?.price != null ? (
                            <PriceDisplay
                              price={q.price}
                              change={q.change}
                              changePercent={q.changePercent}
                              symbol={item.ticker}
                            />
                          ) : q?.isLoading ? (
                            <span className="text-zinc-500">—</span>
                          ) : (
                            <span className="text-zinc-500">—</span>
                          )}
                        </div>
                      </Link>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); openAlertModal(item.ticker, alertForTicker ?? undefined); }}
                          className={`rounded p-2 transition-colors hover:opacity-90 ${bellColor}`}
                          title={alertForTicker ? (near ? "Alert near target" : "Edit alert") : "Set price alert"}
                          aria-label="Price alert"
                        >
                          <BellIcon />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleHeaderTicker(item.ticker); }}
                          className={`rounded p-2 transition-colors ${
                            inHeader ? "text-[var(--accent-color)]" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-300"
                          }`}
                          title={inHeader ? "Remove from header bar" : "Add to header bar"}
                          aria-label={inHeader ? "Remove from header bar" : "Add to header bar"}
                        >
                          {inHeader ? (
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                          ) : (
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => void openShareModal(item.ticker, e)}
                          className="rounded px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-[var(--accent-color)]/10 hover:text-[var(--accent-color)]"
                          aria-label={`Share ${item.ticker} to chat`}
                          title="Share to chat"
                        >
                          Share
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleRemove(item.ticker, e)}
                          className="rounded px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
                          aria-label={`Remove ${item.ticker} from watchlist`}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            {watchlistTickers.length > 0 && <WatchlistChart tickers={watchlistTickers} />}
            </>
          )}
        </>
      )}

      {activeTab === "alerts" && (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-zinc-400">{activeCount} active alerts</span>
            <div className="flex items-center gap-2">
              {!notificationsGranted && typeof window !== "undefined" && "Notification" in window && (
                <button
                  type="button"
                  onClick={requestNotificationPermission}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/10"
                >
                  Enable Notifications
                </button>
              )}
              <button
                type="button"
                onClick={() => { setEditingAlert(null); setModalPrefillTicker(undefined); setModalOpen(true); }}
                disabled={freeTierUsed >= MAX_ALERTS_FREE}
                className="rounded-full bg-[var(--accent-color)] px-4 py-2 text-sm font-semibold text-[#020308] hover:opacity-90 disabled:opacity-50"
              >
                New Alert
              </button>
            </div>
          </div>
          {freeTierUsed >= MAX_ALERTS_FREE && (
            <p className="mt-2 text-xs text-amber-400">Upgrade to Pro for unlimited alerts.</p>
          )}

          <div className="mt-3 flex gap-1 rounded-full border border-white/10 bg-white/5 p-1">
            {(["all", "active", "triggered", "paused"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setAlertsFilter(f)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize ${
                  alertsFilter === f ? "bg-white/15 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {f === "all" ? "All" : f} ({f === "all" ? alerts.length : f === "active" ? activeCount : f === "triggered" ? triggeredCount : pausedCount})
              </button>
            ))}
          </div>

          {filteredAlerts.length === 0 ? (
            <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 py-16 text-center">
              <p className="text-zinc-300">No price alerts set</p>
              <p className="mt-2 max-w-sm text-sm text-zinc-500">
                Get notified when any stock, crypto or currency hits your target price.
              </p>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="mt-6 rounded-full bg-[var(--accent-color)] px-6 py-2.5 text-sm font-semibold text-[#020308] hover:opacity-90"
              >
                Create your first alert
              </button>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {filteredAlerts.map((alert) => {
                const currentPrice = alertQuotes[alert.ticker] ?? alert.currentPrice ?? 0;
                const triggered = alert.status === "triggered";
                const near = alert.status === "active" && currentPrice > 0 && isNearTrigger(alert, currentPrice);
                const pct =
                  currentPrice > 0 && alert.targetPrice > 0
                    ? Math.abs(((alert.targetPrice - currentPrice) / currentPrice) * 100)
                    : null;
                const borderColor = triggered
                  ? alert.condition === "above"
                    ? "border-l-emerald-500"
                    : "border-l-red-500"
                  : near
                    ? "border-l-amber-500"
                    : alert.condition === "above"
                      ? "border-l-emerald-500/70"
                      : "border-l-red-500/70";
                return (
                  <li
                    key={alert.id}
                    className={`rounded-lg border border-white/10 bg-[#0F1520] pl-4 pr-3 py-3 border-l-4 ${borderColor} ${triggered ? "ring-1 ring-emerald-500/20" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-zinc-100">{alert.ticker}</span>
                          {alert.company && alert.company !== alert.ticker && (
                            <span className="text-sm text-zinc-500">{alert.company}</span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                              alert.condition === "above" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                            }`}
                          >
                            {alert.condition === "above" ? "ABOVE" : "BELOW"} {formatPrice(alert.targetPrice)}
                          </span>
                          {triggered && (
                            <span className={`rounded px-2 py-0.5 text-xs font-medium ${alert.condition === "above" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                              TRIGGERED
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-zinc-400">
                          Current: {currentPrice > 0 ? formatPrice(currentPrice) : "—"}
                          {pct != null && alert.status === "active" && (
                            <span className={near ? "ml-2 text-amber-400" : "ml-2 text-zinc-500"}>
                              {pct.toFixed(1)}% away
                            </span>
                          )}
                        </p>
                        {alert.name && <p className="mt-0.5 text-xs text-zinc-500">{alert.name}</p>}
                        <p className="mt-0.5 text-[10px] text-zinc-600">{new Date(alert.createdAt).toLocaleDateString()}</p>
                        {triggered && alert.triggeredAt && (
                          <p className="text-[10px] text-zinc-500">Triggered {new Date(alert.triggeredAt).toLocaleString()}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {alert.status === "active" && (
                          <button
                            type="button"
                            onClick={() => handlePauseResume(alert)}
                            className="rounded p-2 text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                            title="Pause alert"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          </button>
                        )}
                        {alert.status === "paused" && (
                          <button
                            type="button"
                            onClick={() => handlePauseResume(alert)}
                            className="rounded p-2 text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                            title="Resume alert"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => { setEditingAlert(alert); setModalOpen(true); }}
                          className="rounded p-2 text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                          title="Edit"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAlert(alert.id)}
                          className="rounded p-2 text-zinc-400 hover:bg-red-500/10 hover:text-red-400"
                          title="Delete"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <PriceAlertModal
        open={modalOpen}
        onClose={closeAlertModal}
        editingAlert={editingAlert}
        prefilledTicker={modalPrefillTicker}
        onSaved={() => {
          void refreshAlerts();
        }}
      />

      {/* Share to chat modal */}
      {shareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShareModal(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0A0F1A] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">Share <span className="text-[var(--accent-color)]">{shareModal.ticker}</span> to chat</h3>
              <button type="button" onClick={() => setShareModal(null)} className="text-zinc-600 hover:text-zinc-300">✕</button>
            </div>
            {shareLoading ? (
              <div className="flex items-center justify-center py-6">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-[var(--accent-color)]" />
              </div>
            ) : shareConvs.length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-500">No conversations yet.</p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {shareConvs.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={shareSending}
                      onClick={() => void handleShareToConv(c.id)}
                      className="w-full rounded-xl px-4 py-2.5 text-left text-sm text-zinc-300 transition-colors hover:bg-white/5 disabled:opacity-50"
                    >
                      {c.label}
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
