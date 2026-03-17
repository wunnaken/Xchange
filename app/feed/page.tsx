"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../components/AuthContext";
import { isSpecialAccount } from "../../lib/special-account";
import { getInitials as getSuggestedInitials } from "../../lib/suggested-people";
import { fetchWatchlist, type WatchlistItem } from "../../lib/watchlist-api";
import { getPriceAlerts, getAlertsForTicker, isNearTrigger } from "../../lib/price-alerts";
import { useLivePrices } from "../../lib/hooks/useLivePrice";
import { PriceDisplay } from "../../components/PriceDisplay";
import { getCachedBriefing, getBriefingDate, setBriefingSeen } from "../../lib/briefing";
import { MorningBriefing } from "../../components/MorningBriefing";
import type { User } from "../../components/AuthContext";
import { loadStreaks, tickBriefingStreak } from "../../lib/engagement/streaks";
import { StreakDetailModal } from "../../components/StreakDetailModal";
import { useToast } from "../../components/ToastContext";
import { triggerConfetti } from "../../lib/confetti";
import { addXPFromPost, addXPFromReaction } from "../../lib/engagement/xp";
import { VerifiedBadge } from "../../components/VerifiedBadge";
import { isVerified } from "../../lib/verified";
import { TrackRecordVerifiedBadge } from "../../components/TrackRecordVerifiedBadge";
import { getBrokerConnection } from "../../lib/broker-connection";

const VERIFIED_TOOLTIP_SEEN_KEY = "xchange-verified-badge-tooltip-seen";

function VerifiedBadgeWithTooltip() {
  const { user } = useAuth();
  const [showTooltip, setShowTooltip] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUserVerified = isVerified(user?.email);

  const onMouseEnter = useCallback(() => {
    if (isUserVerified) return;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(VERIFIED_TOOLTIP_SEEN_KEY)) return;
    setShowTooltip(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setShowTooltip(false);
      try { sessionStorage.setItem(VERIFIED_TOOLTIP_SEEN_KEY, "1"); } catch {}
      timerRef.current = null;
    }, 3000);
  }, [isUserVerified]);

  const onMouseLeave = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setShowTooltip(false);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <span className="relative inline-flex" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <VerifiedBadge size={16} />
      {showTooltip && !isUserVerified && (
        <span className="absolute left-0 top-full z-50 mt-1 max-w-[200px] rounded-lg border border-white/20 bg-[#0F1520] px-2.5 py-1.5 text-xs text-zinc-200 shadow-xl">
          This trader is Verified ✓ Get your own badge for $9/month
        </span>
      )}
    </span>
  );
}

function isOnlineStable(handle: string): boolean {
  let h = 0;
  for (let i = 0; i < handle.length; i++) h = (h << 5) - h + handle.charCodeAt(i);
  return Math.abs(h % 100) < 45;
}

const CARD_BG_VAR = "var(--app-card)";
const AI_SHARE_KEY = "xchange-ai-share";

function getInitials(user: User) {
  const name = (user.name || user.username || user.email || "?").trim();
  if (!name) return "?";
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffM = Math.floor(diffMs / 60000);
  if (diffM < 1) return "Now";
  if (diffM < 60) return `${diffM}m`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d`;
  return d.toLocaleDateString();
}

type TrendingTicker = { symbol: string; name: string; price: number; changePercent: number };

const ACTIVE_COMMUNITIES = [
  { name: "Global Equities Flow", members: "1.2k", id: "equities" },
  { name: "Global Macro & Rates", members: "640", id: "macro" },
  { name: "Crypto & High-Beta", members: "480", id: "crypto" },
];

type ReactionKey = "bullish" | "bearish" | "informative" | "risky" | "interesting";
const REACTIONS: { key: ReactionKey; label: string; emoji: string }[] = [
  { key: "bullish", label: "Bullish", emoji: "📈" },
  { key: "bearish", label: "Bearish", emoji: "📉" },
  { key: "informative", label: "Informative", emoji: "💡" },
  { key: "risky", label: "Risky", emoji: "⚠️" },
  { key: "interesting", label: "Interesting", emoji: "🔥" },
];

type FeedPost = {
  id: string;
  author: { name: string; handle: string; avatar: string | null; verified?: boolean };
  content: string;
  timestamp: string;
  image?: string | null;
  reactions?: Record<ReactionKey, number>;
  comments: number;
};

export default function FeedPage() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [composerText, setComposerText] = useState("");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [reactionCounts, setReactionCounts] = useState<Record<string, Record<ReactionKey, number>>>({});
  const [userReactions, setUserReactions] = useState<Record<string, Partial<Record<ReactionKey, boolean>>>>({});
  const [postsLoading, setPostsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(true);
  const watchlistSymbols = watchlist.map((i) => i.ticker);
  const watchlistQuotes = useLivePrices(watchlistSymbols);
  type FollowedProfile = { id: string; name: string; username: string };
  const [followedProfiles, setFollowedProfiles] = useState<FollowedProfile[]>([]);
  const [showBriefing, setShowBriefing] = useState(false);
  const [streakData, setStreakData] = useState(() => loadStreaks());
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [liveCount, setLiveCount] = useState(1200);
  const [trendingTickers, setTrendingTickers] = useState<TrendingTicker[]>([]);
  const [trendingTickersLoading, setTrendingTickersLoading] = useState(true);
  const trendingSymbols = trendingTickers.map((t) => (t.symbol ?? "").toUpperCase()).filter(Boolean);
  const liveTrending = useLivePrices(trendingSymbols.length > 0 ? trendingSymbols : ["SPY", "QQQ", "BTC", "ETH", "GLD", "USO"]);
  const [trendingBannerDismissed, setTrendingBannerDismissed] = useState(false);
  const [trendingBannerMessage, setTrendingBannerMessage] = useState<{ ticker: string; pct: number } | null>(null);
  const [newPostsCount, setNewPostsCount] = useState(0);
  const [showNewPostsBanner, setShowNewPostsBanner] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loadCountRef = useRef(0);
  const feedBottomRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    setStreakData(loadStreaks());
  }, [showBriefing]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(AI_SHARE_KEY);
      if (!raw) return;
      const { content } = JSON.parse(raw) as { content?: string };
      if (typeof content === "string" && content.trim()) {
        setComposerText(content);
        sessionStorage.removeItem(AI_SHARE_KEY);
      }
    } catch {
      sessionStorage.removeItem(AI_SHARE_KEY);
    }
  }, [pathname]);

  useEffect(() => {
    const messages: { ticker: string; pct: number }[] = [
      { ticker: "NVDA", pct: 340 },
      { ticker: "TSLA", pct: 210 },
      { ticker: "BTC", pct: 180 },
      { ticker: "SPY", pct: 95 },
      { ticker: "AAPL", pct: 120 },
    ];
    if (typeof window !== "undefined" && !window.sessionStorage.getItem("xchange-trending-banner-seen")) {
      setTrendingBannerMessage(messages[Math.floor(Math.random() * messages.length)]);
    }
  }, []);

  useEffect(() => {
    setLiveCount(500 + Math.floor(Math.random() * 1501));
  }, []);
  useEffect(() => {
    const t = setInterval(() => {
      setLiveCount((c) => Math.max(500, Math.min(2000, c + Math.floor((Math.random() - 0.5) * 80))));
    }, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/market-tickers", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Array<{ symbol: string; name: string; price: number; changePercent: number }>) => {
        if (cancelled || !Array.isArray(data)) return;
        setTrendingTickers(data.slice(0, 6).map((t) => ({ symbol: t.symbol, name: t.name, price: t.price, changePercent: t.changePercent })));
      })
      .catch(() => {
        if (!cancelled) setTrendingTickers([]);
      })
      .finally(() => {
        if (!cancelled) setTrendingTickersLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setShowNewPostsBanner(true), 30000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!showNewPostsBanner) return;
    const inc = setInterval(() => setNewPostsCount((n) => n + 1), 4000);
    return () => clearInterval(inc);
  }, [showNewPostsBanner]);

  const handleBriefingClose = useCallback(() => {
    setShowBriefing(false);
    setBriefingSeen();
    const { data, milestone } = tickBriefingStreak();
    setStreakData(data);
    if (milestone) {
      triggerConfetti({ duration: 2000 });
      toast.showToast(`📋 ${milestone} Day Briefing Streak! Keep learning.`, "celebration");
    }
  }, [toast]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 1200));
    setPosts((prev) => [...prev].sort(() => Math.random() - 0.5));
    setRefreshing(false);
    toast.showToast("Feed updated", "success");
  }, [toast]);

  const dismissTrendingBanner = useCallback(() => {
    setTrendingBannerDismissed(true);
    try {
      window.sessionStorage.setItem("xchange-trending-banner-seen", "1");
    } catch {}
  }, []);

  useEffect(() => {
    if (!refreshing) return;
    document.title = "Refreshing... — Xchange";
    return () => { document.title = "Xchange"; };
  }, [refreshing]);

  useEffect(() => {
    let cancelled = false;
    setPostsLoading(true);
    fetch("/api/posts?limit=20&offset=0", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { posts: [], reactionCounts: {}, userReactions: {} }))
      .then((data) => {
        if (cancelled) return;
        setPosts(data.posts ?? []);
        setReactionCounts(data.reactionCounts ?? {});
        setUserReactions(data.userReactions ?? {});
      })
      .catch(() => {
        if (!cancelled) setPosts([]);
      })
      .finally(() => {
        if (!cancelled) setPostsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profiles/followed", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { profiles: [] }))
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data.profiles) && data.profiles.length > 0) {
          setFollowedProfiles(data.profiles);
          return;
        }
        try {
          const raw = typeof window !== "undefined" && window.localStorage.getItem("xchange-follows");
          if (raw) {
            const parsed = JSON.parse(raw) as Array<{ id: string; name: string; username: string }>;
            if (Array.isArray(parsed) && parsed.length > 0) setFollowedProfiles(parsed);
          }
        } catch {
          // ignore
        }
      })
      .catch(() => {
        if (!cancelled) {
          try {
            const raw = typeof window !== "undefined" && window.localStorage.getItem("xchange-follows");
            if (raw) {
              const parsed = JSON.parse(raw) as Array<{ id: string; name: string; username: string }>;
              if (Array.isArray(parsed)) setFollowedProfiles(parsed);
            }
          } catch {}
        }
      });
    return () => { cancelled = true; };
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    setWatchlistLoading(true);
    fetchWatchlist()
      .then((list) => {
        if (!cancelled) setWatchlist(list);
      })
      .catch(() => {
        if (!cancelled) setWatchlist([]);
      })
      .finally(() => {
        if (!cancelled) setWatchlistLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);


  const handleReaction = async (postId: string, key: ReactionKey) => {
    const alreadyReacted = userReactions[postId]?.[key];
    setUserReactions((prev) => {
      const next = { ...prev };
      if (!next[postId]) next[postId] = {};
      next[postId] = { ...next[postId], [key]: !alreadyReacted };
      return next;
    });
    setReactionCounts((prev) => {
      const next = { ...prev };
      if (!next[postId]) next[postId] = { bullish: 0, bearish: 0, informative: 0, risky: 0, interesting: 0 };
      const count = next[postId][key];
      next[postId] = { ...next[postId], [key]: alreadyReacted ? Math.max(0, count - 1) : count + 1 };
      return next;
    });
    try {
      await fetch(`/api/posts/${postId}/reaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reaction_type: key }),
      });
      if (!alreadyReacted) addXPFromReaction();
    } catch {
      // revert on failure
      setUserReactions((prev) => ({ ...prev, [postId]: { ...prev[postId], [key]: alreadyReacted } }));
      setReactionCounts((prev) => ({
        ...prev,
        [postId]: { ...prev[postId], [key]: alreadyReacted ? (prev[postId]?.[key] ?? 0) + 1 : Math.max(0, (prev[postId]?.[key] ?? 1) - 1) },
      }));
    }
  };

  const handleSubmitPost = async () => {
    const text = composerText.trim();
    if (!text) return;
    setComposerText("");
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.post) {
        const postWithVerified = { ...data.post, author: { ...data.post.author, verified: isVerified(user?.email) } };
        setPosts((prev) => [postWithVerified, ...prev]);
        setReactionCounts((prev) => ({ ...prev, [data.post.id]: data.reactionCounts ?? {} }));
        setUserReactions((prev) => ({ ...prev, [data.post.id]: data.userReactions ?? {} }));
        addXPFromPost();
      }
    } catch {
      // ignore
    }
  };

  const POOL_POSTS: FeedPost[] = Array.from({ length: 20 }, (_, i) => {
    const handles = ["alex_r", "sam_c", "jordan_lee", "morgan_t", "casey_k"];
    const verified = i % 5 === 0 || i % 5 === 1;
    return {
      id: `pool-${i}`,
      author: { name: ["Alex R.", "Sam C.", "Jordan L.", "Morgan T.", "Casey K."][i % 5], handle: handles[i % 5], avatar: null, verified },
      content: ["Adding NVDA on dips.", "SPY holding 450 support.", "Macro: watching CPI tomorrow.", "Crypto flow improving.", "Long USD/JPY here."][i % 5] + " " + (i > 5 ? "Follow for more ideas." : ""),
      timestamp: new Date(Date.now() - i * 3600000).toISOString(),
      comments: i % 3,
      reactions: undefined,
    };
  });

  const loadMorePosts = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/posts?limit=5&offset=${posts.length}`, { credentials: "include" });
      const raw = await res.text();
      let data: { posts?: unknown[]; reactionCounts?: Record<string, unknown>; userReactions?: Record<string, unknown> } = {};
      if (raw.trim()) {
        try {
          data = JSON.parse(raw);
        } catch {
          data = {};
        }
      }
      if (res.ok && Array.isArray(data.posts) && data.posts.length > 0) {
        const postsList = data.posts as FeedPost[];
        setPosts((prev) => [...prev, ...postsList]);
        setReactionCounts((prev) => ({ ...prev, ...((data.reactionCounts ?? {}) as Record<string, Record<ReactionKey, number>>) }));
        setUserReactions((prev) => ({ ...prev, ...((data.userReactions ?? {}) as Record<string, Partial<Record<ReactionKey, boolean>>>) }));
        if (data.posts.length < 5) setHasMore(false);
      } else {
        const start = (loadCountRef.current * 5) % POOL_POSTS.length;
        const next = POOL_POSTS.slice(start, start + 5);
        if (next.length > 0) {
          setPosts((prev) => [...prev, ...next.map((p, j) => ({ ...p, id: p.id + "-" + loadCountRef.current + j }))]);
        }
        loadCountRef.current += 1;
        if (loadCountRef.current >= 3) setHasMore(false);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, posts.length]);

  useEffect(() => {
    const el = feedBottomRef.current?.parentElement ?? document.documentElement;
    const onScroll = () => {
      const bottom = el === document.documentElement ? el.scrollHeight - window.scrollY - window.innerHeight : (el as HTMLElement).scrollHeight - (el as HTMLElement).scrollTop - (el as HTMLElement).clientHeight;
      if (bottom < 300) loadMorePosts();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [loadMorePosts]);

  return (
    <>
      {showBriefing && (
        <MorningBriefing
          skipAnimation={getBriefingDate() === new Date().toISOString().slice(0, 10)}
          cachedFetchedAt={getCachedBriefing()?.fetchedAt ?? null}
          onClose={handleBriefingClose}
        />
      )}
      {showStreakModal && (
        <StreakDetailModal data={streakData} onClose={() => setShowStreakModal(false)} />
      )}
      <div className="flex">
        <main className="min-h-screen flex-1">
          <div className="mx-auto max-w-2xl px-4 py-6">
            {/* Live counter + Leaderboard + Streak pill */}
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="shrink-0 text-xs text-zinc-500">👁 {liveCount} traders active right now</p>
              <Link
                href="/leaderboard"
                className="group flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border border-[var(--accent-color)]/20 bg-[var(--accent-color)]/5 px-3 py-1.5 text-[var(--accent-color)] transition hover:border-[var(--accent-color)]/30 hover:bg-[var(--accent-color)]/10 hover:no-underline"
                title="Leaderboard"
                aria-label="Leaderboard"
              >
                <span className="text-base leading-none" aria-hidden>🏆</span>
                <span className="text-xs font-medium">Leaderboard</span>
              </Link>
              {user && streakData.loginStreak > 0 && (
                <button
                  type="button"
                  onClick={() => setShowStreakModal(true)}
                  className="shrink-0 rounded-full border border-[var(--accent-color)]/30 bg-[var(--accent-color)]/10 px-3 py-1 text-xs font-medium text-[var(--accent-color)] transition hover:bg-[var(--accent-color)]/20"
                >
                  🔥 {streakData.loginStreak} day streak
                </button>
              )}
            </div>
            {/* Trending alert banner — once per session */}
            {trendingBannerMessage && !trendingBannerDismissed && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm">
                <Link
                  href={`/search/${trendingBannerMessage.ticker}`}
                  className="font-medium text-amber-200 hover:underline"
                >
                  🚨 {trendingBannerMessage.ticker} is trending — mentioned {trendingBannerMessage.pct}% more than usual in the last hour
                </Link>
                <button type="button" onClick={dismissTrendingBanner} className="shrink-0 rounded p-1 text-zinc-400 hover:text-white" aria-label="Dismiss">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            )}
            {/* New posts banner — after 30s */}
            {showNewPostsBanner && newPostsCount > 0 && (
              <button
                type="button"
                onClick={() => { setShowNewPostsBanner(false); setNewPostsCount(0); handleRefresh(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className="mb-3 w-full rounded-xl border border-[var(--accent-color)]/40 bg-[var(--accent-color)]/20 px-4 py-2.5 text-sm font-medium text-[var(--accent-color)] transition hover:bg-[var(--accent-color)]/30"
              >
                ↑ {newPostsCount} new posts — click to refresh
              </button>
            )}
            <div className="mb-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => !refreshing && handleRefresh()}
                disabled={refreshing}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 text-zinc-400 transition hover:bg-white/5 hover:text-[var(--accent-color)] disabled:opacity-50"
                aria-label="Refresh feed"
                title="Refresh feed"
              >
                <svg className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <form
                action="/people"
                method="get"
                className="min-w-0 flex-1"
              >
                <input
                  type="search"
                  name="q"
                  placeholder="Search by name or @handle..."
                  className="w-full rounded-xl border border-white/10 bg-[#0F1520] px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors focus:border-[var(--accent-color)]/50"
                  aria-label="Search users"
                />
              </form>
              <button
                type="button"
                onClick={() => setShowBriefing(true)}
                className="flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-[#0F1520] px-4 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:border-[var(--accent-color)]/30 hover:bg-white/5 hover:text-[var(--accent-color)]"
              >
                <span>📋</span> Morning Briefing
              </button>
            </div>
            {/* Composer */}
            <section
              className="rounded-2xl border border-white/10 p-4 transition-colors duration-200"
              style={{ backgroundColor: CARD_BG_VAR }}
            >
              <div className="flex gap-3">
                <div className="relative flex-shrink-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-[var(--accent-color)]">
                    {user ? getInitials(user) : "?"}
                  </div>
                  {user && isSpecialAccount(user.email) && (
                    <span
                      className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/90 text-amber-950"
                      title="Founder"
                      aria-label="Founder"
                    >
                      <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                      </svg>
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <textarea
                    placeholder="What's on your mind?"
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors duration-200 focus:border-[var(--accent-color)]/50"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors duration-200 hover:bg-white/5 hover:text-[var(--accent-color)]"
                      title="Chart image"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      Chart
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors duration-200 hover:bg-white/5 hover:text-[var(--accent-color)]"
                      title="Poll"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      Poll
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors duration-200 hover:bg-white/5 hover:text-[var(--accent-color)]"
                      title="Trade Idea"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                      Trade Idea
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors duration-200 hover:bg-white/5 hover:text-[var(--accent-color)]"
                      title="Link"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      Link
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitPost}
                      disabled={!composerText.trim()}
                      className="ml-auto rounded-full bg-[var(--accent-color)] px-4 py-1.5 text-xs font-semibold text-[#020308] transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Post
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Refresh overlay + loading bar */}
            {refreshing && (
              <>
                <div className="fixed left-0 right-0 top-0 z-30 h-1 overflow-hidden bg-white/5" aria-hidden>
                  <div className="h-full w-full animate-[loading-bar_1.2s_ease-in-out] bg-[var(--accent-color)]" style={{ transformOrigin: "left" }} />
                </div>
                <p className="mb-2 text-center text-xs text-zinc-500">Refreshing feed…</p>
              </>
            )}
            {/* Post list */}
            <div className={`mt-6 space-y-4 transition-opacity duration-300 ${refreshing ? "opacity-50" : ""}`}>
              {postsLoading ? (
                <p className="py-8 text-center text-sm text-zinc-500">Loading feed…</p>
              ) : posts.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-500">No posts yet. Be the first to post!</p>
              ) : (
              [...posts]
                .sort((a, b) => ((b.author.verified ? 1 : 0) - (a.author.verified ? 1 : 0)))
                .map((post) => (
                <article
                  key={post.id}
                  className="animate-[fadeIn_0.35s_ease-out] rounded-2xl border border-white/10 p-4 transition-colors duration-200 hover:border-white/15"
                  style={{
                    backgroundColor: CARD_BG_VAR,
                    borderLeftWidth: post.author.verified ? 3 : undefined,
                    borderLeftColor: post.author.verified ? "#3B82F6" : undefined,
                  }}
                >
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-zinc-400">
                      {post.author.avatar ? (
                        <Image src={post.author.avatar} alt="" width={40} height={40} className="rounded-full object-cover" unoptimized />
                      ) : (
                        post.author.name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0">
                        <span className="font-semibold text-zinc-100">{post.author.name}</span>
                        {post.author.verified && (
                          <VerifiedBadgeWithTooltip />
                        )}
                        <span className="text-xs text-zinc-500">@{post.author.handle}</span>
                        <span className="text-xs text-zinc-500">·</span>
                        <time className="text-xs text-zinc-500" dateTime={post.timestamp}>
                          {formatTime(post.timestamp)}
                        </time>
                      </div>
                      {post.author.verified && (
                        <p className="mt-0.5 text-xs font-medium" style={{ color: "#3B82F6" }}>Verified Trader</p>
                      )}
                      {post.author.verified && post.author.handle === (user?.username?.trim() || user?.email || "") && typeof window !== "undefined" && getBrokerConnection().connected && (
                        <p className="mt-0.5" title="This trader's performance is verified via connected brokerage">
                          <TrackRecordVerifiedBadge size={12} showLabel label="Verified Track Record" />
                        </p>
                      )}
                      <p className="mt-1.5 whitespace-pre-wrap text-sm text-zinc-300">{post.content}</p>
                      {post.image && (
                        <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
                          <Image src={post.image} alt="" width={600} height={340} className="w-full object-cover" unoptimized />
                        </div>
                      )}
                      {/* Reaction bar: one reaction per type per user; click again to remove */}
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {REACTIONS.map(({ key, label, emoji }) => {
                          const count = reactionCounts[post.id]?.[key] ?? 0;
                          const isReacted = userReactions[post.id]?.[key];
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => handleReaction(post.id, key)}
                              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors duration-200 ${
                                isReacted
                                  ? "border-[var(--accent-color)]/50 bg-[var(--accent-color)]/10 text-[var(--accent-color)]"
                                  : "border-white/10 bg-black/20 text-zinc-400 hover:border-[var(--accent-color)]/30 hover:text-[var(--accent-color)]"
                              }`}
                              title={isReacted ? `${label} (click to remove)` : label}
                            >
                              <span>{emoji}</span>
                              <span>{count}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-3 flex items-center gap-4 text-xs text-zinc-500">
                        <button
                          type="button"
                          className="transition-colors duration-200 hover:text-[var(--accent-color)]"
                        >
                          {post.comments} Comments
                        </button>
                        <button
                          type="button"
                          className="transition-colors duration-200 hover:text-[var(--accent-color)]"
                        >
                          Share
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              )))}
            </div>

            <div ref={feedBottomRef} className="mt-6 min-h-[80px]">
              {loadingMore && (
                <div className="flex justify-center py-4">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent-color)] border-t-transparent" />
                </div>
              )}
              {!hasMore && posts.length > 0 && (
                <p className="py-4 text-center text-xs text-zinc-500">You&apos;re all caught up · Refresh for more</p>
              )}
            </div>
          </div>
        </main>

        {/* Right sidebar */}
        <aside className="hidden w-80 flex-shrink-0 border-l border-white/5 lg:block">
          <div className="sticky top-0 space-y-6 p-4">
            {/* Your Watchlist */}
            <section
              className="rounded-2xl border border-white/10 p-4 transition-colors duration-200"
              style={{ backgroundColor: CARD_BG_VAR }}
            >
              <h2 className="text-sm font-semibold text-zinc-100">Your Watchlist</h2>
              {watchlistLoading ? (
                <p className="mt-3 text-xs text-zinc-500">Loading…</p>
              ) : watchlist.length === 0 ? (
                <p className="mt-3 text-xs text-zinc-500">
                  No assets added yet. Search for a stock or crypto to add to your watchlist.
                </p>
              ) : (
                <>
                  <ul className="mt-3 space-y-2">
                    {watchlist.map((item) => {
                      const q = watchlistQuotes[item.ticker];
                      const price = item.price ?? (q?.price != null ? (q.price >= 1 ? q.price.toFixed(2) : q.price.toFixed(4)) : null);
                      const ch = item.change ?? q?.changePercent;
                      const tickerAlerts = getAlertsForTicker(item.ticker).filter((a) => a.status === "active");
                      const alertTarget = tickerAlerts[0]?.targetPrice;
                      return (
                        <li key={item.ticker}>
                          <Link
                            href={`/search/${encodeURIComponent(item.ticker)}`}
                            className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 transition-colors duration-200 hover:bg-white/5"
                          >
                            <span className="font-medium text-zinc-200">{item.ticker}</span>
                            <span className="shrink-0 text-right text-xs">
                              {price != null && <span className="text-zinc-400">${price}</span>}
                              {ch != null && (
                                <span className={ch >= 0 ? "ml-1.5 text-emerald-400" : "ml-1.5 text-red-400"}>
                                  {ch >= 0 ? "+" : ""}{typeof ch === "number" ? ch.toFixed(2) : ch}%
                                </span>
                              )}
                              {price == null && ch == null && <span className="text-zinc-500">—</span>}
                              {alertTarget != null && (
                                <span className="ml-1.5 inline-flex items-center gap-0.5 text-zinc-500" title="Price alert">
                                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                                  ${typeof alertTarget === "number" ? alertTarget.toFixed(2) : alertTarget}
                                </span>
                              )}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                  {(() => {
                    const activeAlerts = getPriceAlerts().filter((a) => a.status === "active");
                    const near = activeAlerts.find((a) => {
                      const p = watchlistQuotes[a.ticker]?.price;
                      return p != null && isNearTrigger(a, p);
                    });
                    if (!near) return null;
                    const p = watchlistQuotes[near.ticker]?.price;
                    const pct = p != null && near.targetPrice > 0 ? Math.abs(((near.targetPrice - p) / p) * 100).toFixed(1) : "?";
                    return (
                      <Link
                        href="/watchlist"
                        className="mt-2 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                      >
                        <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                        Alert: {near.ticker} within {pct}% of ${near.targetPrice >= 1 ? near.targetPrice.toFixed(2) : near.targetPrice.toFixed(4)}
                      </Link>
                    );
                  })()}
                </>
              )}
            </section>

            {/* Trending Tickers */}
            <section
              className="rounded-2xl border border-white/10 p-4 transition-colors duration-200"
              style={{ backgroundColor: CARD_BG_VAR }}
            >
              <h2 className="text-sm font-semibold text-zinc-100">Trending Tickers</h2>
              {trendingTickersLoading ? (
                <ul className="mt-3 space-y-2.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <li key={i} className="flex items-center justify-between rounded-lg px-3 py-2">
                      <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
                      <div className="h-4 w-12 animate-pulse rounded bg-white/10" />
                    </li>
                  ))}
                </ul>
              ) : trendingTickers.length > 0 ? (
                <ul className="mt-3 space-y-2.5">
                  {trendingTickers.map((t) => {
                    const sym = t.symbol?.toUpperCase() ?? t.symbol;
                    const live = liveTrending[sym];
                    const pct = live?.changePercent ?? t.changePercent ?? 0;
                    const price = live?.price ?? (typeof t.price === "number" ? t.price : null);
                    return (
                      <li key={t.symbol}>
                        <Link
                          href={`/search/${encodeURIComponent(t.symbol)}`}
                          className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors duration-200 hover:bg-white/5"
                        >
                          <div>
                            <span className="font-medium text-zinc-200">{t.symbol}</span>
                            <span className="ml-2 text-xs text-zinc-500">{t.name}</span>
                          </div>
                          {price != null ? (
                            <PriceDisplay
                              price={price}
                              change={live?.change ?? (price * (pct / 100))}
                              changePercent={live?.changePercent ?? pct}
                              symbol={sym}
                              format="compact"
                              showChange={true}
                            />
                          ) : (
                            <span className={pct >= 0 ? "text-emerald-400" : "text-red-400"}>
                              {pct >= 0 ? "+" : ""}{Number(pct).toFixed(2)}%
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-zinc-500">Prices temporarily unavailable</p>
              )}
            </section>

            {/* Active Communities */}
            <section
              className="rounded-2xl border border-white/10 p-4 transition-colors duration-200"
              style={{ backgroundColor: CARD_BG_VAR }}
            >
              <h2 className="text-sm font-semibold text-zinc-100">Active Communities</h2>
              <ul className="mt-3 space-y-2">
                {ACTIVE_COMMUNITIES.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 transition-colors duration-200 hover:bg-white/5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-200">{c.name}</p>
                      <p className="text-xs text-zinc-500">{c.members} members</p>
                    </div>
                    <Link
                      href="/communities"
                      className="flex-shrink-0 rounded-full bg-[var(--accent-color)]/15 px-3 py-1.5 text-xs font-medium text-[var(--accent-color)] transition-colors duration-200 hover:bg-[var(--accent-color)]/25"
                    >
                      Join
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            {/* Verified Trader sidebar prompt — only for non-verified */}
            {!isVerified(user?.email) && (
              <section
                className="rounded-2xl border border-[#3B82F6]/30 bg-[#3B82F6]/5 p-4"
              >
                <p className="font-medium text-white">✓ Verified Trader</p>
                <p className="mt-1 text-xs text-zinc-400">Stand out in the feed with a blue checkmark and performance stats.</p>
                <p className="mt-1 text-xs text-zinc-500">$9/mo · 7-day free trial</p>
                <Link href="/verify" className="mt-3 inline-block rounded-full bg-[#3B82F6] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#3B82F6]/90">Get Verified →</Link>
              </section>
            )}

            {/* Market Mood */}
            <section
              className="rounded-2xl border border-white/10 p-4 transition-colors duration-200"
              style={{ backgroundColor: CARD_BG_VAR }}
            >
              <h2 className="text-sm font-semibold text-zinc-100">Market Mood</h2>
              <p className="mt-1 text-xs text-zinc-500" title="Based on sample data; full sentiment coming soon.">
                Based on today&apos;s post reactions
              </p>
              <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-l-full transition-all duration-300"
                  style={{ width: "62%", backgroundColor: "var(--accent-color)" }}
                  title="Bullish 62%"
                />
                <div
                  className="h-full rounded-r-full transition-all duration-300"
                  style={{ width: "38%", backgroundColor: "#ef4444" }}
                  title="Bearish 38%"
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-zinc-500">
                <span className="text-[var(--accent-color)]">Bullish 62%</span>
                <span className="text-red-400">Bearish 38%</span>
              </div>
            </section>
          </div>
        </aside>
      </div>

      {/* Right sidebar on mobile: below feed */}
      <div className="border-t border-white/5 px-4 py-6 lg:hidden">
        <div className="mx-auto max-w-2xl space-y-4">
          <section
            className="rounded-2xl border border-white/10 p-4"
            style={{ backgroundColor: CARD_BG_VAR }}
          >
            <h2 className="text-sm font-semibold text-zinc-100">Your Watchlist</h2>
            {watchlistLoading ? (
              <p className="mt-3 text-xs text-zinc-500">Loading…</p>
            ) : watchlist.length === 0 ? (
              <p className="mt-3 text-xs text-zinc-500">
                No assets added yet. Search for a stock or crypto to add to your watchlist.
              </p>
            ) : (
              <>
                <ul className="mt-3 space-y-2">
                  {watchlist.map((item) => {
                    const q = watchlistQuotes[item.ticker];
                    const price = item.price ?? (q?.price != null ? (q.price >= 1 ? q.price.toFixed(2) : q.price.toFixed(4)) : null);
                    const ch = item.change ?? q?.changePercent;
                    const tickerAlerts = getAlertsForTicker(item.ticker).filter((a) => a.status === "active");
                    const alertTarget = tickerAlerts[0]?.targetPrice;
                    return (
                      <li key={item.ticker}>
                        <Link
                          href={`/search/${encodeURIComponent(item.ticker)}`}
                          className="flex justify-between gap-2 rounded-lg px-3 py-2"
                        >
                          <span className="font-medium text-zinc-200">{item.ticker}</span>
                          <span className="shrink-0 text-right text-xs">
                            {price != null && <span className="text-zinc-400">${price}</span>}
                            {ch != null && (
                              <span className={ch >= 0 ? "ml-1.5 text-emerald-400" : "ml-1.5 text-red-400"}>
                                {ch >= 0 ? "+" : ""}{typeof ch === "number" ? ch.toFixed(2) : ch}%
                              </span>
                            )}
                            {price == null && ch == null && <span className="text-zinc-500">—</span>}
                            {alertTarget != null && (
                              <span className="ml-1.5 inline-flex items-center gap-0.5 text-zinc-500">
                                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                                ${typeof alertTarget === "number" ? alertTarget.toFixed(2) : alertTarget}
                              </span>
                            )}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                {(() => {
                  const activeAlerts = getPriceAlerts().filter((a) => a.status === "active");
                  const near = activeAlerts.find((a) => {
                    const p = watchlistQuotes[a.ticker]?.price;
                    return p != null && isNearTrigger(a, p);
                  });
                  if (!near) return null;
                  const p = watchlistQuotes[near.ticker]?.price;
                  const pct = p != null && near.targetPrice > 0 ? Math.abs(((near.targetPrice - p) / p) * 100).toFixed(1) : "?";
                  return (
                    <Link
                      href="/watchlist"
                      className="mt-2 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                    >
                      <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                      Alert: {near.ticker} within {pct}% of ${near.targetPrice >= 1 ? near.targetPrice.toFixed(2) : near.targetPrice.toFixed(4)}
                    </Link>
                  );
                })()}
              </>
            )}
          </section>
          <section
            className="rounded-2xl border border-white/10 p-4"
            style={{ backgroundColor: CARD_BG_VAR }}
          >
            <h2 className="text-sm font-semibold text-zinc-100">Trending Tickers</h2>
            {trendingTickersLoading ? (
              <ul className="mt-3 space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <li key={i} className="flex justify-between rounded-lg px-3 py-2">
                    <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
                    <div className="h-4 w-12 animate-pulse rounded bg-white/10" />
                  </li>
                ))}
              </ul>
            ) : trendingTickers.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {trendingTickers.map((t) => (
                  <li key={t.symbol}>
                    <Link
                      href={`/search/${encodeURIComponent(t.symbol)}`}
                      className="flex justify-between rounded-lg px-3 py-2 transition-colors duration-200 hover:bg-white/5"
                    >
                      <span className="font-medium text-zinc-200">{t.symbol}</span>
                      <span className={t.changePercent >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {t.changePercent >= 0 ? "+" : ""}{t.changePercent.toFixed(2)}%
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-zinc-500">Prices temporarily unavailable</p>
            )}
          </section>
          <section
            className="rounded-2xl border border-white/10 p-4"
            style={{ backgroundColor: CARD_BG_VAR }}
          >
            <h2 className="text-sm font-semibold text-zinc-100">Active Communities</h2>
            <ul className="mt-3 space-y-2">
              {ACTIVE_COMMUNITIES.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{c.name}</p>
                    <p className="text-xs text-zinc-500">{c.members} members</p>
                  </div>
                  <Link href="/communities" className="rounded-full bg-[var(--accent-color)]/15 px-3 py-1.5 text-xs font-medium text-[var(--accent-color)]">
                    Join
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section
            className="rounded-2xl border border-white/10 p-4"
            style={{ backgroundColor: CARD_BG_VAR }}
          >
            <h2 className="text-sm font-semibold text-zinc-100">Market Mood</h2>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full w-[62%] rounded-l-full bg-[var(--accent-color)]" />
              <div className="h-full w-[38%] rounded-r-full bg-red-500" />
            </div>
            <div className="mt-2 flex justify-between text-xs text-zinc-500">
              <span className="text-[var(--accent-color)]">Bullish 62%</span>
              <span className="text-red-400">Bearish 38%</span>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
