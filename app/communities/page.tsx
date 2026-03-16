"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../components/AuthContext";
import { useFocusTrap } from "../../components/useFocusTrap";
import { VerifiedBadge } from "../../components/VerifiedBadge";
import { isVerified } from "../../lib/verified";

const INTRO_DISMISSED_KEY = "xchange_communities_intro_dismissed";

const TAGS = [
  "Equities",
  "Global Macro",
  "Crypto",
  "FX & Rates",
  "Commodities",
  "Options",
] as const;

type RoomId = "equities" | "macro" | "crypto";

const ROOM_NAMES: Record<RoomId, string> = {
  equities: "Global Equities Flow",
  macro: "Global Macro & Rates",
  crypto: "Crypto & High-Beta",
};

export default function CommunitiesPage() {
  const { user } = useAuth();
  const [showIntro, setShowIntro] = useState(false);
  const [joinedRoomIds, setJoinedRoomIds] = useState<string[]>([]);
  const [roomMode, setRoomMode] = useState<"all" | "joined">("all");
  const [selectedRoomId, setSelectedRoomId] = useState<RoomId | null>("equities");
  const [justJoinedRoom, setJustJoinedRoom] = useState<string | null>(null);
  const [leaveConfirmRoom, setLeaveConfirmRoom] = useState<RoomId | null>(null);
  const [roomLiveCounts, setRoomLiveCounts] = useState<Record<RoomId, number>>({
    equities: 1200,
    macro: 840,
    crypto: 920,
  });

  const visibleRoomIds = (["equities", "macro", "crypto"] as const).filter(
    (id) => roomMode === "all" || joinedRoomIds.includes(id)
  );

  const refreshJoined = useCallback(async () => {
    try {
      const res = await fetch("/api/rooms/joined", { credentials: "include" });
      const data = await res.json();
      if (Array.isArray(data.roomIds)) setJoinedRoomIds(data.roomIds);
    } catch {
      setJoinedRoomIds([]);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => refreshJoined());
  }, [refreshJoined]);

  // When in "joined" mode, keep selection in sync with visible list
  useEffect(() => {
    if (roomMode !== "joined") return;
    const joinedIds = (["equities", "macro", "crypto"] as const).filter((id) => joinedRoomIds.includes(id));
    if (selectedRoomId && !joinedIds.includes(selectedRoomId)) {
      queueMicrotask(() => setSelectedRoomId(joinedIds[0] ?? null));
    }
  }, [roomMode, joinedRoomIds, selectedRoomId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = window.localStorage.getItem(INTRO_DISMISSED_KEY);
    if (!dismissed) queueMicrotask(() => setShowIntro(true));
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setRoomLiveCounts((prev) => ({
        equities: Math.max(800, Math.min(2000, prev.equities + Math.floor((Math.random() - 0.5) * 120))),
        macro: Math.max(800, Math.min(2000, prev.macro + Math.floor((Math.random() - 0.5) * 120))),
        crypto: Math.max(800, Math.min(2000, prev.crypto + Math.floor((Math.random() - 0.5) * 120))),
      }));
    }, 30000);
    return () => clearInterval(t);
  }, []);

  const dismissIntro = () => {
    window.localStorage.setItem(INTRO_DISMISSED_KEY, "1");
    setShowIntro(false);
  };

  const introTrapRef = useFocusTrap(showIntro, dismissIntro);
  const leaveTrapRef = useFocusTrap(!!leaveConfirmRoom, () => setLeaveConfirmRoom(null));

  const handleJoinRoom = async (roomName: string, roomId: RoomId) => {
    if (!user) return;
    try {
      await fetch(`/api/rooms/${roomId}/join`, { method: "POST", credentials: "include" });
      setJoinedRoomIds((prev) => (prev.includes(roomId) ? prev : [...prev, roomId]));
      setSelectedRoomId(roomId);
      setJustJoinedRoom(roomName);
      setTimeout(() => setJustJoinedRoom(null), 4000);
    } catch {
      // ignore
    }
  };

  const handleLeaveRoom = async (roomId: RoomId) => {
    try {
      await fetch(`/api/rooms/${roomId}/leave`, { method: "DELETE", credentials: "include" });
      setJoinedRoomIds((prev) => prev.filter((id) => id !== roomId));
      setLeaveConfirmRoom(null);
    } catch {
      setLeaveConfirmRoom(null);
    }
  };

  return (
    <div className="min-h-screen app-page font-[&quot;Times_New_Roman&quot;,serif]">
      {/* One-time intro popup */}
      {showIntro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="intro-title">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />
          <div ref={introTrapRef} className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0A0E1A] p-6 shadow-2xl">
            <button
              type="button"
              onClick={dismissIntro}
              className="absolute right-3 top-3 rounded-full p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-[#11c60f]/50 focus:ring-offset-2 focus:ring-offset-[#0A0E1A]"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h2 id="intro-title" className="pr-8 text-lg font-semibold text-zinc-50">Welcome to Smart Communities</h2>
            <p className="mt-3 text-sm text-zinc-400">
              This is where traders gather by focus — equities, macro, crypto, and more. Each room has live discussion,
              pinned ideas, and briefings so you follow the conversations that move your portfolio.
            </p>
            <p className="mt-3 text-sm font-medium text-[#11c60f]">Your task: join one group today.</p>
            <p className="mt-1 text-xs text-zinc-500">
              Pick a room below and click &quot;Join room&quot; to get started. You&apos;ll see it in your profile under Groups you&apos;re in.
            </p>
            <button
              type="button"
              onClick={dismissIntro}
              className="mt-4 rounded-full bg-[#11c60f] px-4 py-2 text-sm font-semibold text-[#020308] hover:bg-[#13e211] focus:outline-none focus:ring-2 focus:ring-[#11c60f] focus:ring-offset-2 focus:ring-offset-[#0A0E1A]"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Leave room confirmation */}
      {leaveConfirmRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="leave-title">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden onClick={() => setLeaveConfirmRoom(null)} />
          <div ref={leaveTrapRef} className="relative w-full max-w-sm rounded-2xl border p-6 shadow-2xl" style={{ borderColor: "var(--app-border)", backgroundColor: "var(--app-bg)" }}>
            <h3 id="leave-title" className="text-lg font-semibold text-zinc-50">Leave room?</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Are you sure you want to leave <span className="font-medium text-zinc-200">{leaveConfirmRoom ? ROOM_NAMES[leaveConfirmRoom] : ""}</span>? You can rejoin anytime.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setLeaveConfirmRoom(null)}
                className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[#11c60f]/50 focus:ring-offset-2 focus:ring-offset-[#0A0E1A]"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={() => { if (leaveConfirmRoom) handleLeaveRoom(leaveConfirmRoom); }}
                className="rounded-full bg-red-500/90 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-[#0A0E1A]"
              >
                Yes, leave
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl px-6 py-10 lg:px-8 lg:py-14">
        {/* Page Header */}
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.25em]" style={{ color: "var(--accent-color)", opacity: 0.8 }}>
              Smart Communities
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
              Trade where the right people gather.
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-zinc-400 sm:text-base">
              Curated rooms for different asset classes, strategies, and time
              zones. Follow the conversations that move your portfolio, not just
              the noise.
            </p>
          </div>
          <div className="text-xs text-zinc-400">
            <p>
              {user ? (
                <>
                  Signed in as{" "}
                  <span className="font-semibold text-zinc-100">
                    {user.name || "Trader"}
                  </span>
                </>
              ) : (
                <>
                  You&apos;re browsing as{" "}
                  <span className="font-semibold text-zinc-100">
                    guest
                  </span>
                  .
                </>
              )}
            </p>
            <p className="mt-1">
              Real-time chats, pinned trade ideas, and macro briefings — all
              in-context to each room.
            </p>
          </div>
        </div>

        {/* Filters */}
        <section className="mb-8 rounded-2xl border border-white/5 bg-[#050713] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-300">
              <span className="mr-1 text-zinc-400">Filter by focus:</span>
              {TAGS.map((tag) => (
                <button
                  key={tag}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-zinc-200 transition hover:border-[#11c60f]/70 hover:text-emerald-200"
                  type="button"
                >
                  {tag}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-zinc-300">
              <span className="text-zinc-400">Mode:</span>
              <button
                type="button"
                onClick={() => setRoomMode("all")}
                className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                  roomMode === "all"
                    ? "border border-[#11c60f]/40 bg-[#11c60f]/10 text-emerald-200"
                    : "border border-white/10 bg-white/0 text-zinc-300 hover:border-white/30"
                }`}
              >
                All rooms
              </button>
              <button
                type="button"
                onClick={() => setRoomMode("joined")}
                className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                  roomMode === "joined"
                    ? "border border-[#11c60f]/40 bg-[#11c60f]/10 text-emerald-200"
                    : "border border-white/10 bg-white/0 text-zinc-300 hover:border-white/30"
                }`}
              >
                Joined
              </button>
              <span className="mx-1 text-zinc-600">·</span>
              <Link
                href="/feed"
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-zinc-300 transition hover:border-[#11c60f]/50 hover:bg-[#11c60f]/10 hover:text-emerald-200"
              >
                Feed
              </Link>
              <span className="mx-1 text-zinc-600">·</span>
              <Link
                href="/leaderboard"
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-zinc-300 transition hover:border-[var(--accent-color)]/50 hover:bg-[var(--accent-color)]/10 hover:text-[var(--accent-color)]"
              >
                🏆 Leaderboard
              </Link>
            </div>
          </div>
        </section>

        {/* Verified Only section */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#3B82F6]">🔒 Verified Trader Rooms</h2>
          <p className="mt-1 text-xs text-zinc-400">Exclusive communities for verified traders only.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {[
              { id: "pro-desk", name: "Pro Desk Flow", desc: "Institutional grade flow and ideas", members: "Verified traders only" },
              { id: "macro-alpha", name: "Verified Macro Alpha", desc: "High conviction macro plays", members: "Verified traders only" },
              { id: "options-elite", name: "Options Elite", desc: "Professional options strategies", members: "Verified traders only" },
            ].map((room) => {
              const verified = isVerified(user?.email);
              return (
                <article key={room.id} className={`relative overflow-hidden rounded-2xl border border-white/5 p-4 ${verified ? "border-[#3B82F6]/30 bg-gradient-to-br from-[#3B82F6]/10 to-white/[0.02]" : "bg-[#050713]"}`}>
                  {!verified && (
                    <div className="absolute inset-0 z-10 bg-black/50 backdrop-blur-sm" aria-hidden />
                  )}
                  <div className={!verified ? "blur-[2px] select-none" : ""}>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-zinc-50">{room.name}</h3>
                      <VerifiedBadge size={16} />
                    </div>
                    <p className="mt-1 text-xs text-zinc-400">{room.desc}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">Members: {room.members}</p>
                    {verified && (
                      <button type="button" className="mt-3 w-full rounded-full bg-[#22c55e] px-3 py-1.5 text-xs font-medium text-[#020308] hover:bg-[#22c55e]/90">Enter Room</button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Main layout: room list + preview */}
        <section className="grid gap-6 md:grid-cols-[minmax(0,1.3fr),minmax(0,1.1fr)]">
          {/* Rooms list */}
          <div className="space-y-4">
            {roomMode === "joined" && joinedRoomIds.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-[#050713] p-8 text-center">
                <p className="text-sm font-medium text-zinc-300">You haven&apos;t joined any rooms yet.</p>
                <p className="mt-2 text-xs text-zinc-500">
                  Switch to &quot;All rooms&quot; and click &quot;Join room&quot; on a room to add it here.
                </p>
                <button
                  type="button"
                  onClick={() => setRoomMode("all")}
                  className="mt-4 rounded-full border border-[#11c60f]/50 bg-[#11c60f]/10 px-4 py-2 text-xs font-medium text-[#11c60f] hover:bg-[#11c60f]/20"
                >
                  Show all rooms
                </button>
              </div>
            ) : (
            <div className="space-y-4">
            {visibleRoomIds.includes("equities") && (
            <article
              className="group flex cursor-pointer flex-col gap-3 rounded-2xl border border-white/5 p-4 transition hover:border-[#11c60f]/70 hover:shadow-[0_0_40px_rgba(17,198,15,0.25)] bg-gradient-to-br from-white/5 to-white/[0.02]"
              onClick={() => setSelectedRoomId("equities")}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-50">
                    Global Equities Flow
                  </h2>
                  <p className="mt-1 text-[11px] text-emerald-300">
                    Large-cap, sectors, and index flows in US, EU, and Asia.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-color)]/15 px-3 py-1 text-[10px] font-medium text-[var(--accent-color)]">
                  <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent-color)]" />
                  Live · {(roomLiveCounts.equities / 1000).toFixed(1)}k online
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Earnings reactions, sector rotations, and index rebalancing
                trade ideas, with watchlists and alerts shared by the room.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-black/40 px-2 py-0.5">#SPY</span>
                  <span className="rounded-full bg-black/40 px-2 py-0.5">#QQQ</span>
                  <span className="rounded-full bg-black/40 px-2 py-0.5">#SectorRotations</span>
                </div>
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setSelectedRoomId("equities")}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium text-zinc-100 group-hover:border-[#11c60f]/70 group-hover:text-emerald-200"
                  >
                    Preview room
                  </button>
                  {joinedRoomIds.includes("equities") ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLeaveConfirmRoom("equities");
                      }}
                      className="rounded-full border border-[#11c60f]/50 bg-[#11c60f]/15 px-3 py-1 text-[11px] font-medium text-emerald-200 hover:bg-[#11c60f]/25"
                      title="Click to leave room"
                    >
                      Joined
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                        user
                          ? "border border-[#11c60f]/70 bg-[#11c60f]/10 text-emerald-200 hover:bg-[#11c60f]/20"
                          : "border border-white/10 bg-white/0 text-zinc-400 cursor-not-allowed"
                      }`}
                      disabled={!user}
                      title={user ? "Join this room" : "Sign in to join rooms and participate"}
                      onClick={() => handleJoinRoom("Global Equities Flow", "equities")}
                    >
                      Join room
                    </button>
                  )}
                </div>
              </div>
            </article>
            )}
            {visibleRoomIds.includes("macro") && (
            <article
              className="group flex cursor-pointer flex-col gap-3 rounded-2xl border border-white/5 p-4 transition hover:border-cyan-300/70 hover:shadow-[0_0_40px_rgba(56,189,248,0.25)] bg-gradient-to-br from-white/[0.02] to-white/[0.01]"
              onClick={() => setSelectedRoomId("macro")}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-50">Global Macro & Rates</h2>
                  <p className="mt-1 text-[11px] text-cyan-300">
                    Central banks, inflation data, and cross-asset macro plays.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-3 py-1 text-[10px] font-medium text-cyan-200">
                  <span className="live-dot inline-block h-1.5 w-1.5 rounded-full text-cyan-300" />
                  Live · {(roomLiveCounts.macro / 1000).toFixed(1)}k online
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                FOMC, ECB, BOJ, CPI, and payrolls discussions with trade ideas
                across FX, indices, and fixed income.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-black/40 px-2 py-0.5">#Rates</span>
                  <span className="rounded-full bg-black/40 px-2 py-0.5">#Macro</span>
                  <span className="rounded-full bg-black/40 px-2 py-0.5">#DataReleases</span>
                </div>
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setSelectedRoomId("macro")}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium text-zinc-100 group-hover:border-cyan-300/70 group-hover:text-cyan-200"
                  >
                    Preview room
                  </button>
                  {joinedRoomIds.includes("macro") ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLeaveConfirmRoom("macro");
                      }}
                      className="rounded-full border border-cyan-300/50 bg-cyan-500/15 px-3 py-1 text-[11px] font-medium text-cyan-200 hover:bg-cyan-500/25"
                      title="Click to leave room"
                    >
                      Joined
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                        user
                          ? "border border-cyan-300/70 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"
                          : "border border-white/10 bg-white/0 text-zinc-400 cursor-not-allowed"
                      }`}
                      disabled={!user}
                      title={user ? "Join this room" : "Sign in to join rooms and participate"}
                      onClick={() => handleJoinRoom("Global Macro & Rates", "macro")}
                    >
                      Join room
                    </button>
                  )}
                </div>
              </div>
            </article>
            )}
            {visibleRoomIds.includes("crypto") && (
            <article
              className="group flex cursor-pointer flex-col gap-3 rounded-2xl border border-white/5 p-4 transition hover:border-fuchsia-300/70 hover:shadow-[0_0_40px_rgba(217,70,239,0.3)] bg-gradient-to-br from-white/[0.02] to-fuchsia-500/5"
              onClick={() => setSelectedRoomId("crypto")}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-50">Crypto & High-Beta</h2>
                  <p className="mt-1 text-[11px] text-fuchsia-300">
                    BTC, ETH, alt rotations, and high-volatility equity plays.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/15 px-3 py-1 text-[10px] font-medium text-fuchsia-200">
                  <span className="live-dot inline-block h-1.5 w-1.5 rounded-full text-fuchsia-300" />
                  Live · {(roomLiveCounts.crypto / 1000).toFixed(1)}k online
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Idea flow for those who thrive on volatility — with clear risk
                callouts and stop-loss sharing baked into each thread.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-black/40 px-2 py-0.5">#BTC</span>
                  <span className="rounded-full bg-black/40 px-2 py-0.5">#ETH</span>
                  <span className="rounded-full bg-black/40 px-2 py-0.5">#HighBeta</span>
                </div>
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setSelectedRoomId("crypto")}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium text-zinc-100 group-hover:border-fuchsia-300/70 group-hover:text-fuchsia-200"
                  >
                    Preview room
                  </button>
                  {joinedRoomIds.includes("crypto") ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLeaveConfirmRoom("crypto");
                      }}
                      className="rounded-full border border-fuchsia-300/50 bg-fuchsia-500/15 px-3 py-1 text-[11px] font-medium text-fuchsia-200 hover:bg-fuchsia-500/25"
                      title="Click to leave room"
                    >
                      Joined
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                        user
                          ? "border border-fuchsia-300/70 bg-fuchsia-500/10 text-fuchsia-100 hover:bg-fuchsia-500/20"
                          : "border border-white/10 bg-white/0 text-zinc-400 cursor-not-allowed"
                      }`}
                      disabled={!user}
                      title={user ? "Join this room" : "Sign in to join rooms and participate"}
                      onClick={() => handleJoinRoom("Crypto & High-Beta", "crypto")}
                    >
                      Join room
                    </button>
                  )}
                </div>
              </div>
            </article>
            )}
            </div>
            )}
          </div>

          {/* Right-hand: room preview */}
          <aside className="rounded-2xl border border-white/5 bg-gradient-to-b from-[#050713] to-black/90 p-4 shadow-[0_0_45px_rgba(15,23,42,0.9)]">
            {justJoinedRoom && (
              <div className="mb-4 rounded-xl border border-[#11c60f]/40 bg-[#11c60f]/10 px-3 py-2 text-[11px] font-medium text-emerald-200">
                You joined <span className="font-semibold">{justJoinedRoom}</span>. It&apos;s now in your profile under Groups you&apos;re in.
              </div>
            )}
            <div className="mb-4 flex items-center justify-between text-[11px] text-zinc-300">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em]" style={{ color: "var(--accent-color)", opacity: 0.8 }}>
                  Room preview
                </p>
                <h2 className="mt-1 text-sm font-semibold text-zinc-50">
                  {selectedRoomId === "equities" && "Global Equities Flow"}
                  {selectedRoomId === "macro" && "Global Macro & Rates"}
                  {selectedRoomId === "crypto" && "Crypto & High-Beta"}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {(selectedRoomId === "equities" && joinedRoomIds.includes("equities")) ||
                (selectedRoomId === "macro" && joinedRoomIds.includes("macro")) ||
                (selectedRoomId === "crypto" && joinedRoomIds.includes("crypto")) ? (
                  <span className="rounded-full bg-[#11c60f]/20 px-3 py-1 text-[10px] font-medium text-[#11c60f]">
                    You&apos;re in this room
                  </span>
                ) : (
                  <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-medium text-zinc-400">
                    Preview
                  </span>
                )}
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-white/5 bg-black/50 p-3 text-[11px] text-zinc-300">
              <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                Today&apos;s brief
              </p>
              <p className="text-zinc-200">
                {selectedRoomId === "equities" &&
                  "US tech leading risk-on with SPY / QQQ breadth improving. Desk watching mega-cap earnings and rotation into semis and software."}
                {selectedRoomId === "macro" &&
                  "Central banks in hold mode; room is focused on next CPI and jobs data for rate path. FX and rates positioning shared in thread."}
                {selectedRoomId === "crypto" &&
                  "BTC holding range; room watching alt rotations and high-beta equity correlation. Risk callouts and stop levels shared in thread."}
              </p>
            </div>

            <div className="space-y-3 rounded-xl border border-white/5 bg-black/40 p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                Top Contributors This Week
              </p>
              <ul className="space-y-1.5 text-[11px] text-zinc-300">
                {[
                  { name: "FlowDesk", posts: 24 },
                  { name: "MacroLens", posts: 18 },
                  { name: "DataWatch", posts: 14 },
                  { name: "RatesDesk", posts: 11 },
                  { name: "CryptoFlow", posts: 9 },
                ].map((u, i) => (
                  <li key={u.name} className="flex items-center justify-between rounded-lg bg-white/5 px-2 py-1.5">
                    <span className="font-medium text-zinc-200">@{u.name}</span>
                    <span className="text-zinc-500">{u.posts} posts</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-3 space-y-3 rounded-xl border border-white/5 bg-black/40 p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                Live thread
              </p>
              <div className="space-y-2 text-[11px]">
                {selectedRoomId === "equities" && (
                  <>
                    <div className="rounded-lg bg-white/5 p-2">
                      <p className="text-[10px] font-semibold text-emerald-300">@FlowDesk · Equity trader</p>
                      <p className="mt-1 text-zinc-200">
                        Seeing steady call buying in QQQ weeklies and sector rotation into semis. Watching for confirmation from breadth and volume before sizing up.
                      </p>
                      <p className="mt-1 text-[10px] text-zinc-500">Tagged: #QQQ #Semis #Flow</p>
                    </div>
                    <div className="rounded-lg bg-white/2 p-2">
                      <p className="text-[10px] font-semibold text-cyan-300">@MacroLens · Cross-asset</p>
                      <p className="mt-1 text-zinc-200">
                        If CPI print stays benign, this room is watching for a follow-through leg higher in SPY into month-end rebalance.
                      </p>
                      <p className="mt-1 text-[10px] text-zinc-500">Tagged: #SPY #CPI #Rebalance</p>
                    </div>
                  </>
                )}
                {selectedRoomId === "macro" && (
                  <>
                    <div className="rounded-lg bg-white/5 p-2">
                      <p className="text-[10px] font-semibold text-cyan-300">@RatesDesk · Fixed income</p>
                      <p className="mt-1 text-zinc-200">
                        Front-end yields pricing one cut by year-end. Room watching payrolls and CPI for confirmation; FX flows into JPY and EUR.
                      </p>
                      <p className="mt-1 text-[10px] text-zinc-500">Tagged: #Rates #FOMC #FX</p>
                    </div>
                    <div className="rounded-lg bg-white/2 p-2">
                      <p className="text-[10px] font-semibold text-emerald-300">@DataWatch · Macro</p>
                      <p className="mt-1 text-zinc-200">
                        ECB and BOJ on hold; focus on data dependency. Trade ideas in 2s10s and DXY shared in thread.
                      </p>
                      <p className="mt-1 text-[10px] text-zinc-500">Tagged: #Macro #DataReleases</p>
                    </div>
                  </>
                )}
                {selectedRoomId === "crypto" && (
                  <>
                    <div className="rounded-lg bg-white/5 p-2">
                      <p className="text-[10px] font-semibold text-fuchsia-300">@CryptoFlow · Vol trader</p>
                      <p className="mt-1 text-zinc-200">
                        BTC range holding; alts rotating on low volume. Room sharing levels and stop-loss ideas — size to your own risk.
                      </p>
                      <p className="mt-1 text-[10px] text-zinc-500">Tagged: #BTC #Alts #HighBeta</p>
                    </div>
                    <div className="rounded-lg bg-white/2 p-2">
                      <p className="text-[10px] font-semibold text-amber-300">@RiskDesk · Risk manager</p>
                      <p className="mt-1 text-zinc-200">
                        Reminder: ideas in this room are for discussion only. High-conviction trades can still lose money.
                      </p>
                      <p className="mt-1 text-[10px] text-amber-300">Not investment advice.</p>
                    </div>
                  </>
                )}
                <div className="rounded-lg bg-white/0.5 p-2">
                  <p className="text-[10px] font-semibold text-zinc-300">@RiskDesk · Risk manager</p>
                  <p className="mt-1 text-zinc-200">
                    Ideas here are shared for discussion only. Size positions to your own risk tolerance.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 text-[11px] text-zinc-400">
              <p>
                {joinedRoomIds.length > 0
                  ? "Your joined rooms appear in your profile under Groups you're in."
                  : "Joining a room will unlock full chat, ability to follow top contributors, and save threads into your idea journal."}
              </p>
              <div className="flex justify-end">
                {user ? (
                  <span className="text-[11px] text-emerald-300">
                    {joinedRoomIds.length > 0 ? "View your groups on your profile." : "Pick a room on the left to join."}
                  </span>
                ) : (
                  <Link
                    href="/auth/sign-in"
                    className="rounded-full bg-[#11c60f] px-4 py-1.5 text-[11px] font-semibold text-[#020308] shadow-lg shadow-[#11c60f]/40 transition hover:bg-[#13e211]"
                  >
                    Sign in to join
                  </Link>
                )}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}

