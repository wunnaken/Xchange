import { NextRequest, NextResponse } from "next/server";

export const revalidate = 300;

const CRYPTO_TICKERS = new Set(["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE", "AVAX"]);

const COINGECKO_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  AVAX: "avalanche-2",
};

type Timeframe = "1D" | "1W" | "1M" | "1Y";

const TIMEFRAME: Record<
  Timeframe,
  { resolution: string; fromOffsetSec: number; cgDays: number }
> = {
  "1D": { resolution: "5", fromOffsetSec: 24 * 60 * 60, cgDays: 1 },
  "1W": { resolution: "60", fromOffsetSec: 7 * 24 * 60 * 60, cgDays: 7 },
  "1M": { resolution: "D", fromOffsetSec: 30 * 24 * 60 * 60, cgDays: 30 },
  "1Y": { resolution: "W", fromOffsetSec: 365 * 24 * 60 * 60, cgDays: 365 },
};

type PctPoint = { t: number; pct: number };

function formatChartDate(tSec: number, tf: Timeframe): string {
  const d = new Date(tSec * 1000);
  if (tf === "1D" || tf === "1W") return d.toISOString().slice(0, 16);
  return d.toISOString().slice(0, 10);
}

function toPercentFromBase(prices: number[], times: number[]): PctPoint[] {
  if (prices.length === 0 || times.length === 0) return [];
  const base = prices[0];
  if (base == null || !Number.isFinite(base) || base === 0) return [];
  const out: PctPoint[] = [];
  for (let i = 0; i < prices.length; i++) {
    const p = prices[i];
    const t = times[i];
    if (p == null || t == null || !Number.isFinite(p)) continue;
    out.push({ t, pct: ((p - base) / base) * 100 });
  }
  return out;
}

async function fetchFinnhubCandles(
  ticker: string,
  resolution: string,
  from: number,
  to: number,
  token: string,
): Promise<PctPoint[]> {
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(ticker)}&resolution=${resolution}&from=${from}&to=${to}&token=${token}`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) return [];
  const d = (await res.json()) as {
    t?: number[];
    c?: number[];
    s?: string;
  };
  if (d?.s === "no_data" || !Array.isArray(d.t) || !Array.isArray(d.c) || d.t.length === 0) return [];
  return toPercentFromBase(d.c, d.t);
}

async function fetchCoinGeckoSeries(ticker: string, days: number): Promise<PctPoint[]> {
  const id = COINGECKO_ID[ticker.toUpperCase()];
  if (!id) return [];
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) return [];
  const data = (await res.json()) as { prices?: [number, number][] };
  const prices = data?.prices;
  if (!Array.isArray(prices) || prices.length === 0) return [];
  const times = prices.map(([tsMs]) => Math.floor(tsMs / 1000));
  const closes = prices.map(([, px]) => px);
  return toPercentFromBase(closes, times);
}

function pctAtOrBefore(pts: PctPoint[] | undefined, t: number): number | null {
  if (!pts?.length) return null;
  let best: PctPoint | null = null;
  for (const p of pts) {
    if (p.t <= t && (!best || p.t > best.t)) best = p;
  }
  return best?.pct ?? null;
}

function mergeSeries(tickers: string[], byTicker: Record<string, PctPoint[]>, tf: Timeframe) {
  const timesSet = new Set<number>();
  for (const tk of tickers) {
    const pts = byTicker[tk];
    if (pts) for (const p of pts) timesSet.add(p.t);
  }
  const times = [...timesSet].sort((a, b) => a - b);
  if (times.length === 0) {
    return { dates: [] as string[], series: {} as Record<string, (number | null)[]> };
  }
  const dates = times.map((t) => formatChartDate(t, tf));
  const series: Record<string, (number | null)[]> = {};
  for (const tk of tickers) {
    const pts = byTicker[tk];
    series[tk] = times.map((t) => pctAtOrBefore(pts, t));
  }
  const average = times.map((_, i) => {
    const vals = tickers.map((tk) => series[tk][i]).filter((v): v is number => v != null && Number.isFinite(v));
    return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0) / vals.length;
  });
  series.average = average;
  return { dates, series };
}

export async function GET(request: NextRequest) {
  const tickersParam = request.nextUrl.searchParams.get("tickers")?.trim();
  const timeframe = (request.nextUrl.searchParams.get("timeframe")?.toUpperCase() ?? "1M") as Timeframe;
  if (!tickersParam) {
    return NextResponse.json({ error: "Missing tickers", dates: [], series: {} }, { status: 400 });
  }
  if (!TIMEFRAME[timeframe]) {
    return NextResponse.json({ error: "Invalid timeframe", dates: [], series: {} }, { status: 400 });
  }

  const tickers = [...new Set(tickersParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (tickers.length === 0) {
    return NextResponse.json({ dates: [], series: {} });
  }

  const cfg = TIMEFRAME[timeframe];
  const to = Math.floor(Date.now() / 1000);
  const from = to - cfg.fromOffsetSec;
  const token = process.env.FINNHUB_API_KEY?.trim() ?? "";

  const stockTickers = tickers.filter((t) => !CRYPTO_TICKERS.has(t));
  if (stockTickers.length > 0 && !token) {
    return NextResponse.json(
      { error: "FINNHUB_API_KEY not set", dates: [], series: {} },
      { status: 503 },
    );
  }

  const byTicker: Record<string, PctPoint[]> = {};

  await Promise.all(
    tickers.map(async (tk) => {
      if (CRYPTO_TICKERS.has(tk)) {
        byTicker[tk] = await fetchCoinGeckoSeries(tk, cfg.cgDays);
      } else {
        byTicker[tk] = await fetchFinnhubCandles(tk, cfg.resolution, from, to, token);
      }
    }),
  );

  const { dates, series } = mergeSeries(tickers, byTicker, timeframe);

  return NextResponse.json({ dates, series });
}
