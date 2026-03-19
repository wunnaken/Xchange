"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WidgetId } from "../../lib/dashboard";
import { SentimentRadarWidget } from "./SentimentRadar";
import { loadStreaks } from "../../lib/engagement/streaks";
import { loadXP, getRankTitle } from "../../lib/engagement/xp";
import { getTrades, computePnL, formatCurrency } from "../../lib/journal";
import { getPoints, loadBets, loadMarkets, type PredictMarket } from "../../lib/predict";
import { getStoredConversations, saveConversation, getPortfolioContext } from "../../lib/ai-chat-storage";
import { useAuth } from "../AuthContext";
import { fetchWatchlist, addToWatchlistApi, type WatchlistItem } from "../../lib/watchlist-api";
import { useLivePrices } from "../../lib/hooks/useLivePrice";
import { PriceDisplay } from "../PriceDisplay";

type WidgetContentProps = { widgetId: WidgetId; onLoaded?: () => void };

export function WatchlistWidget({ onLoaded }: WidgetContentProps) {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addInput, setAddInput] = useState("");

  const refresh = useCallback(async () => {
    try {
      const list = await fetchWatchlist();
      setItems(list);
    } finally {
      setLoading(false);
      onLoaded?.();
    }
  }, [onLoaded]);

  useEffect(() => {
    refresh();
  }, [onLoaded]);

  const addTicker = useCallback(async () => {
    const ticker = addInput.trim().toUpperCase();
    if (!ticker) return;
    setAddInput("");
    setLoading(true);
    try {
      await addToWatchlistApi({ ticker });
    } catch {
      // If API fails, watchlist helper already falls back to localStorage.
    } finally {
      await refresh();
    }
  }, [addInput, refresh]);

  if (loading) return null;
  return (
    <div className="flex h-full min-h-0 flex-col p-2">
      <div className="min-h-0 flex-1 overflow-y-auto space-y-1">
        {items.map((i) => (
          <Link
            key={i.ticker}
            href={`/search/${i.ticker}`}
            className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-xs hover:bg-white/5"
          >
            <span className="min-w-0 truncate font-medium text-zinc-200">{i.ticker}</span>
            <span
              className={
                typeof i.change === "number" && i.change >= 0 ? "text-emerald-400" : "text-red-400"
              }
            >
              {i.price != null ? String(i.price) : "—"}{" "}
              {i.change != null ? `${i.change >= 0 ? "+" : ""}${i.change}%` : ""}
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-2 flex shrink-0 gap-1">
        <input
          type="text"
          value={addInput}
          onChange={(e) => setAddInput(e.target.value)}
          placeholder="Add ticker"
          className="min-w-0 flex-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTicker();
            }
          }}
        />
        <button
          type="button"
          onClick={() => addTicker()}
          className="rounded bg-[var(--accent-color)] px-2 py-1 text-xs font-medium text-[#020308]"
        >
          Add
        </button>
      </div>
    </div>
  );
}

const DEFAULT_MARKET_SYMBOLS = ["SPY", "QQQ", "DXY", "VIX", "BTC", "GLD"];

export function MarketOverviewWidget({ onLoaded }: WidgetContentProps) {
  const [data, setData] = useState<{ symbol: string; name: string; price: number; changePercent: number }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/market-tickers").then((r) => r.json()).then((d) => {
      const arr = Array.isArray(d) ? d : (d?.tickers ?? []);
      setData(arr.slice(0, 20).map((t: { symbol: string; name?: string; price: number; changePercent?: number }) => ({ symbol: t.symbol, name: t.name ?? t.symbol, price: t.price, changePercent: t.changePercent ?? 0 })));
      setLoading(false);
      onLoaded?.();
    }).catch(() => { setLoading(false); onLoaded?.(); });
  }, [onLoaded]);
  const symbols = data.length > 0 ? data.map((t) => t.symbol) : DEFAULT_MARKET_SYMBOLS;
  const live = useLivePrices(symbols);
  if (loading && data.length === 0) return null;
  const list = data.length > 0 ? data : DEFAULT_MARKET_SYMBOLS.map((s) => ({ symbol: s, name: s, price: 0, changePercent: 0 }));
  return (
    <div className="flex h-full min-h-0 flex-col p-2">
      <div className="min-h-0 flex-1 overflow-y-auto space-y-1">
        {list.map((t) => {
          const l = live[t.symbol];
          return (
            <div
              key={t.symbol}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="min-w-0 truncate text-zinc-400">{t.symbol}</span>
              {l?.price != null ? (
                <PriceDisplay
                  price={l.price}
                  change={l.change}
                  changePercent={l.changePercent}
                  symbol={t.symbol}
                  format="compact"
                  showChange={true}
                  className="justify-end"
                  priceClassName=""
                  changeClassName={t.changePercent >= 0 ? "text-emerald-400" : "text-red-400"}
                />
              ) : (
                <span
                  className={
                    "text-right " + (t.changePercent >= 0 ? "text-emerald-400" : "text-red-400")
                  }
                >
                  {t.price} ({t.changePercent >= 0 ? "+" : ""}
                  {t.changePercent.toFixed(2)}%)
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 shrink-0 text-[10px] text-zinc-500">
        Market Open · Live
      </p>
    </div>
  );
}

export function FearGreedWidget({ onLoaded }: WidgetContentProps) {
  const [score, setScore] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/datahub/crypto-fng").then((r) => r.json()).then((d) => { setScore(d.value ?? null); onLoaded?.(); }).catch(() => onLoaded?.());
  }, [onLoaded]);
  const label = score == null ? "—" : score <= 25 ? "Extreme Fear" : score <= 45 ? "Fear" : score <= 55 ? "Neutral" : score <= 75 ? "Greed" : "Extreme Greed";
  const needleAngle = score != null ? -90 + (score / 100) * 180 : -90;
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center p-2">
      <div className="flex-1 min-h-0 w-full overflow-visible">
        <svg
          viewBox="-8 -12 216 112"
          className="w-full h-auto overflow-visible"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="fgGradWidget" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#EF4444" />
              <stop offset="50%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#22C55E" />
            </linearGradient>
          </defs>
          <path d="M 28 88 A 80 80 0 0 1 188 88" fill="none" stroke="url(#fgGradWidget)" strokeWidth="12" />
          <g transform={`rotate(${needleAngle}, 100, 88)`}>
            <line x1="100" y1="88" x2="100" y2="32" stroke="white" strokeWidth="3" strokeLinecap="round" />
            <polygon points="100,18 96,34 104,34" fill="white" />
          </g>
        </svg>
      </div>
      <p className="mt-1 text-[clamp(18px,3.6vw,26px)] font-bold text-white">
        {score ?? "—"}
      </p>
      <p className="text-[10px] text-zinc-500">{label}</p>
    </div>
  );
}

export function StreaksWidget() {
  const s = typeof window !== "undefined" ? loadStreaks() : { loginStreak: 0, journalStreak: 0, briefingStreak: 0 };
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 p-3">
      <div className="rounded-lg border border-[var(--accent-color)]/30 bg-[var(--accent-color)]/10 px-3 py-4 text-center w-full">
        <p className="text-[clamp(28px,3vw,44px)] font-bold tabular-nums text-[var(--accent-color)]">
          {s.loginStreak}
        </p>
        <p className="mt-1 text-xs font-medium uppercase tracking-wider text-zinc-400">Login streak</p>
      </div>
      <div className="min-h-0 flex-1 w-full grid grid-cols-2 gap-2">
        <div className="flex flex-col justify-center rounded-lg border border-white/10 bg-white/5 p-3 text-center min-h-0">
          <p className="text-[clamp(22px,2.4vw,34px)] font-bold tabular-nums text-zinc-200">
            {s.journalStreak}
          </p>
          <p className="text-[10px] text-zinc-500">Journal</p>
        </div>
        <div className="flex flex-col justify-center rounded-lg border border-white/10 bg-white/5 p-3 text-center min-h-0">
          <p className="text-[clamp(22px,2.4vw,34px)] font-bold tabular-nums text-zinc-200">
            {s.briefingStreak}
          </p>
          <p className="text-[10px] text-zinc-500">Briefing</p>
        </div>
      </div>
    </div>
  );
}

export function JournalSummaryWidget() {
  const trades = typeof window !== "undefined" ? getTrades() : [];
  const closed = trades.filter((t) => t.exitPrice != null);
  const winners = closed.filter((t) => (computePnL(t)?.pnlDollars ?? 0) >= 0).length;
  const winRate = closed.length ? Math.round((winners / closed.length) * 100) : 0;
  let totalPnl = 0;
  let sumReturn = 0;
  let countReturn = 0;
  closed.forEach((t) => {
    const p = computePnL(t);
    if (p) {
      totalPnl += p.pnlDollars;
      sumReturn += p.pnlPercent;
      countReturn += 1;
    }
  });
  const avgReturn = countReturn > 0 ? sumReturn / countReturn : 0;
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <div className="min-h-0 flex-1 grid grid-cols-2 gap-2">
        <div className="flex flex-col justify-center rounded border border-white/10 bg-white/5 p-2 text-center">
          <p className="text-[clamp(20px,2.6vw,38px)] font-bold text-zinc-100 tabular-nums">{winRate}%</p>
          <p className="text-[10px] text-zinc-500 shrink-0">Win rate</p>
        </div>
        <div className="flex flex-col justify-center rounded border border-white/10 bg-white/5 p-2 text-center">
          <p className={"text-[clamp(18px,2.6vw,36px)] font-bold tabular-nums " + (totalPnl >= 0 ? "text-emerald-400" : "text-red-400")}>
            {formatCurrency(totalPnl)}
          </p>
          <p className="text-[10px] text-zinc-500 shrink-0">Total P&L</p>
        </div>
      </div>
      <div className="text-xs text-zinc-400">
        <p>Closed: {closed.length} · Avg return: {avgReturn >= 0 ? "+" : ""}{avgReturn.toFixed(2)}%</p>
      </div>
      <Link href="/journal" className="shrink-0 text-[11px] text-[var(--accent-color)] hover:underline">Log a trade →</Link>
    </div>
  );
}

export function XpRankWidget() {
  const xp = typeof window !== "undefined" ? loadXP() : { total: 0 };
  const title = typeof window !== "undefined" ? getRankTitle(xp.total) : "";
  return (
    <div className="flex flex-col items-center justify-center p-3">
      <p className="text-3xl font-bold text-[var(--accent-color)]">{xp.total}</p>
      <p className="text-[10px] text-zinc-500">XP</p>
      <p className="mt-1 text-xs text-zinc-400">{title}</p>
    </div>
  );
}

export function PredictionMarketsWidget() {
  const { user } = useAuth();
  const userId = typeof user?.id !== "undefined" ? String(user.id) : (typeof user?.email === "string" ? user.email : "anon");
  const points = typeof window !== "undefined" ? getPoints() : 0;
  const [markets, setMarkets] = useState<PredictMarket[]>([]);
  const [bets, setBets] = useState<{ marketId: string; side: string; amount: number; status: string; question?: string }[]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setMarkets(loadMarkets(userId));
    const allBets = loadBets();
    const myOpen = allBets.filter((b) => b.userId === userId && b.status === "open");
    const m = loadMarkets(userId);
    setBets(myOpen.map((b) => {
      const market = m.find((x) => x.id === b.marketId);
      return { marketId: b.marketId, side: b.side, amount: b.amount, status: b.status, question: market?.question };
    }));
  }, [userId]);
  if (bets.length > 0) {
    return (
      <div className="flex h-full min-h-0 flex-col p-2">
        <p className="shrink-0 text-[10px] font-medium text-zinc-500">
          Your open bets
        </p>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {bets.map((b, i) => (
            <Link
              key={i}
              href="/predict"
              className="block rounded border border-white/10 bg-white/5 p-2 text-xs hover:bg-white/10"
            >
              <p className="line-clamp-2 text-zinc-200">
                {b.question ?? "Market"}
              </p>
              <p className="mt-1 text-[10px] text-zinc-500">
                {b.side === "yes" ? "YES" : "NO"} · {b.amount} XP
              </p>
            </Link>
          ))}
        </div>

        <p className="mt-2 shrink-0 text-xs text-amber-400">
          {points.toLocaleString()} XP balance
        </p>
        <Link
          href="/predict"
          className="mt-1 shrink-0 text-[11px] text-[var(--accent-color)] hover:underline"
        >
          View all markets →
        </Link>
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col justify-center p-3">
      <p className="text-lg font-bold text-amber-400">{points.toLocaleString()} XP</p>
      <p className="text-[10px] text-zinc-500">Balance</p>
      <Link href="/predict" className="mt-2 block text-[11px] text-[var(--accent-color)] hover:underline">View all markets →</Link>
    </div>
  );
}

export function CustomNoteWidget({ widgetId }: WidgetContentProps) {
  const key = `xchange-dashboard-note-${widgetId}`;
  const [text, setText] = useState("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    setText(localStorage.getItem(key) ?? "");
  }, [key]);
  const save = () => { if (typeof window !== "undefined") localStorage.setItem(key, text); };
  return (
    <textarea
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      placeholder="Trading notes, reminders..."
      className="h-full w-full resize-none rounded bg-transparent p-2 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none"
      rows={4}
    />
  );
}

function formatTimeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "Just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export function NewsFeedWidget({ onLoaded }: WidgetContentProps) {
  const [articles, setArticles] = useState<{ title: string; url: string; source: string; publishedAt: string; urlToImage?: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/news").then((r) => r.json()).then((d) => {
      const list = Array.isArray(d?.articles) ? d.articles : [];
      setArticles(list.slice(0, 10).map((a: { title?: string; url?: string; source?: string; publishedAt?: string; urlToImage?: string | null }) => ({ title: a.title ?? "", url: a.url ?? "#", source: a.source ?? "", publishedAt: a.publishedAt ?? "", urlToImage: a.urlToImage ?? null })));
      setLoading(false);
      onLoaded?.();
    }).catch(() => { setLoading(false); onLoaded?.(); });
  }, [onLoaded]);
  if (loading) {
    return (
      <div className="flex min-h-0 h-full items-center justify-center p-2">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent-color)] border-t-transparent" />
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col p-2">
      <div className="min-h-0 flex-1 overflow-y-auto space-y-1">
        {articles.length === 0 ? (
          <p className="text-xs text-zinc-500">No headlines right now.</p>
        ) : (
          articles.map((a, i) => (
            <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="flex gap-2 rounded px-2 py-1.5 text-xs hover:bg-white/5">
              {a.urlToImage ? (
                <div className="h-10 w-12 flex-shrink-0 overflow-hidden rounded bg-zinc-800/50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.urlToImage} alt="" className="h-full w-full object-cover" />
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <span className="line-clamp-2 text-zinc-200">{a.title}</span>
                <span className="text-[10px] text-zinc-500">{a.source} · {formatTimeAgo(a.publishedAt)}</span>
              </div>
            </a>
          ))
        )}
      </div>
      <Link href="/news" className="mt-2 shrink-0 text-center text-[11px] text-[var(--accent-color)] hover:underline">View all</Link>
    </div>
  );
}

export function EconomicCalendarWidget({ onLoaded }: WidgetContentProps) {
  const [events, setEvents] = useState<{ name: string; date: string; impact: string }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400 * 1000 * 2).toISOString().slice(0, 10);
    fetch("/api/calendar/economic?from=" + today + "&to=" + tomorrow).then((r) => r.json()).then((d) => {
      const list = Array.isArray(d?.economic) ? d.economic : [];
      setEvents(list.slice(0, 8).map((e: { name?: string; date?: string; impact?: string }) => ({ name: e.name ?? "", date: e.date ?? "", impact: e.impact ?? "LOW" })));
      setLoading(false);
      onLoaded?.();
    }).catch(() => { setLoading(false); onLoaded?.(); });
  }, [onLoaded]);
  if (loading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center p-2">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent-color)] border-t-transparent" />
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col p-2">
      <div className="min-h-0 flex-1 overflow-y-auto space-y-1">
        {events.length === 0 ? (
          <p className="text-xs text-zinc-500">No events in this window.</p>
        ) : (
          events.map((e, i) => {
            const impactClass =
              e.impact === "HIGH"
                ? "bg-red-500/20 text-red-400"
                : e.impact === "MEDIUM"
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-zinc-500/20 text-zinc-400";
            return (
              <div
                key={i}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-xs"
              >
                <span
                  className={
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] " +
                    impactClass
                  }
                >
                  {e.impact}
                </span>
                <span className="min-w-0 flex-1 truncate text-zinc-200">
                  {e.name}
                </span>
                <span className="shrink-0 text-[10px] text-zinc-500">
                  {e.date}
                </span>
              </div>
            );
          })
        )}
      </div>
      <Link
        href="/calendar"
        className="mt-2 shrink-0 text-center text-[11px] text-[var(--accent-color)] hover:underline"
      >
        View full calendar
      </Link>
    </div>
  );
}

export function SectorHeatmapWidget({ onLoaded }: WidgetContentProps) {
  const [sectors, setSectors] = useState<{ name: string; changePercent: number }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/datahub/sectors").then((r) => r.json()).then((d) => {
      const list = Array.isArray(d?.sectors) ? d.sectors : [];
      setSectors(list.map((s: { name?: string; changePercent?: number }) => ({ name: s.name ?? "", changePercent: s.changePercent ?? 0 })));
      setLoading(false);
      onLoaded?.();
    }).catch(() => { setLoading(false); onLoaded?.(); });
  }, [onLoaded]);
  if (loading) return <div className="flex h-24 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent-color)] border-t-transparent" /></div>;
  return (
    <div className="grid grid-cols-2 gap-1.5 p-2">
      {sectors.map((s, i) => {
        const alpha = Math.min(0.3, Math.abs(s.changePercent) / 100);
        const backgroundColor = s.changePercent >= 0 ? "rgba(34,197,94," + alpha + ")" : "rgba(239,68,68," + alpha + ")";
        return (
        <div key={i} className="rounded px-2 py-1.5 text-xs" style={{ backgroundColor }}>
          <span className="truncate text-zinc-200">{s.name}</span>
          <span className={s.changePercent >= 0 ? "text-emerald-400" : "text-red-400"}> {s.changePercent >= 0 ? "+" : ""}{s.changePercent.toFixed(2)}%</span>
        </div>
        );
      })}
      <Link href="/datahub" className="col-span-2 mt-1 block text-center text-[11px] text-[var(--accent-color)] hover:underline">Sector rotation</Link>
    </div>
  );
}

export function TopMoversWidget({ onLoaded }: WidgetContentProps) {
  const [tickers, setTickers] = useState<{ symbol: string; changePercent: number }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/market-tickers").then((r) => r.json()).then((d) => {
      const arr = Array.isArray(d) ? d : (d?.tickers ?? []);
      const withChange = arr.map((t: { symbol?: string; changePercent?: number }) => ({ symbol: t.symbol ?? "", changePercent: t.changePercent ?? 0 })).filter((t: { symbol: string }) => t.symbol);
      const sorted = [...withChange].sort((a, b) => b.changePercent - a.changePercent);
      setTickers(sorted.slice(0, 10));
      setLoading(false);
      onLoaded?.();
    }).catch(() => { setLoading(false); onLoaded?.(); });
  }, [onLoaded]);
  if (loading) return <div className="flex h-24 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent-color)] border-t-transparent" /></div>;
  const gainers = tickers.filter((t) => t.changePercent >= 0).slice(0, 5);
  const losers = [...tickers].filter((t) => t.changePercent < 0).sort((a, b) => a.changePercent - b.changePercent).slice(0, 5);
  return (
    <div className="space-y-2 p-2">
      <p className="text-[10px] font-medium text-zinc-500">Top gainers</p>
      {gainers.map((t, i) => (
        <div key={i} className="flex justify-between text-xs">
          <span className="text-zinc-200">{t.symbol}</span>
          <span className="text-emerald-400">+{t.changePercent.toFixed(2)}%</span>
        </div>
      ))}
      <p className="text-[10px] font-medium text-zinc-500">Top losers</p>
      {losers.map((t, i) => (
        <div key={i} className="flex justify-between text-xs">
          <span className="text-zinc-200">{t.symbol}</span>
          <span className="text-red-400">{t.changePercent.toFixed(2)}%</span>
        </div>
      ))}
      <Link href="/datahub" className="block text-center text-[11px] text-[var(--accent-color)] hover:underline">DataHub</Link>
    </div>
  );
}

function PlaceholderWidget({ title, href, label }: { title: string; href: string; label?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-4 text-center">
      <p className="text-sm font-medium text-zinc-400">{title}</p>
      <Link href={href} className="mt-2 text-xs text-[var(--accent-color)] hover:underline">{label ?? "View full"}</Link>
    </div>
  );
}

const LIVE_CHART_TICKERS_KEY = "xchange-live-chart-tickers";

const SUGGESTION_TICKERS = [
  "SPY", "QQQ", "AAPL", "TSLA", "NVDA", "MSFT", "GOOGL", "AMZN", "META", "BTC", "ETH",
  "DXY", "GLD", "OIL", "EURUSD", "IWM", "VTI", "AMD", "JPM", "V", "JPM", "XOM",
];

function loadLiveChartTickers(): string[] {
  if (typeof window === "undefined") return ["SPY"];
  try {
    const raw = window.localStorage.getItem(LIVE_CHART_TICKERS_KEY);
    if (!raw) return ["SPY"];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed.filter((x): x is string => typeof x === "string") : ["SPY"];
  } catch {
    return ["SPY"];
  }
}

function saveLiveChartTickers(tickers: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LIVE_CHART_TICKERS_KEY, JSON.stringify(tickers));
}

function filterSuggestions(query: string, existing: string[]): string[] {
  const q = query.trim().toUpperCase();
  const base = q ? SUGGESTION_TICKERS.filter((t) => t.includes(q) || t.startsWith(q)) : [...SUGGESTION_TICKERS];
  return base.filter((t) => !existing.includes(t)).slice(0, 8);
}

export function LiveChartWidget({ onLoaded }: WidgetContentProps) {
  const [tickers, setTickers] = useState<string[]>(() => (typeof window !== "undefined" ? loadLiveChartTickers() : ["SPY"]));
  const [charts, setCharts] = useState<{ ticker: string; points: { close: number }[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [addInput, setAddInput] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestRect, setSuggestRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const suggestions = filterSuggestions(addInput, tickers);

  useEffect(() => {
    const loaded = loadLiveChartTickers();
    if (loaded.length > 0 && JSON.stringify(loaded) !== JSON.stringify(tickers)) setTickers(loaded);
  }, []);

  useEffect(() => {
    if (tickers.length === 0) {
      setCharts([]);
      setLoading(false);
      onLoaded?.();
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all(
      tickers.map((ticker) =>
        fetch("/api/ticker-chart?ticker=" + encodeURIComponent(ticker) + "&range=1d")
          .then((r) => r.json())
          .then((d) => {
            const data = Array.isArray(d?.data) ? d.data : [];
            return { ticker, points: data.slice(-20).map((p: { close?: number }) => ({ close: p.close ?? 0 })) };
          })
          .catch(() => ({ ticker, points: [] }))
      )
    ).then((result) => {
      if (!cancelled) {
        setCharts(result);
        setLoading(false);
        onLoaded?.();
      }
    });
    return () => { cancelled = true; };
  }, [tickers.join(","), onLoaded]);

  useLayoutEffect(() => {
    if (!suggestOpen || typeof document === "undefined") {
      setSuggestRect(null);
      return;
    }
    const el = addInputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setSuggestRect({ top: rect.bottom, left: rect.left, width: rect.width });
  }, [suggestOpen, addInput]);

  const addTicker = useCallback((ticker: string) => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setTickers((prev) => {
      if (prev.includes(t)) return prev;
      const next = [...prev, t];
      saveLiveChartTickers(next);
      return next;
    });
    setAddInput("");
    setSuggestOpen(false);
  }, []);

  const removeTicker = (t: string) => {
    const next = tickers.filter((x) => x !== t);
    if (next.length === 0) return;
    setTickers(next);
    saveLiveChartTickers(next);
  };

  if (loading && charts.length === 0) return <div className="flex h-24 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent-color)] border-t-transparent" /></div>;
  return (
    <div className="flex h-full flex-col overflow-hidden p-2">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {charts.map((c) => {
          const min = c.points.length ? Math.min(...c.points.map((p) => p.close)) : 0;
          const max = c.points.length ? Math.max(...c.points.map((p) => p.close)) : 1;
          const range = max - min || 1;
          const div = c.points.length - 1 || 1;
          const pointsStr = c.points.map((p, i) => (i / div) * 100 + "," + (40 - ((p.close - min) / range) * 36).toFixed(2)).join(" ");
          return (
            <div key={c.ticker} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between">
                <Link href={"/search/" + c.ticker} className="text-[10px] font-medium text-[var(--accent-color)] hover:underline">{c.ticker} 1D</Link>
                <button type="button" onClick={() => removeTicker(c.ticker)} className="rounded p-0.5 text-zinc-500 hover:bg-white/10 hover:text-red-400" aria-label="Remove">×</button>
              </div>
              <div className="h-8 w-full">
                {c.points.length > 0 && (
                  <svg viewBox="0 0 100 40" className="h-full w-full" preserveAspectRatio="none">
                    <polyline fill="none" stroke="var(--accent-color)" strokeWidth="1.5" points={pointsStr} />
                  </svg>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="relative mt-2 shrink-0">
        <div className="flex gap-1">
          <input
            ref={addInputRef}
            type="text"
            value={addInput}
            onChange={(e) => { setAddInput(e.target.value); setSuggestOpen(true); }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (suggestions.length > 0) addTicker(suggestions[0]);
                else if (addInput.trim()) addTicker(addInput);
              }
            }}
            placeholder="Add ticker"
            className="min-w-0 flex-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500"
          />
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); if (addInput.trim()) addTicker(addInput); }}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (addInput.trim()) addTicker(addInput); }}
            className="rounded bg-[var(--accent-color)] px-2 py-1 text-xs font-medium text-[#020308]"
          >
            Add
          </button>
        </div>
        {suggestOpen && (addInput || suggestions.length > 0) && suggestRect && typeof document !== "undefined" &&
          createPortal(
            <ul
              className="fixed z-[100] max-h-32 overflow-auto rounded border border-white/10 bg-[#0F1520] py-1 shadow-lg"
              style={{ top: suggestRect.top + 4, left: suggestRect.left, width: suggestRect.width, minWidth: 120 }}
            >
              {suggestions.length === 0 ? (
                addInput.trim() && (
                  <li>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); addTicker(addInput); }} className="w-full px-2 py-1.5 text-left text-xs text-zinc-300 hover:bg-white/10">
                      Add &quot;{addInput.trim().toUpperCase()}&quot;
                    </button>
                  </li>
                )
              ) : (
                suggestions.map((sym) => (
                  <li key={sym}>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); addTicker(sym); }} className="w-full px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/10">
                      {sym}
                    </button>
                  </li>
                ))
              )}
            </ul>,
            document.body
          )
        }
      </div>
    </div>
  );
}

export function AIAssistantWidget() {
  const recent = typeof window !== "undefined" ? getStoredConversations() : [];
  const initialMessages =
    recent.length > 0 ? recent[0].messages : ([] as Array<{ role: "user" | "assistant"; content: string }>);

  type ChatMsg = { role: "user" | "assistant"; content: string; id: string };
  const [messages, setMessages] = useState<ChatMsg[]>(() =>
    initialMessages.map((m, idx) => ({
      role: m.role,
      content: m.content,
      id: `${m.role}-${idx}`,
    }))
  );
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(
      initialMessages.map((m, idx) => ({
        role: m.role,
        content: m.content,
        id: `${m.role}-${idx}`,
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || loading) return;

      const userMsg: ChatMsg = {
        role: "user",
        content: trimmed,
        id: `u-${Date.now()}`,
      };
      const next = [...messages, userMsg];
      setMessages(next);
      setInputValue("");
      setLoading(true);

      try {
        const res = await fetch("/api/ai-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: next.map((m) => ({ role: m.role, content: m.content })),
            portfolioContext: getPortfolioContext() || undefined,
          }),
        });
        const data = (await res.json()) as { content?: string; error?: string };
        if (!res.ok) {
          const err = data.error || "Something went wrong";
          const assistantMsg: ChatMsg = {
            role: "assistant",
            content: `Sorry, I couldn’t complete that. ${err}`,
            id: `a-${Date.now()}`,
          };
          setMessages((prev) => [...prev, assistantMsg]);
          saveConversation([...next.map((m) => ({ role: m.role, content: m.content })), { role: "assistant", content: assistantMsg.content }]);
          return;
        }

        const assistantContent = data.content ?? "";
        const assistantMsg: ChatMsg = {
          role: "assistant",
          content: assistantContent,
          id: `a-${Date.now()}`,
        };
        const finalMessages = [...next, assistantMsg];
        setMessages(finalMessages);
        saveConversation(finalMessages.map((m) => ({ role: m.role, content: m.content })));
      } catch {
        const assistantMsg: ChatMsg = {
          role: "assistant",
          content: "Sorry, I couldn’t reach the server. Please try again.",
          id: `a-${Date.now()}`,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading]
  );

  return (
    <div className="flex h-full min-h-0 flex-col p-2">
      <div
        ref={messagesScrollRef}
        className="min-h-0 flex-1 overflow-y-auto space-y-2 pr-1"
      >
        {messages.length === 0 && !loading ? (
          <p className="text-xs text-zinc-500">
            Ask a question about markets or trading…
          </p>
        ) : null}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "flex-row-reverse" : "flex-row"} gap-2`}
          >
            <div
              className={`rounded-lg px-2 py-1.5 text-[11px] whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-[var(--accent-color)] text-white"
                  : "bg-[#0F1520] text-zinc-200 border border-white/5"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="text-xs text-zinc-400">Thinking…</div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(inputValue);
        }}
        className="mt-2 flex-shrink-0 border-t border-white/10 pt-2"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask about markets..."
            rows={2}
            className="w-full resize-none rounded border border-white/10 bg-transparent px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 outline-none"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !inputValue.trim()}
            className="flex items-center justify-center rounded bg-[var(--accent-color)] px-3 py-1.5 text-xs font-medium text-[#020308] disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

export function CEOAlertsWidget({ onLoaded }: WidgetContentProps) {
  const [alerts, setAlerts] = useState<{ title: string; url: string; source: string }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/ceo-alerts").then((r) => r.json()).then((d) => {
      const list = Array.isArray(d?.alerts) ? d.alerts : [];
      setAlerts(list.slice(0, 4).map((a: { title?: string; url?: string; source?: string }) => ({ title: a.title ?? "", url: a.url ?? "#", source: a.source ?? "" })));
      setLoading(false);
      onLoaded?.();
    }).catch(() => { setLoading(false); onLoaded?.(); });
  }, [onLoaded]);
  if (loading) return <div className="flex h-24 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent-color)] border-t-transparent" /></div>;
  return (
    <div className="space-y-1 p-2">
      {alerts.length === 0 ? (
        <p className="text-xs text-zinc-500">No CEO alerts in the last 30 days.</p>
      ) : (
        alerts.map((a, i) => (
          <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="block rounded px-2 py-1.5 text-xs hover:bg-white/5">
            <span className="line-clamp-2 text-zinc-200">{a.title}</span>
            <span className="text-[10px] text-zinc-500">{a.source}</span>
          </a>
        ))
      )}
      <Link href="/ceos" className="mt-2 block text-center text-[11px] text-[var(--accent-color)] hover:underline">CEO Intelligence</Link>
    </div>
  );
}

export function CryptoDashboardWidget({ onLoaded }: WidgetContentProps) {
  const [data, setData] = useState<{ dominance: number; top: { symbol: string; price: number; change24h: number }[] }>({ dominance: 52, top: [] });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/datahub/crypto").then((r) => r.json()).then((d) => {
      const top10 = Array.isArray(d?.top10) ? d.top10 : [];
      setData({
        dominance: d?.dominance ?? 52,
        top: top10.slice(0, 4).map((c: { symbol?: string; price?: number; change24h?: number }) => ({ symbol: c.symbol ?? "", price: c.price ?? 0, change24h: c.change24h ?? 0 })),
      });
      setLoading(false);
      onLoaded?.();
    }).catch(() => { setLoading(false); onLoaded?.(); });
  }, [onLoaded]);
  if (loading) return <div className="flex h-24 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent-color)] border-t-transparent" /></div>;
  return (
    <div className="space-y-2 p-2">
      <p className="text-xs text-zinc-500">BTC dominance: <span className="text-zinc-200">{data.dominance}%</span></p>
      {data.top.map((c, i) => (
        <div key={i} className="flex justify-between text-xs">
          <span className="text-zinc-200">{c.symbol}</span>
          <span className={c.change24h >= 0 ? "text-emerald-400" : "text-red-400"}>{c.price.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({c.change24h >= 0 ? "+" : ""}{c.change24h.toFixed(1)}%)</span>
        </div>
      ))}
      <Link href="/datahub" className="block text-center text-[11px] text-[var(--accent-color)] hover:underline">Open DataHub</Link>
    </div>
  );
}

export function CommunityFeedWidget({ onLoaded }: WidgetContentProps) {
  const [posts, setPosts] = useState<{ id: string; content: string; author: { handle: string }; timestamp: string }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/posts?limit=5").then((r) => r.json()).then((d) => {
      const list = Array.isArray(d?.posts) ? d.posts : [];
      setPosts(list.slice(0, 4).map((p: { id: string; content?: string; author?: { handle?: string }; timestamp?: string }) => ({ id: p.id, content: (p.content ?? "").slice(0, 80), author: { handle: p.author?.handle ?? "?" }, timestamp: p.timestamp ?? "" })));
      setLoading(false);
      onLoaded?.();
    }).catch(() => { setLoading(false); onLoaded?.(); });
  }, [onLoaded]);
  if (loading) return <div className="flex h-24 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent-color)] border-t-transparent" /></div>;
  return (
    <div className="space-y-1 overflow-hidden p-2">
      {posts.length === 0 ? (
        <p className="text-xs text-zinc-500">No posts yet.</p>
      ) : (
        posts.map((p) => (
          <Link key={p.id} href="/feed" className="block rounded px-2 py-1.5 text-xs hover:bg-white/5">
            <span className="line-clamp-2 text-zinc-200">{p.content}{p.content.length >= 80 ? "…" : ""}</span>
            <span className="text-[10px] text-zinc-500">@{p.author.handle}</span>
          </Link>
        ))
      )}
      <Link href="/feed" className="mt-2 block text-center text-[11px] text-[var(--accent-color)] hover:underline">Open full feed</Link>
    </div>
  );
}

const PLACEHOLDERS: Partial<Record<WidgetId, { title: string; href: string; label?: string }>> = {};

export function WidgetContent({ widgetId, onLoaded }: WidgetContentProps) {
  switch (widgetId) {
    case "watchlist":
      return <WatchlistWidget widgetId={widgetId} onLoaded={onLoaded} />;
    case "market-overview":
      return <MarketOverviewWidget widgetId={widgetId} onLoaded={onLoaded} />;
    case "fear-greed":
      return <FearGreedWidget widgetId={widgetId} onLoaded={onLoaded} />;
    case "streaks":
      return <StreaksWidget />;
    case "journal-summary":
      return <JournalSummaryWidget />;
    case "xp-rank":
      return <XpRankWidget />;
    case "prediction-markets":
      return <PredictionMarketsWidget />;
    case "custom-note":
      return <CustomNoteWidget widgetId={widgetId} onLoaded={onLoaded} />;
    case "news-feed":
      return <NewsFeedWidget widgetId={widgetId} onLoaded={onLoaded} />;
    case "economic-calendar":
      return <EconomicCalendarWidget widgetId={widgetId} onLoaded={onLoaded} />;
    case "sector-heatmap":
      return <SectorHeatmapWidget widgetId={widgetId} onLoaded={onLoaded} />;
    case "top-movers":
      return <TopMoversWidget widgetId={widgetId} onLoaded={onLoaded} />;
    case "live-chart":
      return <LiveChartWidget widgetId={widgetId} onLoaded={onLoaded} />;
    case "ai-assistant":
      return <AIAssistantWidget />;
    case "ceo-alerts":
      return <CEOAlertsWidget widgetId={widgetId} onLoaded={onLoaded} />;
    case "crypto-dashboard":
      return <CryptoDashboardWidget widgetId={widgetId} onLoaded={onLoaded} />;
    case "community-feed":
      return <CommunityFeedWidget widgetId={widgetId} onLoaded={onLoaded} />;
    case "sentiment-radar":
      return <SentimentRadarWidget onLoaded={onLoaded} />;
    default: {
      const p = PLACEHOLDERS[widgetId] as { title: string; href: string; label?: string } | undefined;
      if (p) return <PlaceholderWidget title={p.title} href={p.href} label={p.label} />;
      return <div className="p-3 text-xs text-zinc-500">{widgetId}</div>;
    }
  }
}
