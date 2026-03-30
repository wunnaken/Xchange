"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useMemo } from "react";

const PAGE_BG = "#0A0E1A";
const CARD_BG = "#0F1520";
const PRO_GOLD = "#F59E0B";

const TOOLS: { id: number; name: string; description: string }[] = [
  { id: 1, name: "Options Flow", description: "Live unusual options activity and large block trades" },
  { id: 2, name: "Sector Rotation", description: "11 S&P sectors performance heatmap — where is money flowing?" },
  { id: 3, name: "Fear & Greed Index", description: "Market sentiment gauge — are investors fearful or greedy?" },
  { id: 4, name: "IPO Calendar", description: "Upcoming IPOs, expected valuations, and post-IPO performance" },
  { id: 5, name: "Dividend Calendar", description: "Ex-dividend dates, yields, and payment schedules" },
  { id: 6, name: "Short Interest", description: "Most shorted stocks, squeeze candidates, and days to cover" },
  { id: 7, name: "Fed Dashboard", description: "Federal Reserve rates, dot plot, balance sheet, and CME probabilities" },
  { id: 8, name: "Earnings Whisper", description: "Official estimates vs trader expectations and historical beat rates" },
  { id: 9, name: "Congress Trades", description: "What politicians are buying and selling — follow the smart money" },
  { id: 10, name: "Dark Pool", description: "Large institutional off-equantivtrade block trades and smart money flow" },
  { id: 11, name: "Crypto Dashboard", description: "Dominance, funding rates, stablecoin flows, and fear index" },
];

export default function DataHubView() {
  const [selectedTool, setSelectedTool] = useState<number | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const goPrev = useCallback(() => {
    setSelectedTool((t) => (t != null && t > 1 ? t - 1 : 11));
  }, []);
  const goNext = useCallback(() => {
    setSelectedTool((t) => (t != null && t < 11 ? t + 1 : 1));
  }, []);

  if (selectedTool != null) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: PAGE_BG }}>
        <div className="mx-auto max-w-6xl px-4 py-6">
          <nav className="mb-6 flex flex-wrap items-center gap-3 text-sm">
            <button type="button" onClick={() => setSelectedTool(null)} className="text-zinc-400 hover:text-white">
              DataHub
            </button>
            <span className="font-medium text-white">{TOOLS[selectedTool - 1]?.name}</span>
          </nav>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={goPrev} className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/10">
              Prev
            </button>
            <button type="button" onClick={goNext} className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/10">
              Next
            </button>
            <button type="button" onClick={() => setSelectedTool(null)} className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/10">
              All Tools
            </button>
          </div>
          <ExpandedToolView toolId={selectedTool} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: PAGE_BG }}>
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Header */}
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              DataHub
            </h1>
            <p className="mt-1 text-sm text-zinc-400">Professional market data. Institutional grade intelligence.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">Pro Feature</span>
            <p className="text-xs text-zinc-500">Upgrade to Pro to unlock all DataHub tools</p>
            <Link href="/plans" className="rounded-lg px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90" style={{ backgroundColor: PRO_GOLD }}>
              Upgrade to Pro
            </Link>
          </div>
        </header>

        {/* Preview banner */}
        {!bannerDismissed && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-amber-600/5 px-4 py-3">
            <p className="text-sm text-amber-100">
              You&apos;re previewing DataHub — data is limited. Upgrade to Pro for full real-time access to all 11 tools.
            </p>
            <button type="button" onClick={() => setBannerDismissed(true)} className="shrink-0 rounded p-1 text-amber-200 hover:bg-amber-500/20" aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => setSelectedTool(tool.id)}
              className="group flex flex-col rounded-xl border border-[var(--accent-color)]/30 bg-[#0F1520] p-5 text-left transition duration-200 hover:border-[var(--accent-color)]/60 hover:shadow-lg hover:bg-[var(--accent-color)]/5"
            >
              <div className="flex flex-1 flex-col">
                <h3 className="font-semibold text-white transition duration-200 group-hover:text-[var(--accent-color)] group-hover:scale-[1.02]">{tool.name}</h3>
                <p className="mt-1 text-xs text-zinc-400 group-hover:text-zinc-300">{tool.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExpandedToolView({ toolId }: { toolId: number }) {
  switch (toolId) {
    case 1:
      return <OptionsFlowView />;
    case 2:
      return <SectorRotationView />;
    case 3:
      return <FearGreedView />;
    case 4:
      return <IPOCalendarView />;
    case 5:
      return <DividendCalendarView />;
    case 6:
      return <ShortInterestView />;
    case 7:
      return <FedDashboardView />;
    case 8:
      return <EarningsWhisperView />;
    case 9:
      return <CongressTradesView />;
    case 10:
      return <DarkPoolView />;
    case 11:
      return <CryptoDashboardView />;
    default:
      return null;
  }
}

// ─── Tool 1: Options Flow ─────────────────────────────────────────────────
function OptionsFlowView() {
  const [typeFilter, setTypeFilter] = useState<"all" | "calls" | "puts">("all");
  const [minPremium, setMinPremium] = useState(0);
  const [periodFilter, setPeriodFilter] = useState<"today" | "week">("today");

  const allRows = useMemo(() => {
    // TODO: Replace with Options Flow API
    // Endpoint: e.g. Unusual Whales https://docs.unusualwhales.com/ or similar vendor (options flow, premium, block trades)
    // When: before launch
    const base = [
      { time: "09:45", ticker: "NVDA", type: "Call" as const, strike: 140, expiry: "03/21", premium: 2.4, size: 1250, sentiment: "Bullish" },
      { time: "10:12", ticker: "TSLA", type: "Put" as const, strike: 220, expiry: "04/18", premium: 1.8, size: 800, sentiment: "Bearish" },
      { time: "10:33", ticker: "AAPL", type: "Call" as const, strike: 195, expiry: "03/28", premium: 3.1, size: 500, sentiment: "Bullish" },
      ...Array.from({ length: 17 }, (_, i) => {
        const h = 10 + Math.floor(i / 4);
        const m = (i % 4) * 15;
        return {
          time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
          ticker: ["META", "AMZN", "GOOGL", "MSFT"][i % 4],
          type: (i % 3 === 0 ? "Put" : "Call") as "Call" | "Put",
          strike: 180 + i * 5,
          expiry: "04/18",
          premium: 1.5 + (i * 0.08) % 2,
          size: 300 + i * 50,
          sentiment: i % 2 ? "Bullish" : "Bearish",
        };
      }),
    ];
    return base;
  }, []);

  const rows = useMemo(() => {
    return allRows.filter((r) => {
      if (typeFilter === "calls" && r.type !== "Call") return false;
      if (typeFilter === "puts" && r.type !== "Put") return false;
      const minVal = minPremium === 0 ? 0 : minPremium === 100 ? 0.1 : minPremium === 500 ? 0.5 : 1;
      if (r.premium < minVal) return false;
      return true;
    });
  }, [allRows, typeFilter, minPremium]);

  const displayDate = useMemo(() => new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }), []);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
        This tool uses sample data. Real-time options flow requires a live data provider.
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
        <span className="font-medium text-white">{displayDate}</span>
        <span>·</span>
        <span>Filters below apply to the table</span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-zinc-500">Total call premium today</p>
          <p className="text-xl font-bold text-emerald-400">$2.4B</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-zinc-500">Total put premium today</p>
          <p className="text-xl font-bold text-red-400">$1.8B</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-zinc-500">Put/Call ratio</p>
          <p className="text-xl font-bold text-white">0.75</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-zinc-500">Sentiment</p>
          <p className="text-xl font-bold text-emerald-400">Bullish</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setTypeFilter("all")} className={`rounded px-3 py-1 text-xs ${typeFilter === "all" ? "bg-white/20 text-white" : "bg-white/5 text-zinc-400 hover:bg-white/10"}`}>All</button>
        <button type="button" onClick={() => setTypeFilter("calls")} className={`rounded px-3 py-1 text-xs ${typeFilter === "calls" ? "bg-white/20 text-white" : "bg-white/5 text-zinc-400 hover:bg-white/10"}`}>Calls only</button>
        <button type="button" onClick={() => setTypeFilter("puts")} className={`rounded px-3 py-1 text-xs ${typeFilter === "puts" ? "bg-white/20 text-white" : "bg-white/5 text-zinc-400 hover:bg-white/10"}`}>Puts only</button>
        <label className="ml-2 flex items-center gap-1 text-xs text-zinc-500">
          Min premium:
          <select value={minPremium} onChange={(e) => setMinPremium(Number(e.target.value))} className="rounded border border-white/20 bg-[#0F1520] px-2 py-1 text-zinc-300 focus:border-white/40 focus:outline-none">
            <option value={0}>Any</option>
            <option value={100}>$100K</option>
            <option value={500}>$500K</option>
            <option value={1000}>$1M+</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-zinc-500">
          <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value as "today" | "week")} className="rounded border border-white/20 bg-[#0F1520] px-2 py-1 text-zinc-300 focus:border-white/40 focus:outline-none">
            <option value="today">Today</option>
            <option value="week">This week</option>
          </select>
        </label>
      </div>
      <div className="overflow-hidden rounded-lg border border-white/10 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="p-2 font-medium text-zinc-400">Time</th>
              <th className="p-2 font-medium text-zinc-400">Ticker</th>
              <th className="p-2 font-medium text-zinc-400">Type</th>
              <th className="p-2 font-medium text-zinc-400">Strike</th>
              <th className="p-2 font-medium text-zinc-400">Expiry</th>
              <th className="p-2 font-medium text-zinc-400">Premium</th>
              <th className="p-2 font-medium text-zinc-400">Size</th>
              <th className="p-2 font-medium text-zinc-400">Sentiment</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`border-b border-white/5 ${i % 2 ? "bg-white/[0.02]" : ""}`}>
                <td className="p-2 text-zinc-300">{r.time}</td>
                <td className="p-2 font-medium text-white">{r.ticker}</td>
                <td className={`p-2 font-medium ${r.type === "Call" ? "text-emerald-400" : "text-red-400"}`}>{r.type}</td>
                <td className="p-2 text-zinc-300">{r.strike}</td>
                <td className="p-2 text-zinc-300">{r.expiry}</td>
                <td className="p-2 text-zinc-300">${r.premium}M</td>
                <td className="p-2 text-zinc-300">{r.size}</td>
                <td className="p-2">{r.sentiment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tool 2: Sector Rotation ───────────────────────────────────────────────
function SectorRotationView() {
  const [sectors, setSectors] = useState<{ symbol: string; name: string; changePercent: number }[]>([]);
  const [range, setRange] = useState("1D");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/datahub/sectors?range=${range}`)
      .then((r) => r.json())
      .then((d) => { setSectors(d.sectors ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [range]);

  const getColor = (pct: number) => {
    if (pct >= 2) return "bg-emerald-700 text-white";
    if (pct >= 0) return "bg-emerald-500/30 text-emerald-300";
    if (pct >= -2) return "bg-red-500/30 text-red-300";
    return "bg-red-700 text-white";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {["1D", "1W", "1M", "YTD"].map((r) => (
          <button key={r} type="button" onClick={() => setRange(r)} className={`rounded-lg px-3 py-1.5 text-sm ${range === r ? "bg-white/20 text-white" : "bg-white/5 text-zinc-400 hover:bg-white/10"}`}>
            {r}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-white/10" />
          ))}
        </div>
      ) : sectors.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-center text-sm text-zinc-400">
          No sector data available. Add FINNHUB_API_KEY for real S&P sector performance (1D, 1W, 1M, YTD).
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {sectors.map((s) => (
              <div key={s.symbol} className={`rounded-lg p-4 text-center ${getColor(s.changePercent)}`}>
                <p className="font-semibold">{s.name}</p>
                <p className="text-lg font-bold">{s.changePercent >= 0 ? "+" : ""}{s.changePercent.toFixed(2)}%</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-white/10 p-4">
            <p className="text-sm text-zinc-400">Performance is {range} — green = up, red = down vs. period start.</p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Tool 4: Fear & Greed ──────────────────────────────────────────────────
function FearGreedView() {
  const [score, setScore] = useState(55);
  const [label, setLabel] = useState("Greed");
  useEffect(() => {
    fetch("/api/datahub/crypto-fng")
      .then((r) => r.json())
      .then((d) => { setScore(d.value ?? 55); setLabel(d.label ?? "Greed"); })
      .catch(() => {});
  }, []);
  const currentLabel = score <= 25 ? "Extreme Fear" : score <= 45 ? "Fear" : score <= 55 ? "Neutral" : score <= 75 ? "Greed" : "Extreme Greed";
  const needleAngle = -90 + (score / 100) * 180;
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center">
        <div className="relative h-44 w-80 overflow-visible pt-2">
          <svg viewBox="-8 -12 216 112" className="h-full w-full overflow-visible" preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="fgGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#EF4444" />
                <stop offset="50%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#22C55E" />
              </linearGradient>
            </defs>
            <path d="M 28 88 A 80 80 0 0 1 188 88" fill="none" stroke="url(#fgGrad)" strokeWidth="12" />
            <g transform={`rotate(${needleAngle}, 100, 88)`}>
              <line x1="100" y1="88" x2="100" y2="32" stroke="white" strokeWidth="3" strokeLinecap="round" />
              <polygon points="100,18 96,34 104,34" fill="white" />
            </g>
          </svg>
        </div>
        <p className="mt-4 text-4xl font-bold text-white">{score}</p>
        <p className="text-lg text-zinc-400">{currentLabel}</p>
        <p className="mt-4 text-xs text-zinc-500">Previous close: 52 | 1 week ago: 48 | 1 month ago: 45</p>
      </div>
      <div className="h-32 rounded-lg border border-white/10 bg-white/5 p-4">
        <p className="text-xs text-zinc-500">Last 30 days (placeholder)</p>
        <div className="mt-2 h-20 w-full rounded bg-white/5" />
      </div>
    </div>
  );
}

// ─── Tool 5: IPO Calendar ──────────────────────────────────────────────────
function IPOCalendarView() {
  const [ipo, setIpo] = useState<Array<{ name: string; date: string; equantivtrade: string; priceRangeLow?: number; priceRangeHigh?: number; status: string }>>([]);
  const [range, setRange] = useState<"week" | "month" | "quarter">("week");

  const { from, to } = useMemo(() => {
    const now = new Date();
    const from = new Date(now);
    let to: Date;
    if (range === "week") {
      to = new Date(now);
      to.setDate(to.getDate() + 7);
    } else if (range === "month") {
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else {
      to = new Date(now);
      to.setMonth(to.getMonth() + 3);
    }
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }, [range]);

  useEffect(() => {
    fetch(`/api/datahub/ipo?from=${from}&to=${to}`).then((r) => r.json()).then((d) => setIpo(d.ipoCalendar ?? []));
  }, [from, to]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button type="button" onClick={() => setRange("week")} className={`rounded px-3 py-1 text-xs ${range === "week" ? "bg-white/20 text-white" : "bg-white/5 text-zinc-400 hover:bg-white/10"}`}>This week</button>
        <button type="button" onClick={() => setRange("month")} className={`rounded px-3 py-1 text-xs ${range === "month" ? "bg-white/20 text-white" : "bg-white/5 text-zinc-400 hover:bg-white/10"}`}>This month</button>
        <button type="button" onClick={() => setRange("quarter")} className={`rounded px-3 py-1 text-xs ${range === "quarter" ? "bg-white/20 text-white" : "bg-white/5 text-zinc-400 hover:bg-white/10"}`}>Next 3 months</button>
      </div>
      <div className="rounded-lg border border-white/10 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="p-2 font-medium text-zinc-400">Company</th>
              <th className="p-2 font-medium text-zinc-400">Expected date</th>
              <th className="p-2 font-medium text-zinc-400">Equantivtrade</th>
              <th className="p-2 font-medium text-zinc-400">Price range</th>
              <th className="p-2 font-medium text-zinc-400">Status</th>
            </tr>
          </thead>
          <tbody>
            {ipo.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-zinc-500 text-sm">No IPOs in this period. Data from Finnhub when API key is set.</td></tr>
            ) : (
              ipo.map((r, i) => (
                <tr key={i} className={`border-b border-white/5 ${i % 2 ? "bg-white/[0.02]" : ""}`}>
                  <td className="p-2 font-medium text-white">{r.name}</td>
                  <td className="p-2 text-zinc-300">{r.date}</td>
                  <td className="p-2 text-zinc-300">{r.equantivtrade}</td>
                  <td className="p-2 text-zinc-300">{r.priceRangeLow != null ? `$${r.priceRangeLow}-${r.priceRangeHigh}` : "—"}</td>
                  <td className="p-2"><span className="rounded bg-white/10 px-2 py-0.5 text-xs">{r.status}</span></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tool 6–7: Placeholder views ────────────────────────────────────────────
// TODO: Replace with Dividend Calendar API
// Endpoint: Finnhub /calendar/dividend or similar (ex-dividend dates, yields)
// When: before launch
function DividendCalendarView() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
        This tool uses sample data. Real ex-dividend dates require a dividend calendar data source.
      </div>
      <p className="text-zinc-400">Ex-dividend calendar — sample data.</p>
      <div className="rounded-lg border border-white/10 p-4">
        <p className="text-sm text-zinc-500">12 companies going ex-dividend this week paying total $2.40 per share</p>
      </div>
    </div>
  );
}

function ShortInterestView() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
        This tool uses sample data. Real short interest and days to cover come from Finnhub or similar.
      </div>
      <ShortInterestContent />
    </div>
  );
}

function ShortInterestContent() {
  // TODO: Replace with Short Interest API
  // Endpoint: Finnhub GET /stock/short-interest?symbol= or similar (short interest, days to cover)
  // When: before launch
  const rows = [
    { rank: 1, ticker: "GME", company: "GameStop", shortPct: 22.5, floatShorted: 18, daysToCover: 4.2, change: 2.1, squeezeScore: 8 },
    { rank: 2, ticker: "AMC", company: "AMC Entertainment", shortPct: 19.2, floatShorted: 15, daysToCover: 3.1, change: -0.5, squeezeScore: 6 },
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-zinc-400">
        <p className="font-medium text-white mb-2">What is Days to Cover?</p>
        <p className="mb-3">Days to cover = (shares sold short) ÷ (average daily volume). It estimates how many trading days it would take for all short sellers to close their positions. Higher values can mean more squeeze risk if the price rises.</p>
        <p className="font-medium text-white mb-2">How is Squeeze Score graded?</p>
        <p>Squeeze score (1–10) combines short interest %, days to cover, and recent price momentum. Higher = more potential for a short squeeze. It is illustrative, not a guarantee.</p>
      </div>
      <div className="rounded-lg border-2 border-red-500/50 bg-red-500/10 p-4">
        <p className="text-sm font-semibold text-red-400">🚨 Highest Squeeze Potential: GME</p>
        <p className="text-xs text-zinc-400 mt-1">Short Interest 22.5% · Days to cover 4.2 · Squeeze Score 8/10</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="p-2 font-medium text-zinc-400">Rank</th>
              <th className="p-2 font-medium text-zinc-400">Ticker</th>
              <th className="p-2 font-medium text-zinc-400">Company</th>
              <th className="p-2 font-medium text-zinc-400">Short %</th>
              <th className="p-2 font-medium text-zinc-400">Float Shorted</th>
              <th className="p-2 font-medium text-zinc-400">Days to Cover</th>
              <th className="p-2 font-medium text-zinc-400">Squeeze Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`border-b border-white/5 ${i % 2 ? "bg-white/[0.02]" : ""}`}>
                <td className="p-2 text-zinc-300">{r.rank}</td>
                <td className="p-2 font-medium text-white">{r.ticker}</td>
                <td className="p-2 text-zinc-300">{r.company}</td>
                <td className="p-2 text-red-400">{r.shortPct}%</td>
                <td className="p-2 text-zinc-300">{r.floatShorted}%</td>
                <td className="p-2 text-zinc-300">{r.daysToCover}</td>
                <td className="p-2 text-zinc-300">{r.squeezeScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tool 8: Fed Dashboard ──────────────────────────────────────────────────
function FedDashboardView() {
  const [fred, setFred] = useState<{ current: number; lastChanged: string; history: { date: string; value: number }[]; balanceSheet: number; balanceSheetPeak: number } | null>(null);
  const [hoverPoint, setHoverPoint] = useState<{ date: string; value: number; x: number; y: number } | null>(null);
  useEffect(() => {
    fetch("/api/datahub/fred").then((r) => r.json()).then(setFred).catch(() => setFred({ current: 4.5, lastChanged: "2024-09-18", history: [], balanceSheet: 7.2, balanceSheetPeak: 8.9 }));
  }, []);

  const history = fred?.history ?? [];
  const maxRate = Math.max(6, ...history.map((h) => h.value), 1);
  const chartW = 900;
  const chartH = 320;
  const pad = { left: 44, right: 24, top: 16, bottom: 32 };
  const innerW = chartW - pad.left - pad.right;
  const innerH = chartH - pad.top - pad.bottom;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-white/10 bg-white/5 p-6">
        <h3 className="text-sm font-medium text-zinc-500">CURRENT RATES</h3>
        <p className="mt-2 text-4xl font-bold text-white">{fred?.current ?? 4.5}%</p>
        <p className="text-sm text-zinc-400">Fed Funds Rate · Last changed: {fred?.lastChanged ?? "2024-09-18"}</p>
        <p className="mt-2 text-sm text-zinc-400">Next meeting: March 19, 2025 — 6 days away</p>
        <p className="text-sm text-zinc-400">Expected move: 78% chance of 25bp cut (CME FedWatch)</p>
      </section>
      <section className="rounded-lg border border-white/10 p-4">
        <h3 className="text-sm font-medium text-zinc-500">RATE HISTORY</h3>
        <p className="text-xs text-zinc-500 mt-1">Hover over the line to see date and rate.</p>
        <div className="mt-4 flex items-center gap-2">
          <div className="rounded bg-black/20 relative w-full" style={{ maxWidth: 900, height: 320 }}>
            {history.length ? (
              <>
                <svg width={chartW} height={chartH} className="overflow-visible">
                  <defs>
                    <linearGradient id="fredLine" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent-color,#22c55e)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--accent-color,#22c55e)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  {/* Y axis labels */}
                  {[0, 1, 2, 3, 4, 5, 6].filter((v) => v <= maxRate).map((v) => (
                    <text key={v} x={pad.left - 8} y={pad.top + innerH - (v / maxRate) * innerH} textAnchor="end" className="fill-zinc-500 text-[10px]" fontSize={10}>{v}%</text>
                  ))}
                  {/* X axis label (year range) */}
                  {history.length > 0 && (
                    <>
                      <text x={pad.left} y={chartH - 8} className="fill-zinc-500 text-[10px]" fontSize={10}>{history[0]?.date?.slice(0, 4) ?? ""}</text>
                      <text x={pad.left + innerW} y={chartH - 8} textAnchor="end" className="fill-zinc-500 text-[10px]" fontSize={10}>{history[history.length - 1]?.date?.slice(0, 4) ?? ""}</text>
                    </>
                  )}
                  {/* Line */}
                  <path
                    d={history
                      .map((h, i) => {
                        const x = pad.left + (i / Math.max(1, history.length - 1)) * innerW;
                        const y = pad.top + innerH - (h.value / maxRate) * innerH;
                        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
                      })
                      .join(" ")}
                    fill="none"
                    stroke="var(--accent-color,#22c55e)"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  {/* Invisible hover segments */}
                  {history.map((h, i) => {
                    const x = pad.left + (i / Math.max(1, history.length - 1)) * innerW;
                    const y = pad.top + innerH - (h.value / maxRate) * innerH;
                    const w = Math.max(4, innerW / history.length);
                    return (
                      <rect
                        key={i}
                        x={x - w / 2}
                        y={pad.top}
                        width={w}
                        height={innerH}
                        fill="transparent"
                        onMouseEnter={() => setHoverPoint({ date: h.date, value: h.value, x: x + 8, y: y })}
                        onMouseLeave={() => setHoverPoint(null)}
                      />
                    );
                  })}
                </svg>
                {hoverPoint && (
                  <div className="pointer-events-none absolute rounded bg-[#0F1520] border border-white/20 px-2 py-1 text-xs text-white shadow-lg" style={{ left: hoverPoint.x, top: hoverPoint.y, transform: "translate(0,-50%)" }}>
                    {hoverPoint.date}: {hoverPoint.value}%
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-zinc-500 text-sm">Loading...</div>
            )}
          </div>
          <div className="flex flex-col gap-1 text-[10px] text-zinc-500">
            <span>Y: Rate %</span>
            <span>X: Year</span>
          </div>
        </div>
      </section>
      <section className="rounded-lg border border-white/10 p-4">
        <h3 className="text-sm font-medium text-zinc-500">BALANCE SHEET</h3>
        <p className="mt-2 text-2xl font-bold text-white">${fred?.balanceSheet ?? 7.2} trillion</p>
        <p className="text-xs text-zinc-500">Peak: $8.9T (June 2022)</p>
        <div className="mt-2 h-4 w-full rounded-full bg-white/10">
          <div className="h-full rounded-full bg-blue-500/60" style={{ width: `${((fred?.balanceSheet ?? 7.2) / 8.9) * 100}%` }} />
        </div>
        <p className="mt-3 text-xs text-zinc-400">The Fed’s balance sheet is the total assets held by the Federal Reserve (mainly Treasury and mortgage-backed securities). When the Fed buys bonds (QE), the balance sheet grows; when it runs off or sells (QT), it shrinks. Size affects liquidity and long-term rates.</p>
      </section>
      <section className="rounded-lg border border-white/10 p-4">
        <h3 className="text-sm font-medium text-zinc-500">DOT PLOT (Latest projections)</h3>
        <p className="mt-2 text-xs text-zinc-400">End 2024: 4.25% · End 2025: 3.75% · End 2026: 3.25%</p>
      </section>
    </div>
  );
}

// ─── Tools 9–11: Placeholders ───────────────────────────────────────────────
// TODO: Replace with Earnings Whisper API
// Endpoint: Earnings Whispers (earningswhisper.com) or similar (whisper numbers, implied move, beat rates)
// When: before launch
function EarningsWhisperView() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
        This tool uses sample data. Real whisper numbers and implied move require earnings data providers.
      </div>
      <p className="text-zinc-400">Earnings whisper data — sample.</p>
      <div className="rounded-lg border border-white/10 p-4">
        <p className="text-sm text-zinc-500">Company | Official EPS Est | Whisper # | Difference | Historical Beat Rate % | Avg Post-Earnings Move %</p>
      </div>
    </div>
  );
}

// TODO: Replace with Congress Trades API
// Endpoint: Quiver Quant https://www.quiverquant.com/ (congress trades) or Capitol Trades / Senate/House disclosure APIs
// When: before launch
function CongressTradesView() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
        This tool uses sample data. Real politician trades come from disclosure databases (e.g. Capitol Trades, QuiverQuant).
      </div>
      <p className="text-zinc-400">Congress trades — sample.</p>
      <div className="rounded-lg border border-white/10 p-4">
        <p className="text-sm text-zinc-500">Date | Politician | Party | Chamber | Ticker | Company | Transaction | Amount Range</p>
      </div>
    </div>
  );
}

// TODO: Replace with Dark Pool / Block Trades API
// Endpoint: Unusual Whales or similar (dark pool volume, block trades, smart money flow)
// When: before launch
function DarkPoolView() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
        This tool uses sample data. Real dark pool and block trade data require institutional/tape data sources.
      </div>
      <p className="text-zinc-400">Dark pool block trades — sample.</p>
      <div className="rounded-lg border border-white/10 p-4">
        <p className="text-sm text-zinc-500">Time | Ticker | Price | Size | Dark Pool % | Equantivtrade | Smart Money Signal</p>
      </div>
    </div>
  );
}

// ─── Tool 12: Crypto Dashboard ─────────────────────────────────────────────
function CryptoDashboardView() {
  const [crypto, setCrypto] = useState<{ dominance: number; top10: Array<{ rank: number; name: string; symbol: string; price: number; change24h: number; change7d: number; marketCap: number; volume: number }> } | null>(null);
  const [fng, setFng] = useState<{ value: number; label: string } | null>(null);
  const [memecoins, setMemecoins] = useState<Array<{ rank: number; name: string; symbol: string; price: number; change24h: number; change7d: number; marketCap: number; volume: number }>>([]);

  const fetchCrypto = useCallback(() => {
    Promise.all([
      fetch("/api/datahub/crypto").then((r) => r.json()),
      fetch("/api/datahub/crypto-fng").then((r) => r.json()),
      fetch("/api/datahub/memecoins").then((r) => r.json()),
    ])
      .then(([c, f, m]) => {
        setCrypto(c);
        setFng(f);
        setMemecoins(m.memecoins ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchCrypto();
    const t = setInterval(fetchCrypto, 60000);
    return () => clearInterval(t);
  }, [fetchCrypto]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-400">Live data from CoinGecko and alternative.me. 24h and 7d % are real; table refreshes every 60 seconds.</p>
      <section className="rounded-lg border border-white/10 p-4">
        <h3 className="text-sm font-medium text-zinc-500">BTC DOMINANCE</h3>
        <p className="mt-2 text-4xl font-bold text-white">{crypto?.dominance ?? 52}%</p>
      </section>
      <section className="rounded-lg border border-white/10 overflow-x-auto">
        <h3 className="border-b border-white/10 bg-white/5 p-2 text-sm font-medium text-zinc-400">TOP 10 CRYPTO</h3>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="p-2 font-medium text-zinc-400">Rank</th>
              <th className="p-2 font-medium text-zinc-400">Name</th>
              <th className="p-2 font-medium text-zinc-400">Price</th>
              <th className="p-2 font-medium text-zinc-400">24h %</th>
              <th className="p-2 font-medium text-zinc-400">7d %</th>
              <th className="p-2 font-medium text-zinc-400">Market Cap</th>
            </tr>
          </thead>
          <tbody>
            {(crypto?.top10 ?? []).map((c) => (
              <tr key={c.symbol} className="border-b border-white/5">
                <td className="p-2 text-zinc-300">{c.rank}</td>
                <td className="p-2 font-medium text-white">{c.name}</td>
                <td className="p-2 text-zinc-300">${c.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td className={`p-2 font-medium ${c.change24h >= 0 ? "text-emerald-400" : "text-red-400"}`}>{c.change24h >= 0 ? "+" : ""}{c.change24h.toFixed(2)}%</td>
                <td className={`p-2 ${c.change7d >= 0 ? "text-emerald-400" : "text-red-400"}`}>{c.change7d >= 0 ? "+" : ""}{(c.change7d ?? 0).toFixed(2)}%</td>
                <td className="p-2 text-zinc-400">${(c.marketCap / 1e9).toFixed(2)}B</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="rounded-lg border border-white/10 p-4">
        <h3 className="text-sm font-medium text-zinc-500">CRYPTO FEAR & GREED</h3>
        <p className="mt-2 text-2xl font-bold text-white">{fng?.value ?? 55}</p>
        <p className="text-sm text-zinc-400">{fng?.label ?? "Greed"}</p>
      </section>
      <section className="rounded-lg border border-white/10 overflow-x-auto">
        <h3 className="border-b border-white/10 bg-white/5 p-2 text-sm font-medium text-zinc-400">TOP MEMECOIN DASHBOARD</h3>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="p-2 font-medium text-zinc-400">Rank</th>
              <th className="p-2 font-medium text-zinc-400">Name</th>
              <th className="p-2 font-medium text-zinc-400">Price</th>
              <th className="p-2 font-medium text-zinc-400">24h %</th>
              <th className="p-2 font-medium text-zinc-400">7d %</th>
              <th className="p-2 font-medium text-zinc-400">Market Cap</th>
            </tr>
          </thead>
          <tbody>
            {memecoins.map((c) => (
              <tr key={c.symbol} className="border-b border-white/5">
                <td className="p-2 text-zinc-300">{c.rank}</td>
                <td className="p-2 font-medium text-white">{c.name}</td>
                <td className="p-2 text-zinc-300">${c.price.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                <td className={`p-2 font-medium ${c.change24h >= 0 ? "text-emerald-400" : "text-red-400"}`}>{c.change24h >= 0 ? "+" : ""}{c.change24h.toFixed(2)}%</td>
                <td className={`p-2 ${c.change7d >= 0 ? "text-emerald-400" : "text-red-400"}`}>{c.change7d >= 0 ? "+" : ""}{(c.change7d ?? 0).toFixed(2)}%</td>
                <td className="p-2 text-zinc-400">${(c.marketCap / 1e9).toFixed(2)}B</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="rounded-lg border border-white/10 p-4">
        <h3 className="text-sm font-medium text-zinc-500">STABLECOIN FLOWS</h3>
        <p className="mt-2 text-zinc-300">What is a stablecoin? A stablecoin is a cryptocurrency pegged to a stable asset (usually the US dollar, e.g. USDT, USDC). Traders use them to move in and out of crypto without leaving the ecosystem. Total stablecoin market cap is ~$150B; when stablecoin supply grows (inflows), it often signals dry powder for buying and can be a bullish signal.</p>
      </section>
    </div>
  );
}
