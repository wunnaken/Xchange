"use client";

import { useEffect, useMemo, useState } from "react";
import type { MarketNewsArticle } from "../api/news/route";
import { SECTOR_KEYWORDS } from "../../lib/sentiment-radar";

// ─── Time util ────────────────────────────────────────────────────────────────

function formatTimeAgo(iso: string) {
  if (!iso) return "";
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diffMs / 60_000);
    if (m < 1) return "Just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch { return ""; }
}

function isBreaking(publishedAt: string): boolean {
  try { return Date.now() - new Date(publishedAt).getTime() < 30 * 60_000; }
  catch { return false; }
}

// ─── Sentiment (client-side keyword scoring) ──────────────────────────────────

const POS = new Set(["surge", "rally", "gain", "rise", "jump", "boom", "growth", "profit", "beat", "record", "bullish", "upgrade", "strong", "soar", "advance", "positive", "outperform", "robust", "recovery", "expand", "high", "win"]);
const NEG = new Set(["crash", "drop", "fall", "decline", "slump", "loss", "miss", "bearish", "downgrade", "weak", "plunge", "tumble", "retreat", "fear", "sell", "negative", "recession", "deficit", "risk", "warning", "cut", "layoff", "default"]);

function scoreSentiment(title: string, desc?: string | null): "bullish" | "bearish" | "neutral" {
  const words = [title, desc].filter(Boolean).join(" ").toLowerCase().split(/\W+/);
  let s = 0;
  for (const w of words) {
    if (POS.has(w)) s++;
    if (NEG.has(w)) s--;
  }
  return s > 0 ? "bullish" : s < 0 ? "bearish" : "neutral";
}

// ─── Sector detection ─────────────────────────────────────────────────────────

const SECTOR_SHORT: Record<string, string> = {
  "Communication Services": "Comms",
  "Consumer Discretionary": "Disc.",
  "Consumer Staples": "Staples",
  "Real Estate": "Real Est.",
};
function shortSector(s: string) { return SECTOR_SHORT[s] ?? s; }

function detectSectors(title: string, desc?: string | null): string[] {
  const lower = [title, desc].filter(Boolean).join(" ").toLowerCase();
  const found: string[] = [];
  for (const [sector, kws] of Object.entries(SECTOR_KEYWORDS)) {
    if (kws.some((kw) => lower.includes(kw.toLowerCase()))) {
      found.push(sector);
      if (found.length === 2) break;
    }
  }
  return found;
}

// ─── Ticker extraction ────────────────────────────────────────────────────────

const KNOWN_TICKERS = [
  "AAPL","MSFT","NVDA","GOOGL","GOOG","META","AMZN","TSLA","JPM","BAC","GS","MS","WFC",
  "JNJ","PFE","UNH","ABBV","MRK","XOM","CVX","COP","WMT","HD","COST","TGT","PG","KO",
  "PEP","DIS","NFLX","CMCSA","AMD","INTC","CRM","ORCL","IBM","QCOM","CAT","BA","GE","DE",
  "T","VZ","NEE","DUK","V","MA","BRK","PYPL","SPY","QQQ","IWM","DIA","GLD","TLT",
  "BTC","ETH","SOL","XRP","BNB","ADA","DOGE",
];

function extractTickers(title: string, desc?: string | null): string[] {
  const text = [title, desc].filter(Boolean).join(" ");
  const found = new Set<string>();
  for (const t of KNOWN_TICKERS) {
    if (new RegExp(`\\b${t}\\b`).test(text)) {
      found.add(t);
      if (found.size === 4) break;
    }
  }
  return [...found];
}

// ─── Enriched article ─────────────────────────────────────────────────────────

type EnrichedArticle = MarketNewsArticle & {
  sentiment: "bullish" | "bearish" | "neutral";
  sectors: string[];
  tickers: string[];
  breaking: boolean;
};

function enrich(a: MarketNewsArticle): EnrichedArticle {
  return {
    ...a,
    sentiment: scoreSentiment(a.title, a.description),
    sectors: detectSectors(a.title, a.description),
    tickers: extractTickers(a.title, a.description),
    breaking: isBreaking(a.publishedAt),
  };
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function BreakingBadge() {
  return (
    <span className="rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
      Breaking
    </span>
  );
}

function SentimentBadge({ s }: { s: "bullish" | "bearish" | "neutral" }) {
  if (s === "neutral") return null;
  const cls = s === "bullish"
    ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
    : "text-red-400 bg-red-400/10 border-red-400/20";
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {s === "bullish" ? "▲" : "▼"} {s}
    </span>
  );
}

function SectorChip({ label, onClick }: { label: string; onClick?: () => void }) {
  const base = "rounded border border-[var(--accent-color)]/25 bg-[var(--accent-color)]/8 px-1.5 py-0.5 text-[10px] text-[var(--accent-color)]/70 transition-colors";
  if (onClick) return (
    <button type="button" onClick={onClick} className={`${base} hover:bg-[var(--accent-color)]/15 hover:text-[var(--accent-color)]`}>
      {shortSector(label)}
    </button>
  );
  return <span className={base}>{shortSector(label)}</span>;
}

function TickerChip({ ticker }: { ticker: string }) {
  return (
    <span className="rounded border border-blue-400/20 bg-blue-400/5 px-1.5 py-0.5 text-[10px] font-mono text-blue-400/70">
      ${ticker}
    </span>
  );
}

// ─── Article card (image + badges) ───────────────────────────────────────────

function StoryCard({ article, onOpen, onSectorClick }: {
  article: EnrichedArticle;
  onOpen: () => void;
  onSectorClick: (s: string) => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  const showImg = !!article.urlToImage && !imgErr;
  const hasTags = article.sectors.length > 0 || article.tickers.length > 0;

  return (
    <li className="flex flex-col rounded-xl border border-white/10 bg-[#0F1520] transition-colors hover:border-[var(--accent-color)]/30">
      <button type="button" onClick={onOpen} className="flex w-full gap-4 p-4 text-left">
        <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-lg bg-zinc-800/50">
          {showImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/news-image?url=${encodeURIComponent(article.urlToImage!)}`}
              alt="" className="h-full w-full object-cover" onError={() => setImgErr(true)} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl text-white/20">📰</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {(article.breaking || article.sentiment !== "neutral") && (
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              {article.breaking && <BreakingBadge />}
              <SentimentBadge s={article.sentiment} />
            </div>
          )}
          <p className="line-clamp-2 text-sm font-medium leading-snug text-zinc-100">{article.title}</p>
          <p className="mt-1 text-xs text-zinc-500">{article.source} · {formatTimeAgo(article.publishedAt)}</p>
        </div>
      </button>
      {hasTags && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-white/5 px-4 pb-3 pt-2">
          {article.sectors.map((s) => <SectorChip key={s} label={s} onClick={() => onSectorClick(s)} />)}
          {article.tickers.map((t) => <TickerChip key={t} ticker={t} />)}
        </div>
      )}
    </li>
  );
}

// ─── Compact row (title-only) ─────────────────────────────────────────────────

function CompactRow({ article, onOpen, onSectorClick }: {
  article: EnrichedArticle;
  onOpen: () => void;
  onSectorClick: (s: string) => void;
}) {
  return (
    <li className="flex items-start gap-3 border-b border-white/5 py-3 last:border-0">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        {(article.breaking || article.sentiment !== "neutral") && (
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {article.breaking && <BreakingBadge />}
            <SentimentBadge s={article.sentiment} />
          </div>
        )}
        <p className="line-clamp-1 text-sm font-medium text-zinc-100">{article.title}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{article.source} · {formatTimeAgo(article.publishedAt)}</p>
      </button>
      {(article.sectors.length > 0 || article.tickers.length > 0) && (
        <div className="flex shrink-0 flex-wrap items-center gap-1 pt-0.5">
          {article.sectors.map((s) => <SectorChip key={s} label={s} onClick={() => onSectorClick(s)} />)}
          {article.tickers.map((t) => <TickerChip key={t} ticker={t} />)}
        </div>
      )}
    </li>
  );
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

const NEWS_CACHE_KEY = "quantivtrade-news-last";
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function getCachedNews(): { articles: MarketNewsArticle[]; savedAt: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(NEWS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { articles?: MarketNewsArticle[]; savedAt?: string };
    if (!Array.isArray(parsed?.articles) || parsed.articles.length === 0 || !parsed.savedAt) return null;
    if (Date.now() - new Date(parsed.savedAt).getTime() > CACHE_MAX_AGE_MS) return null;
    return { articles: parsed.articles, savedAt: parsed.savedAt };
  } catch { return null; }
}

function setCachedNews(articles: MarketNewsArticle[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({ articles, savedAt: new Date().toISOString() }));
  } catch { /* ignore */ }
}

// ─── Categories ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "crypto", label: "Crypto" },
  { id: "macro", label: "Macro" },
  { id: "geopolitical", label: "Geopolitical" },
  { id: "earnings", label: "Earnings" },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewsView() {
  const [articles, setArticles] = useState<MarketNewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingLiveFeed, setUsingLiveFeed] = useState(false);
  const [showingCached, setShowingCached] = useState(false);
  const [featuredImgErr, setFeaturedImgErr] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [compact, setCompact] = useState(false);
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);

  const openInNewTab = (url: string) => {
    if (url && url !== "#") window.open(url, "_blank", "noopener,noreferrer");
  };

  const applyData = (list: MarketNewsArticle[], live: boolean) => {
    setArticles(list);
    setUsingLiveFeed(live);
    setLastUpdatedAt(new Date());
    setCachedNews(list);
    setShowingCached(false);
  };

  const applyCache = () => {
    const cached = getCachedNews();
    if (cached) {
      setArticles(cached.articles);
      setLastUpdatedAt(new Date(cached.savedAt));
      setShowingCached(true);
    } else {
      setArticles([]);
      setShowingCached(false);
    }
  };

  const fetchNews = (cat: string, showLoading = true) => {
    if (showLoading) setLoading(true);
    fetch(`/api/news?category=${encodeURIComponent(cat)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { articles?: MarketNewsArticle[]; usingLiveFeed?: boolean }) => {
        const list = data?.articles ?? [];
        if (list.length > 0) applyData(list, Boolean(data?.usingLiveFeed));
        else applyCache();
      })
      .catch(applyCache)
      .finally(() => { if (showLoading) setLoading(false); });
  };

  // Reset featured image error when articles change
  useEffect(() => { queueMicrotask(() => setFeaturedImgErr(false)); }, [articles]);

  // Load on category change: show cache instantly, then fetch
  useEffect(() => {
    setSectorFilter(null);
    const cached = getCachedNews();
    if (cached) {
      setArticles(cached.articles);
      setLastUpdatedAt(new Date(cached.savedAt));
      setShowingCached(true);
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/news?category=${encodeURIComponent(category)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { articles?: MarketNewsArticle[]; usingLiveFeed?: boolean }) => {
        if (cancelled) return;
        const list = data?.articles ?? [];
        if (list.length > 0) applyData(list, Boolean(data?.usingLiveFeed));
        else applyCache();
      })
      .catch(() => { if (!cancelled) applyCache(); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Background auto-refresh every 5 minutes
  useEffect(() => {
    const t = setInterval(() => fetchNews(category, false), 5 * 60_000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Enrich all articles once
  const enriched = useMemo(() => articles.map(enrich), [articles]);

  // Sectors that appear in the current article set
  const availableSectors = useMemo(() => {
    const set = new Set<string>();
    for (const a of enriched) for (const s of a.sectors) set.add(s);
    return [...set].sort();
  }, [enriched]);

  // Apply sector filter
  const filtered = useMemo(() =>
    sectorFilter ? enriched.filter((a) => a.sectors.includes(sectorFilter)) : enriched,
    [enriched, sectorFilter],
  );

  const featured = filtered[0] ?? null;
  const rest = filtered.slice(1);

  function lastUpdatedText() {
    if (!lastUpdatedAt) return "";
    const m = Math.floor((Date.now() - lastUpdatedAt.getTime()) / 60_000);
    if (m < 1) return "Just now";
    if (m === 1) return "1 min ago";
    return `${m} mins ago`;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--accent-color)]/80">
              Live
            </p>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
            Market news that moves
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            {usingLiveFeed
              ? "Key headlines on equities, macro, rates, and commodities."
              : "Key headlines on equities, macro, rates, and commodities. Add NEWSDATA_API_KEY in .env.local for live stories and images."}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {lastUpdatedAt && (
            <div className="text-right">
              <p className="text-xs text-zinc-500">Last updated: {lastUpdatedText()}</p>
              {showingCached && <p className="mt-0.5 text-[10px] text-zinc-500">Showing latest we have from today</p>}
            </div>
          )}
          {/* View toggle */}
          <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5">
            <button type="button" onClick={() => { setCompact(false); setSectorFilter(null); }}
              className={`rounded px-2.5 py-1.5 transition ${!compact ? "bg-white/15 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
              title="Card view">
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 16 16">
                <rect x="0" y="0" width="7" height="7" rx="1"/><rect x="9" y="0" width="7" height="7" rx="1"/>
                <rect x="0" y="9" width="7" height="7" rx="1"/><rect x="9" y="9" width="7" height="7" rx="1"/>
              </svg>
            </button>
            <button type="button" onClick={() => { setCompact(true); setSectorFilter(null); }}
              className={`rounded px-2.5 py-1.5 transition ${compact ? "bg-white/15 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
              title="Compact list">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 16 16">
                <line x1="0" y1="3" x2="16" y2="3"/><line x1="0" y1="8" x2="16" y2="8"/><line x1="0" y1="13" x2="16" y2="13"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Category filters */}
      <div className="mb-3 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button key={c.id} type="button" onClick={() => setCategory(c.id)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              category === c.id
                ? "border-[var(--accent-color)]/50 bg-[var(--accent-color)]/10 text-[var(--accent-color)]"
                : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-zinc-200"
            }`}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Sector filter pills — only for "all" category or compact list */}
      {(category === "all" || compact) && availableSectors.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-zinc-600">Sector</span>
          {sectorFilter && (
            <button type="button" onClick={() => setSectorFilter(null)}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-500 hover:text-zinc-300">
              Clear ×
            </button>
          )}
          {availableSectors.map((s) => (
            <button key={s} type="button" onClick={() => setSectorFilter(sectorFilter === s ? null : s)}
              className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                sectorFilter === s
                  ? "border-[var(--accent-color)]/50 bg-[var(--accent-color)]/10 text-[var(--accent-color)]"
                  : "border-[var(--accent-color)]/20 bg-[var(--accent-color)]/5 text-[var(--accent-color)]/60 hover:border-[var(--accent-color)]/40 hover:text-[var(--accent-color)]/90"
              }`}>
              {shortSector(s)}
            </button>
          ))}
        </div>
      )}
      {!((category === "all" || compact) && availableSectors.length > 0) && <div className="mb-6" />}

      {/* Loading skeleton */}
      {loading ? (
        <div className="space-y-6">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0F1520]">
            <div className="h-64 animate-pulse bg-white/5 sm:h-80" />
            <div className="space-y-3 p-6">
              <div className="h-4 w-1/3 animate-pulse rounded bg-white/10" />
              <div className="h-6 w-full animate-pulse rounded bg-white/10" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-white/10" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1,2,3,4,5,6].map((i) => (
              <div key={i} className="flex gap-4 rounded-xl border border-white/10 bg-[#0F1520] p-4">
                <div className="h-20 w-24 shrink-0 animate-pulse rounded-lg bg-white/10" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-full animate-pulse rounded bg-white/10" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-white/10" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-[#0F1520] p-8 text-center">
          <p className="text-sm text-zinc-500">
            {sectorFilter ? `No articles matching "${sectorFilter}" — try clearing the sector filter.` : "Data temporarily unavailable — refresh to try again."}
          </p>
          {!sectorFilter && (
            <button type="button" onClick={() => fetchNews(category, true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/10">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          )}
        </div>
      ) : compact ? (
        /* ── Compact list view ─────────────────────────────────────── */
        <div className="rounded-xl border border-white/10 bg-[#0F1520] px-4">
          <ul>
            {filtered.map((article, i) => (
              <CompactRow
                key={`${article.url}-${i}`}
                article={article}
                onOpen={() => openInNewTab(article.url)}
                onSectorClick={(s) => setSectorFilter(sectorFilter === s ? null : s)}
              />
            ))}
          </ul>
        </div>
      ) : (
        /* ── Card view ─────────────────────────────────────────────── */
        <div className="space-y-8">
          {/* Featured story */}
          {featured && (
            <article className="overflow-hidden rounded-2xl border border-white/10 bg-[#0F1520] transition-colors hover:border-white/15">
              {/* Use <a> so SectorChip <button>s below don't nest inside a <button> */}
              <a href={featured.url} target="_blank" rel="noopener noreferrer" className="block w-full text-left">
                <div className="relative aspect-[2/1] w-full overflow-hidden bg-zinc-900 sm:aspect-[16/9]">
                  {featured.urlToImage && !featuredImgErr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/news-image?url=${encodeURIComponent(featured.urlToImage)}`}
                      alt="" className="h-full w-full object-cover blur-sm scale-105" onError={() => setFeaturedImgErr(true)} />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#0A0E1A] to-zinc-900">
                      <span className="text-4xl text-white/20">📰</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-6">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      {featured.breaking && <BreakingBadge />}
                      <SentimentBadge s={featured.sentiment} />
                      <span className="text-xs font-medium uppercase tracking-wider text-[var(--accent-color)]">
                        {featured.source}
                      </span>
                    </div>
                    <h2 className="text-xl font-semibold leading-tight text-white sm:text-2xl">{featured.title}</h2>
                    <p className="mt-1 text-xs text-zinc-300">{formatTimeAgo(featured.publishedAt)}</p>
                  </div>
                </div>
                <div className="p-6 pb-3">
                  {featured.description && (
                    <p className="line-clamp-2 text-sm leading-relaxed text-zinc-400">{featured.description}</p>
                  )}
                  <span className="mt-3 inline-block text-sm font-medium text-[var(--accent-color)] hover:underline">
                    Read full story →
                  </span>
                </div>
              </a>
              {/* Sector/ticker chips outside the <a> to avoid nested interactive elements */}
              {(featured.sectors.length > 0 || featured.tickers.length > 0) && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-white/5 px-6 pb-4 pt-3">
                  {featured.sectors.map((s) => (
                    <SectorChip key={s} label={s} onClick={() => setSectorFilter(sectorFilter === s ? null : s)} />
                  ))}
                  {featured.tickers.map((t) => <TickerChip key={t} ticker={t} />)}
                </div>
              )}
            </article>
          )}

          {/* All remaining headlines */}
          {rest.length > 0 && (
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
                  More headlines
                  <span className="ml-2 font-normal text-zinc-600">({rest.length})</span>
                </h2>
              </div>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((article, i) => (
                  <StoryCard
                    key={`${article.url}-${i}`}
                    article={article}
                    onOpen={() => openInNewTab(article.url)}
                    onSectorClick={(s) => setSectorFilter(sectorFilter === s ? null : s)}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
