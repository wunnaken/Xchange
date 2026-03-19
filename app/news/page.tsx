"use client";

import { useEffect, useState } from "react";
import type { MarketNewsArticle } from "../api/news/route";

function formatTimeAgo(iso: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffM = Math.floor(diffMs / 60000);
    if (diffM < 1) return "Just now";
    if (diffM < 60) return `${diffM}m ago`;
    const diffH = Math.floor(diffM / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString();
  } catch {
    return "";
  }
}

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "markets", label: "Markets" },
  { id: "crypto", label: "Crypto" },
  { id: "macro", label: "Macro" },
  { id: "geopolitical", label: "Geopolitical" },
  { id: "earnings", label: "Earnings" },
] as const;

const NEWS_CACHE_KEY = "xchange-news-last";
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function getCachedNews(): { articles: MarketNewsArticle[]; savedAt: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(NEWS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { articles?: MarketNewsArticle[]; savedAt?: string };
    if (!Array.isArray(parsed?.articles) || parsed.articles.length === 0 || !parsed.savedAt) return null;
    const age = Date.now() - new Date(parsed.savedAt).getTime();
    if (age > CACHE_MAX_AGE_MS) return null;
    return { articles: parsed.articles, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

function setCachedNews(articles: MarketNewsArticle[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      NEWS_CACHE_KEY,
      JSON.stringify({ articles, savedAt: new Date().toISOString() })
    );
  } catch {
    // ignore
  }
}

function StoryCard({
  article,
  onOpen,
}: {
  article: MarketNewsArticle;
  onOpen: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const showImg = article.urlToImage && !imgError;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full gap-4 rounded-xl border border-white/10 bg-[#0F1520] p-4 text-left transition-colors hover:border-[var(--accent-color)]/30 hover:bg-white/5"
      >
        <div className="relative h-20 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-800/50">
          {showImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/news-image?url=${encodeURIComponent(article.urlToImage!)}`}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl text-white/20">
              📰
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-zinc-100">
            {article.title}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {article.source} · {formatTimeAgo(article.publishedAt)}
          </p>
        </div>
      </button>
    </li>
  );
}

export default function NewsPage() {
  const [articles, setArticles] = useState<MarketNewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingLiveFeed, setUsingLiveFeed] = useState(false);
  const [showingCached, setShowingCached] = useState(false);
  const [featuredImageError, setFeaturedImageError] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const openInNewTab = (url: string) => {
    if (url && url !== "#") window.open(url, "_blank", "noopener,noreferrer");
  };

  const fetchNews = (cat: string, showLoading = true) => {
    if (showLoading) setLoading(true);
    fetch(`/api/news?category=${encodeURIComponent(cat)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { articles?: MarketNewsArticle[]; usingLiveFeed?: boolean; fromCache?: boolean }) => {
        const list = data?.articles ?? [];
        if (list.length > 0) {
          setArticles(list);
          setUsingLiveFeed(Boolean(data?.usingLiveFeed));
          setLastUpdatedAt(new Date());
          setCachedNews(list);
          setShowingCached(false);
        } else {
          const cached = getCachedNews();
          if (cached) {
            setArticles(cached.articles);
            setLastUpdatedAt(new Date(cached.savedAt));
            setShowingCached(true);
          } else {
            setArticles([]);
            setShowingCached(false);
          }
        }
      })
      .catch(() => {
        const cached = getCachedNews();
        if (cached) {
          setArticles(cached.articles);
          setLastUpdatedAt(new Date(cached.savedAt));
          setShowingCached(true);
        } else {
          setArticles([]);
          setShowingCached(false);
        }
      })
      .finally(() => { if (showLoading) setLoading(false); });
  };

  useEffect(() => {
    queueMicrotask(() => setFeaturedImageError(false));
  }, [articles]);

  useEffect(() => {
    const cached = getCachedNews();
    if (cached) {
      setArticles(cached.articles);
      setLastUpdatedAt(new Date(cached.savedAt));
      setShowingCached(true);
    }
    let cancelled = false;
    fetch(`/api/news?category=${encodeURIComponent(category)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { articles?: MarketNewsArticle[]; usingLiveFeed?: boolean; fromCache?: boolean }) => {
        if (cancelled) return;
        const list = data?.articles ?? [];
        if (list.length > 0) {
          setArticles(list);
          setUsingLiveFeed(Boolean(data?.usingLiveFeed));
          setLastUpdatedAt(new Date());
          setCachedNews(list);
          setShowingCached(false);
        } else {
          const cached = getCachedNews();
          if (cached) {
            setArticles(cached.articles);
            setLastUpdatedAt(new Date(cached.savedAt));
            setShowingCached(true);
          } else {
            setArticles([]);
            setShowingCached(false);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          const cached = getCachedNews();
          if (cached) {
            setArticles(cached.articles);
            setLastUpdatedAt(new Date(cached.savedAt));
            setShowingCached(true);
          } else {
            setArticles([]);
            setShowingCached(false);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [category]);

  useEffect(() => {
    const t = setInterval(() => fetchNews(category, false), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [category]);

  const featured = articles.length > 0 ? articles[0] : null;
  const rest = articles.slice(1, 5);

  function lastUpdatedText(): string {
    if (!lastUpdatedAt) return "";
    const mins = Math.floor((Date.now() - lastUpdatedAt.getTime()) / 60000);
    if (mins < 1) return "Just now";
    if (mins === 1) return "1 min ago";
    return `${mins} mins ago`;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--accent-color)]/80">
            Real-time News
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
            Market news that moves
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            {usingLiveFeed
              ? "Key headlines on equities, macro, rates, and commodities."
              : "Key headlines on equities, macro, rates, and commodities. Add NEWSDATA_API_KEY in .env.local for live stories and images."}
          </p>
        </div>
        {lastUpdatedAt && (
          <div className="shrink-0 text-right">
            <p className="text-xs text-zinc-500">
              Last updated: {lastUpdatedText()}
            </p>
            {showingCached && (
              <p className="mt-0.5 text-[10px] text-zinc-500">
                Showing latest we have from today
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              category === c.id
                ? "border-[var(--accent-color)]/50 bg-[var(--accent-color)]/10 text-[var(--accent-color)]"
                : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-zinc-200"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

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
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex gap-4 rounded-xl border border-white/10 bg-[#0F1520] p-4">
                <div className="h-20 w-24 flex-shrink-0 animate-pulse rounded-lg bg-white/10" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-full animate-pulse rounded bg-white/10" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-white/10" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Featured story */}
          {featured && (
            <article className="overflow-hidden rounded-2xl border border-white/10 bg-[#0F1520] transition-colors hover:border-white/15">
              <button
                type="button"
                onClick={() => openInNewTab(featured.url)}
                className="block w-full cursor-pointer text-left"
              >
                <div className="relative aspect-[2/1] w-full bg-zinc-800/50 sm:aspect-[21/9]">
                  {featured.urlToImage && !featuredImageError ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/news-image?url=${encodeURIComponent(featured.urlToImage)}`}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={() => setFeaturedImageError(true)}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#0A0E1A] to-zinc-900">
                      <span className="text-4xl text-white/20">📰</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-6 text-left">
                    <span className="text-xs font-medium uppercase tracking-wider text-[var(--accent-color)]">
                      {featured.source}
                    </span>
                    <h2 className="mt-1 text-xl font-semibold leading-tight text-white sm:text-2xl">
                      {featured.title}
                    </h2>
                    <p className="mt-1 text-xs text-zinc-300">
                      {formatTimeAgo(featured.publishedAt)}
                    </p>
                  </div>
                </div>
                <div className="p-6">
                  {featured.description && (
                    <p className="text-sm leading-relaxed text-zinc-400 line-clamp-2">
                      {featured.description}
                    </p>
                  )}
                  <span className="mt-3 inline-block text-sm font-medium text-[var(--accent-color)] hover:underline">
                    Read full story →
                  </span>
                </div>
              </button>
            </article>
          )}

          {/* More headlines — 4 items, auto-updated with feed */}
          {rest.length > 0 && (
            <section>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500">
                More headlines
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
                {rest.map((article, i) => (
                  <StoryCard
                    key={`${article.url}-${i}`}
                    article={article}
                    onOpen={() => openInNewTab(article.url)}
                  />
                ))}
              </ul>
            </section>
          )}

          {articles.length === 0 && !loading && (
            <div className="rounded-xl border border-white/10 bg-[#0F1520] p-8 text-center">
              <p className="text-sm text-zinc-500">
                Data temporarily unavailable — refresh to try again
              </p>
              <button
                type="button"
                onClick={() => fetchNews(category, true)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/10"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Refresh
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
