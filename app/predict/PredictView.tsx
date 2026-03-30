"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../components/AuthContext";
import { useToast } from "../../components/ToastContext";
import {
  addMarket,
  addPoints,
  addPredictNotification,
  canClaimDaily,
  claimDailyBonus,
  CREATOR_BONUS_XP,
  deductPoints,
  getLeaderboard,
  getPoints,
  getProbability,
  loadBets,
  loadMarkets,
  markMarketAwaiting,
  placeBet,
  potentialPayout,
  profitIfWin,
  resolveMarket,
  saveBets,
  saveMarkets,
  type PredictBet,
  type PredictCategory,
  type PredictMarket,
} from "../../lib/predict";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Cell } from "recharts";

const CATEGORIES: { key: PredictCategory | "Trending"; label: string }[] = [
  { key: "Trending", label: "Trending" },
  { key: "Finance", label: "Finance" },
  { key: "Macro", label: "Macro" },
  { key: "Crypto", label: "Crypto" },
  { key: "Politics", label: "Politics" },
  { key: "All", label: "All Markets" },
];

const CATEGORY_COLORS: Record<string, string> = {
  Finance: "#3B82F6",
  Crypto: "#F59E0B",
  Macro: "#10B981",
  Politics: "#8B5CF6",
  All: "#6B7280",
};

function formatTimeAgo(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const day = Math.floor(h / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
}

function formatCloseDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function daysUntilClose(closeDate: string): number {
  const close = new Date(closeDate + "T23:59:59").getTime();
  const now = new Date().setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((close - now) / (24 * 60 * 60 * 1000)));
}

function PointsBalance({ points: pointsProp }: { points?: number }) {
  const [localPoints, setLocalPoints] = useState(getPoints());
  const [showTooltip, setShowTooltip] = useState(false);
  useEffect(() => {
    setLocalPoints(getPoints());
    const onStorage = () => setLocalPoints(getPoints());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const display = pointsProp ?? localPoints;
  return (
    <div className="relative flex items-center gap-2">
      <button
        type="button"
        onClick={() => setShowTooltip((s) => !s)}
        onBlur={() => setTimeout(() => setShowTooltip(false), 150)}
        className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-400"
      >
        <span aria-hidden>XP</span>
        <span>{(display ?? 0).toLocaleString()} XP</span>
      </button>
      {showTooltip && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-white/10 bg-[#0F1520] px-3 py-2 text-xs text-zinc-300 shadow-xl">
          Virtual points — real money markets coming soon
        </div>
      )}
    </div>
  );
}

function MarketCard({
  market,
  onBet,
  onShare,
  onResolve,
  onMarkAwaiting,
  isCreator,
  recentBetsCount,
  traderCount,
}: {
  market: PredictMarket;
  onBet: (m: PredictMarket, side: "yes" | "no") => void;
  onShare: (m: PredictMarket) => void;
  onResolve?: (m: PredictMarket, outcome: "yes" | "no") => void;
  onMarkAwaiting?: (m: PredictMarket) => void;
  isCreator?: boolean;
  recentBetsCount?: number;
  traderCount?: number;
}) {
  const { yes, no } = getProbability(market.yesPoints, market.noPoints);
  const yesPct = Math.round(yes * 100);
  const noPct = Math.round(no * 100);
  const daysLeft = daysUntilClose(market.closeDate);
  const isTrending = (recentBetsCount ?? 0) >= 3 || (market.lastBetAt && (Date.now() - new Date(market.lastBetAt).getTime() < 60 * 60 * 1000));
  const totalWagered = market.yesPoints + market.noPoints;
  const tradersLabel = typeof traderCount === "number" ? traderCount : "—";

  return (
    <div
      className={`rounded-xl border bg-[#0F1520] p-4 transition-all hover:border-white/20 hover:shadow-lg hover:shadow-[var(--accent-color)]/5 ${
        isTrending ? "ring-1 ring-amber-500/30" : "border-white/10"
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: `${CATEGORY_COLORS[market.category] ?? "#6B7280"}30`, color: CATEGORY_COLORS[market.category] ?? "#9CA3AF" }}
        >
          {market.category}
        </span>
        {market.status === "awaiting" && (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400">Awaiting Resolution</span>
        )}
        {market.status === "resolved" && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${market.outcome === "yes" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
            {market.outcome === "yes" ? "YES WON" : "NO WON"}
          </span>
        )}
        {isTrending && (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400">Trending</span>
        )}
      </div>
      <h3 className="mb-1 text-sm font-semibold text-zinc-100">{market.question}</h3>
      <p className="mb-3 text-xs text-zinc-500">
        @{market.createdBy} · {formatTimeAgo(market.createdAt)}
      </p>
      {market.status === "open" && (
        <p className={`mb-2 text-xs ${daysLeft <= 3 ? "text-red-400" : "text-zinc-500"}`}>
          Closes in {daysLeft} days · {formatCloseDate(market.closeDate)}
        </p>
      )}
      {market.status === "open" && (
        <>
          <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-l-full bg-[#00C896] transition-all duration-500"
              style={{ width: `${yesPct}%` }}
            />
            <div
              className="h-full bg-[#EF4444] transition-all duration-500"
              style={{ width: `${noPct}%` }}
            />
          </div>
          <p className="mb-3 text-center text-xs text-zinc-400">
            YES {yesPct}% ←————————→ {noPct}% NO
          </p>
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => onBet(market, "yes")}
              className="flex-1 rounded-lg bg-[#00C896]/20 py-2 text-sm font-medium text-[#00C896] hover:bg-[#00C896]/30"
            >
              YES {yesPct}%
            </button>
            <button
              type="button"
              onClick={() => onBet(market, "no")}
              className="flex-1 rounded-lg bg-[#EF4444]/20 py-2 text-sm font-medium text-[#EF4444] hover:bg-[#EF4444]/30"
            >
              NO {noPct}%
            </button>
          </div>
        </>
      )}
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{tradersLabel} traders · {totalWagered.toLocaleString()} XP wagered</span>
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={() => onShare(market)} className="rounded px-2 py-1 hover:bg-white/5 hover:text-zinc-300">
            Share
          </button>
          {isCreator && market.status === "open" && onMarkAwaiting && (
            <button type="button" onClick={() => onMarkAwaiting(market)} className="rounded px-2 py-1 text-amber-400 hover:bg-white/5">
              Mark awaiting
            </button>
          )}
          {isCreator && market.status === "awaiting" && onResolve && (
            <>
              <button type="button" onClick={() => onResolve(market, "yes")} className="rounded px-2 py-1 text-emerald-400 hover:bg-white/5">
                Resolve YES
              </button>
              <button type="button" onClick={() => onResolve(market, "no")} className="rounded px-2 py-1 text-red-400 hover:bg-white/5">
                Resolve NO
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BetModal({
  market,
  side,
  onClose,
  onConfirm,
}: {
  market: PredictMarket;
  side: "yes" | "no";
  onClose: () => void;
  onConfirm: (amount: number) => void;
}) {
  const { yes, no } = getProbability(market.yesPoints, market.noPoints);
  const oddsPct = Math.round((side === "yes" ? yes : no) * 100);
  const maxPoints = getPoints();
  const [amount, setAmount] = useState(Math.min(100, maxPoints));
  const payout = potentialPayout(amount, side === "yes" ? yes : no);
  const profit = profitIfWin(amount, side === "yes" ? yes : no);
  const quickAmounts = [50, 100, 250, 500, maxPoints];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl border border-white/10 bg-[#0F1520] p-6 shadow-xl sm:max-h-[85vh] sm:overflow-y-auto sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 truncate text-sm font-semibold text-zinc-100">{market.question}</h3>
        <p className="mb-3 text-xs text-zinc-500">
          Your choice: <span className={side === "yes" ? "text-[#00C896]" : "text-[#EF4444]"}>{side.toUpperCase()}</span> · Current odds: {oddsPct}%
        </p>
        <div className="mb-4">
          <label className="mb-2 block text-xs text-zinc-400">Bet amount (XP)</label>
          <input
            type="number"
            min={10}
            max={maxPoints}
            value={amount}
            onChange={(e) => setAmount(Math.min(maxPoints, Math.max(10, parseInt(e.target.value, 10) || 10)))}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-zinc-100"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {quickAmounts.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setAmount(q)}
                className="rounded-lg border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
              >
                {q === maxPoints ? "ALL IN" : q}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={10}
            max={maxPoints}
            value={amount}
            onChange={(e) => setAmount(parseInt(e.target.value, 10))}
            className="mt-2 w-full"
          />
        </div>
        <p className="mb-2 text-xs text-zinc-400">
          If {side.toUpperCase()} wins: +{profit} XP (total {payout} XP)
        </p>
        <p className="mb-4 text-xs text-zinc-500">If {side === "yes" ? "NO" : "YES"} wins: -{amount} XP (your bet)</p>
        <p className="mb-4 text-xs text-zinc-500">Current odds based on total XP wagered on YES vs NO.</p>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-white/20 py-2 text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(amount)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium text-white ${side === "yes" ? "bg-[#00C896]" : "bg-[#EF4444]"}`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateMarketModal({
  onClose,
  onCreate,
  userId,
  userName,
}: {
  onClose: () => void;
  onCreate: (input: { question: string; category: PredictCategory; closeDate: string; resolutionCriteria?: string; initialYesPercent: number }) => void;
  userId: string;
  userName: string;
}) {
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState<PredictCategory>("Finance");
  const [closeDate, setCloseDate] = useState("");
  const [criteria, setCriteria] = useState("");
  const [initialYes, setInitialYes] = useState(50);
  const minDate = new Date().toISOString().slice(0, 10);

  const handleSubmit = () => {
    if (!question.trim()) return;
    let date = closeDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (date < minDate) date = minDate;
    onCreate({ question: question.trim(), category: category === "All" ? "Finance" : category, closeDate: date, resolutionCriteria: criteria.trim() || undefined, initialYesPercent: initialYes });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/10 bg-[#0F1520] p-6 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">Create Market</h2>
        <p className="mb-2 text-xs text-zinc-500">Your question must have a clear YES or NO answer (e.g. &quot;Will X happen by [date]?&quot;)</p>
        <input
          type="text"
          placeholder="e.g. Will the S&P 500 close above 6,000 by end of 2026?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="mb-4 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-zinc-100 placeholder:text-zinc-500"
        />
        <label className="mb-2 block text-xs text-zinc-400">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as PredictCategory)}
          className="mb-4 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-zinc-100"
        >
          {["Finance", "Crypto", "Macro", "Politics"].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <label className="mb-2 block text-xs text-zinc-400">Closing date</label>
        <input
          type="date"
          min={minDate}
          value={closeDate}
          onChange={(e) => setCloseDate(e.target.value)}
          className="mb-4 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-zinc-100"
        />
        <label className="mb-2 block text-xs text-zinc-400">Resolution criteria (optional)</label>
        <textarea
          placeholder="How will this market be resolved? What source will confirm the outcome?"
          value={criteria}
          onChange={(e) => setCriteria(e.target.value)}
          rows={2}
          className="mb-4 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-zinc-100 placeholder:text-zinc-500"
        />
        <label className="mb-2 block text-xs text-zinc-400">Starting YES probability: {initialYes}%</label>
        <input type="range" min={10} max={90} value={initialYes} onChange={(e) => setInitialYes(parseInt(e.target.value, 10))} className="mb-4 w-full" />
        <div className="mb-4 rounded-lg border border-white/10 p-3 text-xs text-zinc-500">
          Preview: &quot;{question || "Your question"}&quot; · {category} · Closes {closeDate || "—"} · YES {initialYes}% / NO {100 - initialYes}%
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-white/20 py-2 text-sm">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={!question.trim()} className="flex-1 rounded-lg bg-[var(--accent-color)] py-2 text-sm font-medium text-[#020308] disabled:opacity-50">
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PredictView() {
  const { user } = useAuth();
  const toast = useToast();
  const userId = user?.id ?? user?.email ?? "anon";
  const userName = user?.username?.trim() || user?.name?.trim() || "trader";

  const [markets, setMarkets] = useState<PredictMarket[]>([]);
  const [bets, setBets] = useState<PredictBet[]>([]);
  const [tab, setTab] = useState<PredictCategory | "Trending">("Trending");
  const [betModal, setBetModal] = useState<{ market: PredictMarket; side: "yes" | "no" } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [points, setPoints] = useState(0);

  const refresh = useCallback(() => {
    setMarkets(loadMarkets(userId));
    setBets(loadBets());
    setPoints(getPoints());
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Daily bonus check on mount
  useEffect(() => {
    if (canClaimDaily()) {
      const claimed = claimDailyBonus();
      if (claimed) {
        toast.showToast("Daily bonus: +50 XP claimed!", "success");
        addPredictNotification("Daily bonus: +50 XP added", "/predict");
        refresh();
      }
    }
  }, [refresh]);

  const filteredMarkets = useMemo(() => {
    let list = [...markets];
    if (tab === "Trending") {
      list = list
        .filter((m) => m.status === "open")
        .sort((a, b) => (b.lastBetAt ?? "").localeCompare(a.lastBetAt ?? ""));
    } else if (tab !== "All") {
      list = list.filter((m) => m.category === tab);
    }
    return list;
  }, [markets, tab]);

  const myBets = useMemo(() => bets.filter((b) => b.userId === userId), [bets, userId]);
  const activeBets = myBets.filter((b) => b.status === "open");
  const myResolvedBets = useMemo(() => myBets.filter((b) => b.status === "won" || b.status === "lost"), [myBets]);
  const performanceStats = useMemo(() => {
    const wins = myResolvedBets.filter((b) => b.status === "won").length;
    const losses = myResolvedBets.filter((b) => b.status === "lost").length;
    let pl = 0;
    myResolvedBets.forEach((b) => {
      if (b.status === "won" && b.payout != null) pl += b.payout - b.amount;
      else if (b.status === "lost") pl -= b.amount;
    });
    return { wins, losses, totalTrades: wins + losses, pl };
  }, [myResolvedBets]);
  const performanceChartData = useMemo(() => [
    { name: "Won", count: performanceStats.wins, fill: "#00C896" },
    { name: "Lost", count: performanceStats.losses, fill: "#EF4444" },
  ], [performanceStats.wins, performanceStats.losses]);
  const plOverTimeData = useMemo(() => {
    const sorted = [...myResolvedBets].sort((a, b) => (a.resolvedAt ?? a.placedAt).localeCompare(b.resolvedAt ?? b.placedAt));
    let cum = 0;
    return sorted.map((b) => {
      if (b.status === "won" && b.payout != null) cum += b.payout - b.amount;
      else if (b.status === "lost") cum -= b.amount;
      return { trade: sorted.indexOf(b) + 1, pl: cum, date: (b.resolvedAt ?? b.placedAt).slice(0, 10) };
    });
  }, [myResolvedBets]);
  const leaderboardAll = useMemo(() => getLeaderboard(bets, "all"), [bets]);
  const leaderboardWeek = useMemo(() => getLeaderboard(bets, "week"), [bets]);
  const [leaderboardTab, setLeaderboardTab] = useState<"week" | "all">("all");
  const recentlyResolved = useMemo(() => markets.filter((m) => m.status === "resolved").slice(0, 5), [markets]);

  const handleBetConfirm = useCallback(
    (amount: number) => {
      if (!betModal) return;
      const result = placeBet(markets, bets, betModal.market.id, userId, userName, betModal.side, amount);
      if (result.success && result.updatedMarkets && result.updatedBets) {
        setMarkets(result.updatedMarkets);
        setBets(result.updatedBets);
        setPoints(getPoints());
        toast.showToast(`Bet placed! ${amount} XP on ${betModal.side.toUpperCase()}`, "success");
        setBetModal(null);
      } else {
        toast.showToast(result.error ?? "Bet failed", "warning");
      }
    },
    [betModal, markets, bets, userId, userName, toast]
  );

  const handleCreateMarket = useCallback(
    (input: { question: string; category: PredictCategory; closeDate: string; resolutionCriteria?: string; initialYesPercent: number }) => {
      const { market, updated } = addMarket(markets, {
        ...input,
        createdBy: userId,
        createdByName: userName,
      });
      setMarkets(updated);
      addPoints(CREATOR_BONUS_XP);
      setPoints(getPoints());
      toast.showToast("Market created! Share it to get more traders", "success");
      addPredictNotification(`New market: @${userName} created a ${input.category} market`, `/predict`);
      setCreateOpen(false);
    },
    [markets, userId, userName, toast]
  );

  const handleResolve = useCallback(
    (market: PredictMarket, outcome: "yes" | "no") => {
      const myBet = bets.find((b) => b.marketId === market.id && b.userId === userId && b.status === "open");
      const { updatedMarkets, updatedBets } = resolveMarket(markets, bets, market.id, outcome, userId);
      setMarkets(updatedMarkets);
      setBets(updatedBets);
      setPoints(getPoints());
      toast.showToast(`Market resolved: ${outcome.toUpperCase()} won`, "success");
      const iWon = myBet && myBet.side === outcome;
      if (iWon) {
        const payout = myBet ? potentialPayout(myBet.amount, myBet.oddsAtBet) : 0;
        addPredictNotification(`You predicted correctly! +${payout} XP added to your balance`, "/predict");
      }
    },
    [markets, bets, userId, toast]
  );

  const handleMarkAwaiting = useCallback(
    (market: PredictMarket) => {
      setMarkets(markMarketAwaiting(markets, market.id));
    },
    [markets]
  );

  const handleShare = useCallback((market: PredictMarket) => {
    const url = typeof window !== "undefined" ? `${window.location.origin}/predict?m=${market.id}` : "";
    navigator.clipboard.writeText(url);
    toast.showToast("Link copied to clipboard", "info");
  }, [toast]);

  return (
    <div className="min-h-screen bg-[#0A0E1A] text-zinc-200">
      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Prediction Markets</h1>
            <p className="text-sm text-zinc-500">Trade on outcomes. Earn XP. Prove your edge.</p>
          </div>
          <div className="flex items-center gap-3">
            <PointsBalance points={points} />
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-lg bg-[var(--accent-color)] px-4 py-2 text-sm font-semibold text-[#020308] hover:opacity-90"
            >
              Create Market
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {CATEGORIES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === key ? "bg-white/15 text-zinc-100" : "bg-white/5 text-zinc-400 hover:bg-white/10"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex gap-6">
          {/* Main grid */}
          <div className="min-w-0 flex-1">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
              {filteredMarkets.map((market) => (
                <MarketCard
                  key={market.id}
                  market={market}
                  onBet={(m, side) => setBetModal({ market: m, side })}
                  onShare={handleShare}
                  onResolve={market.createdBy === userId && market.status === "awaiting" ? handleResolve : undefined}
                  onMarkAwaiting={market.createdBy === userId && market.status === "open" ? handleMarkAwaiting : undefined}
                  isCreator={market.createdBy === userId}
                  recentBetsCount={bets.filter((b) => b.marketId === market.id && Date.now() - new Date(b.placedAt).getTime() < 3600000).length}
                  traderCount={new Set(bets.filter((b) => b.marketId === market.id).map((b) => b.userId)).size}
                />
              ))}
            </div>
            {filteredMarkets.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-[#0F1520] p-8 text-center text-zinc-500">
                No markets in this category. Create one!
              </div>
            )}

            {/* Mobile: Performance, Active bets & leaderboard */}
            <div className="mt-6 space-y-4 lg:hidden">
              <div className="rounded-xl border border-white/10 bg-[#0F1520] p-4">
                <h3 className="mb-3 text-sm font-semibold text-zinc-100">Your Performance</h3>
                {performanceStats.totalTrades === 0 ? (
                  <p className="text-xs text-zinc-500">Resolve some markets to see your wins, losses, and P/L here.</p>
                ) : (
                  <>
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="text-zinc-400">Total: <strong className="text-zinc-200">{performanceStats.totalTrades}</strong> trades</span>
                      <span className={performanceStats.pl >= 0 ? "text-[#00C896]" : "text-[#EF4444]"}>
                        P/L: {performanceStats.pl >= 0 ? "+" : ""}{performanceStats.pl} XP
                      </span>
                    </div>
                    <div className="h-20 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={performanceChartData} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
                          <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#9CA3AF" }} />
                          <YAxis hide />
                          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                            {performanceChartData.map((entry, i) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                )}
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0F1520] p-4">
                <h3 className="mb-3 text-sm font-semibold text-zinc-100">Your Active Bets</h3>
                {activeBets.length === 0 ? (
                  <p className="text-xs text-zinc-500">No active bets yet. Pick a market and make your prediction!</p>
                ) : (
                  <ul className="space-y-2">
                    {activeBets.slice(0, 3).map((bet) => {
                      const m = markets.find((x) => x.id === bet.marketId);
                      const prob = m ? getProbability(m.yesPoints, m.noPoints) : { yes: 0.5, no: 0.5 };
                      const odds = bet.side === "yes" ? prob.yes : prob.no;
                      const payout = potentialPayout(bet.amount, bet.oddsAtBet);
                      return (
                        <li key={bet.id} className="rounded-lg border border-white/5 p-2 text-xs">
                          <p className="truncate text-zinc-300">{m?.question ?? "Market"}</p>
                          <p className="mt-1">{bet.side.toUpperCase()} · {bet.amount} XP · {Math.round(odds * 100)}% · +{payout - bet.amount} XP</p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0F1520] p-4">
                <h3 className="mb-2 text-sm font-semibold text-zinc-100">Top Predictors</h3>
                <ul className="space-y-1 text-xs text-zinc-400">
                  {(leaderboardTab === "all" ? leaderboardAll : leaderboardWeek).slice(0, 5).map((u, i) => (
                    <li key={u.userId}>#{i + 1} {u.userName} · +{u.xpEarned} XP</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Right sidebar */}
          <aside className="hidden w-72 shrink-0 space-y-4 lg:block">
            {/* Your Performance graph */}
            <div className="rounded-xl border border-white/10 bg-[#0F1520] p-4">
              <h3 className="mb-3 text-sm font-semibold text-zinc-100">Your Performance</h3>
              {performanceStats.totalTrades === 0 ? (
                <p className="text-xs text-zinc-500">Resolve some markets to see your wins, losses, and P/L here.</p>
              ) : (
                <>
                  <div className="mb-3 flex items-center justify-between text-xs">
                    <span className="text-zinc-400">Total trades: <strong className="text-zinc-200">{performanceStats.totalTrades}</strong></span>
                    <span className={performanceStats.pl >= 0 ? "text-[#00C896]" : "text-[#EF4444]"}>
                      P/L: {performanceStats.pl >= 0 ? "+" : ""}{performanceStats.pl} XP
                    </span>
                  </div>
                  <div className="h-24 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={performanceChartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={{ stroke: "#374151" }} />
                        <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={{ stroke: "#374151" }} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#0F1520", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                          labelStyle={{ color: "#D1D5DB" }}
                          formatter={(value: unknown) => [typeof value === "number" ? value : 0, "trades"]}
                        />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {performanceChartData.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {plOverTimeData.length > 1 && (
                    <div className="mt-3 h-16 w-full">
                      <p className="mb-1 text-[10px] text-zinc-500">P/L over time</p>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={plOverTimeData} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="2 2" stroke="#374151" />
                          <XAxis dataKey="trade" tick={{ fontSize: 9, fill: "#6B7280" }} />
                          <YAxis tick={{ fontSize: 9, fill: "#6B7280" }} width={28} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "#0F1520", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                            formatter={(value: unknown) => [typeof value === "number" ? (value >= 0 ? `+${value} XP` : `${value} XP`) : "", "Cumulative P/L"]}
                            labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
                          />
                          <Line type="monotone" dataKey="pl" stroke="#F59E0B" strokeWidth={2} dot={{ r: 2 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0F1520] p-4">
              <h3 className="mb-3 text-sm font-semibold text-zinc-100">Your Active Bets</h3>
              {activeBets.length === 0 ? (
                <p className="text-xs text-zinc-500">No active bets yet. Pick a market and make your prediction!</p>
              ) : (
                <ul className="space-y-2">
                  {activeBets.slice(0, 5).map((bet) => {
                    const m = markets.find((x) => x.id === bet.marketId);
                    const prob = m ? getProbability(m.yesPoints, m.noPoints) : { yes: 0.5, no: 0.5 };
                    const odds = bet.side === "yes" ? prob.yes : prob.no;
                    const payout = potentialPayout(bet.amount, bet.oddsAtBet);
                    return (
                      <li key={bet.id} className="rounded-lg border border-white/5 p-2 text-xs">
                        <p className="truncate text-zinc-300">{m?.question ?? "Market"}</p>
                        <p className="mt-1">
                          <span className={bet.side === "yes" ? "text-[#00C896]" : "text-[#EF4444]"}>{bet.side.toUpperCase()}</span> · {bet.amount} XP · {Math.round(odds * 100)}%
                        </p>
                        <p className="text-zinc-500">Potential: +{payout - bet.amount} XP</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0F1520] p-4">
              <h3 className="mb-3 text-sm font-semibold text-zinc-100">Top Predictors</h3>
              <div className="mb-2 flex gap-1">
                <button type="button" onClick={() => setLeaderboardTab("week")} className={`rounded px-2 py-1 text-xs ${leaderboardTab === "week" ? "bg-white/15" : "bg-white/5"}`}>
                  This Week
                </button>
                <button type="button" onClick={() => setLeaderboardTab("all")} className={`rounded px-2 py-1 text-xs ${leaderboardTab === "all" ? "bg-white/15" : "bg-white/5"}`}>
                  All Time
                </button>
              </div>
              <ul className="space-y-2">
                {(leaderboardTab === "all" ? leaderboardAll : leaderboardWeek).map((u, i) => (
                  <li key={u.userId} className={`flex items-center justify-between rounded px-2 py-1 text-xs ${u.userId === userId ? "bg-[var(--accent-color)]/20 text-[var(--accent-color)]" : "text-zinc-400"}`}>
                    <span>#{i + 1} {u.userName}</span>
                    <span>{u.winRate.toFixed(0)}% · +{u.xpEarned} XP</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0F1520] p-4">
              <h3 className="mb-3 text-sm font-semibold text-zinc-100">Recently Resolved</h3>
              {recentlyResolved.length === 0 ? (
                <p className="text-xs text-zinc-500">No resolved markets yet.</p>
              ) : (
                <ul className="space-y-2">
                  {recentlyResolved.map((m) => (
                    <li key={m.id} className="truncate text-xs text-zinc-500">
                      {m.outcome === "yes" ? "YES" : "NO"} · {m.question.slice(0, 40)}…
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>

      {betModal && (
        <BetModal
          market={betModal.market}
          side={betModal.side}
          onClose={() => setBetModal(null)}
          onConfirm={handleBetConfirm}
        />
      )}
      {createOpen && (
        <CreateMarketModal
          onClose={() => setCreateOpen(false)}
          onCreate={handleCreateMarket}
          userId={userId}
          userName={userName}
        />
      )}
    </div>
  );
}
