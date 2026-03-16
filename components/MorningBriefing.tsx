"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { XchangeLogoImage } from "./XchangeLogoImage";
import { getCachedBriefing, setCachedBriefing, clearCachedBriefing } from "../lib/briefing";

const BG = "#0A0E1A";

export type BriefingData = {
  headline: string;
  marketMood: string;
  moodColor: "green" | "red" | "yellow";
  overview: string;
  topStories: { title: string; impact: string; detail: string }[];
  watchlist: { asset: string; reason: string }[];
  keyLevels: { asset: string; level: string; significance: string }[];
  geopolitical: string;
  tradersEdge: string;
  oneLiner: string;
};

const LOADING_LINES = [
  "Scanning global markets...",
  "Reading overnight news...",
  "Analyzing geopolitical events...",
  "Preparing your briefing...",
];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

function getMarketsStatus(): { text: string; sub?: string } {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  if (day === 0 || day === 6) return { text: "Markets closed" };
  const hours = et.getHours();
  const mins = et.getMinutes();
  const totalMins = hours * 60 + mins;
  const openMins = 9 * 60 + 30;
  const closeMins = 16 * 60;
  if (totalMins >= openMins && totalMins < closeMins) return { text: "Markets are open" };
  if (totalMins < openMins) {
    const diff = openMins - totalMins;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return { text: `Markets open in ${h}h ${m}m` };
  }
  return { text: "Markets closed" };
}

function formatBriefingTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function MorningBriefing({
  skipAnimation = false,
  onClose,
  cachedFetchedAt,
}: {
  skipAnimation?: boolean;
  onClose: () => void;
  cachedFetchedAt?: string | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<number | "loading" | "content">(skipAnimation ? "loading" : 1);
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [loadingLineIndex, setLoadingLineIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(cachedFetchedAt ?? null);
  const progressRef = useRef<HTMLDivElement>(null);

  const fetchBriefing = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = getCachedBriefing();
      if (cached?.data && typeof cached.data === "object" && "headline" in cached.data) {
        setBriefing(cached.data as BriefingData);
        setFetchedAt(cached.fetchedAt);
        setPhase("content");
        return;
      }
    } else {
      clearCachedBriefing();
    }
    try {
      const res = await fetch("/api/morning-briefing", { credentials: "include", cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Failed to load briefing");
        setPhase("content");
        return;
      }
      setBriefing(data);
      setFetchedAt(new Date().toISOString());
      setCachedBriefing(data);
      setPhase("content");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load briefing");
      setPhase("content");
    }
  }, []);

  useEffect(() => {
    if (skipAnimation) {
      fetchBriefing();
      return;
    }
    fetchBriefing();
    const t = setTimeout(() => setPhase(3), 1500);
    return () => clearTimeout(t);
  }, [skipAnimation, fetchBriefing]);



  useEffect(() => {
    if (phase !== "loading" && phase !== 3) return;
    const id = setInterval(() => {
      setLoadingLineIndex((i) => (i + 1) % LOADING_LINES.length);
    }, 500);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "loading" && phase !== 3) return;
    const el = progressRef.current;
    if (!el) return;
    const start = Date.now();
    const duration = 400;
    const tick = () => {
      const elapsed = Date.now() - start;
      const p = Math.min(1, elapsed / duration);
      el.style.width = `${p * 100}%`;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [phase]);

  const handleSkip = useCallback(() => {
    if (phase === "content" && briefing) return;
    if (skipAnimation) {
      fetchBriefing();
      return;
    }
    setPhase("loading");
    fetchBriefing();
  }, [phase, skipAnimation, briefing, fetchBriefing]);

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const markets = getMarketsStatus();
  const greeting = getGreeting();

  if (phase === "content" && (briefing || error)) {
    return (
      <div
        className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-[#0A0E1A]"
        style={{ backgroundColor: BG }}
        aria-live="polite"
      >
        <div className="flex-1 overflow-y-auto">
          <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#0A0E1A]/95 px-4 py-3 backdrop-blur">
            <div className="flex items-center gap-3">
              <XchangeLogoImage size={36} />
              <span className="font-semibold text-zinc-100">Morning Briefing</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-zinc-500">{dateStr}</span>
              {fetchedAt && (
                <span className="text-xs text-zinc-500">Updated at {formatBriefingTime(fetchedAt)}</span>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded p-2 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </header>

          {error && (
            <div className="mx-auto max-w-2xl px-4 py-12 text-center">
              <p className="text-zinc-400">{error}</p>
              <button
                type="button"
                onClick={() => { setError(null); setPhase("loading"); fetchBriefing(); }}
                className="mt-4 rounded-lg bg-[var(--accent-color)] px-4 py-2 text-sm font-medium text-[#020308]"
              >
                Retry
              </button>
            </div>
          )}

          {briefing && !error && (
            <div className="mx-auto max-w-3xl px-4 py-8" style={{ animation: "briefing-content-slide-up 0.5s ease-out" }}>
              <div
                className={`mb-6 rounded-lg px-6 py-4 ${
                  briefing.moodColor === "green"
                    ? "bg-gradient-to-r from-emerald-600/30 to-emerald-500/20"
                    : briefing.moodColor === "red"
                    ? "bg-gradient-to-r from-red-600/30 to-red-500/20"
                    : "bg-gradient-to-r from-amber-600/30 to-amber-500/20"
                }`}
              >
                <p className="text-2xl font-bold text-white">{briefing.marketMood}</p>
              </div>

              <h1 className="mb-6 text-center text-2xl font-bold md:text-3xl" style={{ color: "var(--accent-color)" }}>
                {briefing.headline}
              </h1>

              <p className="mx-auto mb-10 max-w-[700px] text-center text-zinc-300 leading-relaxed">
                {briefing.overview}
              </p>

              <section className="mb-10">
                <h2 className="mb-4 text-lg font-semibold text-zinc-100">Top Stories</h2>
                <div className="grid gap-4 md:grid-cols-3">
                  {briefing.topStories?.slice(0, 3).map((s, i) => (
                    <div
                      key={i}
                      className={`rounded-xl border-l-4 bg-[#0F1520] p-4 ${
                        s.impact === "Bullish"
                          ? "border-emerald-500"
                          : s.impact === "Bearish"
                          ? "border-red-500"
                          : "border-zinc-500"
                      }`}
                    >
                      <span
                        className={`text-xs font-medium ${
                          s.impact === "Bullish" ? "text-emerald-400" : s.impact === "Bearish" ? "text-red-400" : "text-zinc-400"
                        }`}
                      >
                        {s.impact}
                      </span>
                      <p className="mt-1 font-medium text-zinc-200">{s.title}</p>
                      <p className="mt-2 text-sm text-zinc-500">{s.detail}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mb-10">
                <h2 className="mb-4 text-lg font-semibold text-zinc-100">Assets to Watch Today</h2>
                <div className="flex flex-wrap gap-3">
                  {briefing.watchlist?.slice(0, 4).map((w, i) => (
                    <div key={i} className="rounded-xl bg-[#0F1520] px-4 py-3">
                      <span className="font-mono text-sm font-medium text-[var(--accent-color)]">{w.asset}</span>
                      <p className="mt-1 text-sm text-zinc-400">{w.reason}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mb-10">
                <h2 className="mb-4 text-lg font-semibold text-zinc-100">Key Levels</h2>
                <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0F1520]">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-zinc-400">
                        <th className="p-3 font-medium">Asset</th>
                        <th className="p-3 font-medium">Level</th>
                        <th className="p-3 font-medium">Why it matters</th>
                      </tr>
                    </thead>
                    <tbody>
                      {briefing.keyLevels?.slice(0, 3).map((k, i) => (
                        <tr key={i} className="border-b border-white/5">
                          <td className="p-3 font-mono text-zinc-200">{k.asset}</td>
                          <td className="p-3 text-zinc-300">{k.level}</td>
                          <td className="p-3 text-zinc-500">{k.significance}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="mb-10">
                <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-zinc-100">
                  <span>🌐</span> Geopolitical Pulse
                </h2>
                <div className="rounded-xl border border-white/10 bg-[#0F1520] p-4">
                  <p className="text-zinc-300">{briefing.geopolitical}</p>
                </div>
              </section>

              <section className="mb-10">
                <div className="rounded-xl p-[2px]" style={{ background: "linear-gradient(to right, var(--accent-color), rgba(245,158,11,0.8))" }}>
                  <div className="rounded-[10px] bg-[#0F1520] p-4">
                    <div className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
                      <span>⚡</span> Trader&apos;s Edge
                    </div>
                    <p className="mt-2 text-zinc-300">{briefing.tradersEdge}</p>
                  </div>
                </div>
              </section>

              <p className="text-center italic text-zinc-500">&ldquo;{briefing.oneLiner}&rdquo;</p>

              <div className="mt-10 rounded-xl border border-[#3B82F6]/30 bg-[#3B82F6]/10 p-4">
                <p className="text-sm font-medium text-white">💡 Tip: Verified Traders get their morning briefing personalized to their exact portfolio and trade journal.</p>
                <Link href="/verify" className="mt-2 inline-block text-sm font-medium text-[#3B82F6] hover:underline">Upgrade for $9/month →</Link>
              </div>

              <footer className="mt-12 flex flex-col items-center gap-4 border-t border-white/10 pt-8">
                <p className="text-center text-xs text-zinc-500">
                  AI-generated briefing based on current market data. Not financial advice.
                </p>
                <Link
                  href="/feed"
                  onClick={(e) => {
                    e.preventDefault();
                    onClose();
                    router.push("/feed");
                  }}
                  className="rounded-full bg-[var(--accent-color)] px-6 py-2.5 font-semibold text-[#020308] transition-opacity hover:opacity-90"
                >
                  Enter Xchange →
                </Link>
              </footer>
            </div>
          )}
        </div>
      </div>
    );
  }

  const showSkip = phase !== "content" || !briefing;
  const showGreeting = phase === 1;
  const showLoadingUI = phase === 3 || phase === "loading";

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden"
      style={{ backgroundColor: BG }}
      aria-live="polite"
      aria-label="Morning Briefing"
    >
      {showSkip && (
        <button
          type="button"
          onClick={handleSkip}
          className="absolute right-6 top-6 z-10 px-6 py-3 text-xl text-zinc-500 transition-colors hover:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
        >
          Skip →
        </button>
      )}

      {/* Good morning — fixed 1.5s */}
      {showGreeting && (
        <div className="flex w-full flex-col items-center px-6 transition-opacity duration-300 ease-out">
          <div className="absolute left-6 top-6">
            <XchangeLogoImage size={44} />
          </div>
          <p className="text-4xl font-bold text-zinc-100 md:text-5xl">{greeting}</p>
          <p className="mt-2 text-xl text-zinc-400">{dateStr}</p>
          <p className="mt-1 text-lg text-[var(--accent-color)]">{markets.text}</p>
        </div>
      )}

      {/* Spinning logo + cycling text — no minimum, until brief loads */}
      {showLoadingUI && (
        <div className="flex flex-col items-center justify-center gap-6 px-6">
          <div className="flex h-20 w-20 items-center justify-center" style={{ animation: "briefing-logo-spin 3s linear infinite" }}>
            <XchangeLogoImage size={80} />
          </div>
          <p className="min-h-[2rem] text-center text-lg text-zinc-300">
            {LOADING_LINES[loadingLineIndex]}
          </p>
          <div className="h-1 w-64 overflow-hidden rounded-full bg-white/10">
            <div
              ref={progressRef}
              className="h-full rounded-full transition-[width] duration-300 ease-out"
              style={{ width: "0%", backgroundColor: "var(--accent-color)" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
