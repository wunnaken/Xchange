import { NextResponse } from "next/server";
import type { PredictMarket } from "../markets/route";

export const dynamic = "force-dynamic";

function tokenize(q: string): Set<string> {
  const STOP = new Set(["a", "an", "the", "in", "on", "at", "to", "of", "for", "is", "will", "be", "by", "or", "and", "if", "it", "this", "that", "with", "from", "has", "have", "are", "was", "were"]);
  return new Set(
    q.toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}

function similarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const w of ta) if (tb.has(w)) overlap++;
  return (2 * overlap) / (ta.size + tb.size);
}

export async function GET(req: Request) {
  const base = new URL(req.url).origin;
  let markets: PredictMarket[] = [];
  try {
    const r = await fetch(`${base}/api/predict/markets`, { next: { revalidate: 300 } });
    if (r.ok) {
      const d = await r.json();
      markets = d.markets ?? [];
    }
  } catch { /* fallback to empty */ }

  // ── Over/Under-round detection ──────────────────────────────────────────
  interface OverRound {
    id: string;
    source: string;
    question: string;
    yesPrice: number;
    noPrice: number;
    total: number;
    gap: number;
    type: "over" | "under";
    url: string;
  }

  const roundIssues: OverRound[] = markets
    .filter((m) => {
      const total = m.yesPrice + m.noPrice;
      return total > 102 || total < 98;
    })
    .map((m) => ({
      id: m.id,
      source: m.source,
      question: m.question,
      yesPrice: m.yesPrice,
      noPrice: m.noPrice,
      total: m.yesPrice + m.noPrice,
      gap: Math.abs(100 - (m.yesPrice + m.noPrice)),
      type: (m.yesPrice + m.noPrice < 100 ? "under" : "over") as "under" | "over",
      url: m.url,
    }))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 10);

  // ── Cross-platform arbitrage ─────────────────────────────────────────────
  interface ArbOpp {
    question: string;
    sourceA: string;
    priceA: number;
    urlA: string;
    sourceB: string;
    priceB: number;
    urlB: string;
    spread: number;
    totalCost: number;
    potentialProfit: number;
  }

  const opportunities: ArbOpp[] = [];
  const sources = ["polymarket", "kalshi", "manifold", "predictit"] as const;

  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const groupA = markets.filter((m) => m.source === sources[i]);
      const groupB = markets.filter((m) => m.source === sources[j]);

      for (const a of groupA) {
        for (const b of groupB) {
          const sim = similarity(a.question, b.question);
          if (sim < 0.45) continue;
          const spread = Math.abs(a.yesPrice - b.yesPrice);
          if (spread < 2) continue;
          // Buy YES on cheaper, NO on more expensive
          const cheaper = a.yesPrice < b.yesPrice ? a : b;
          const dearer = a.yesPrice < b.yesPrice ? b : a;
          const totalCost = cheaper.yesPrice + (100 - dearer.yesPrice);
          const potentialProfit = 100 - totalCost;
          opportunities.push({
            question: a.question.length <= b.question.length ? a.question : b.question,
            sourceA: cheaper.source,
            priceA: cheaper.yesPrice,
            urlA: cheaper.url,
            sourceB: dearer.source,
            priceB: dearer.yesPrice,
            urlB: dearer.url,
            spread,
            totalCost,
            potentialProfit,
          });
        }
      }
    }
  }

  const topOpportunities = opportunities
    .sort((a, b) => b.spread - a.spread)
    .slice(0, 10);

  return NextResponse.json({
    opportunities: topOpportunities,
    roundIssues,
    marketCount: markets.length,
    lastUpdated: new Date().toISOString(),
  });
}
