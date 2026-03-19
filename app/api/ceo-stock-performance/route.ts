import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type StockSinceResponse =
  | {
      ok: true;
      ticker: string;
      startDate: string; // ISO date (YYYY-MM-DD)
      startYear: number;
      startPrice: number;
      currentPrice: number;
      percentChange: number;
    }
  | { ok: false; ticker: string; reason: "missing_key" | "unavailable" | "bad_request" };

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { value: StockSinceResponse; expiresAt: number }>();

function toUnixSeconds(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

async function fetchFinnhubProfileIpo(symbol: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(token)}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { ipo?: string | null };
    return typeof data?.ipo === "string" && data.ipo.length >= 10 ? data.ipo.slice(0, 10) : null;
  } catch {
    return null;
  }
}

async function fetchFinnhubQuotePrice(symbol: string, token: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(token)}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { c?: number };
    return typeof data?.c === "number" && Number.isFinite(data.c) && data.c > 0 ? data.c : null;
  } catch {
    return null;
  }
}

async function fetchStartPriceMonthly(symbol: string, token: string, start: Date): Promise<number | null> {
  const from = toUnixSeconds(start);
  const to = toUnixSeconds(new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000));
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=M&from=${from}&to=${to}&token=${encodeURIComponent(token)}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { s?: string; c?: number[] };
    if (data?.s !== "ok") return null;
    const c0 = Array.isArray(data.c) ? data.c.find((x) => typeof x === "number" && Number.isFinite(x) && x > 0) : null;
    return typeof c0 === "number" ? c0 : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker")?.trim().toUpperCase();
  const tenureStartYearRaw = request.nextUrl.searchParams.get("tenureStartYear")?.trim();
  const tenureStartYear = tenureStartYearRaw ? Number(tenureStartYearRaw) : NaN;

  if (!ticker || !Number.isFinite(tenureStartYear) || tenureStartYear < 1900 || tenureStartYear > 2100) {
    const out: StockSinceResponse = { ok: false, ticker: ticker ?? "", reason: "bad_request" };
    return NextResponse.json(out, { status: 400 });
  }

  const cacheKey = `${ticker}:${tenureStartYear}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return NextResponse.json(hit.value);

  const key = process.env.FINNHUB_API_KEY?.trim();
  if (!key) {
    const out: StockSinceResponse = { ok: false, ticker, reason: "missing_key" };
    cache.set(cacheKey, { value: out, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json(out, { status: 503 });
  }

  const ipo = await fetchFinnhubProfileIpo(ticker, key);
  const ipoDate = ipo ? new Date(`${ipo}T00:00:00Z`) : null;
  const ceoStartDate = new Date(`${tenureStartYear}-01-01T00:00:00Z`);
  const startDate = ipoDate && ipoDate > ceoStartDate ? ipoDate : ceoStartDate;

  const [startPrice, currentPrice] = await Promise.all([
    fetchStartPriceMonthly(ticker, key, startDate),
    fetchFinnhubQuotePrice(ticker, key),
  ]);

  if (!startPrice || !currentPrice) {
    const out: StockSinceResponse = { ok: false, ticker, reason: "unavailable" };
    cache.set(cacheKey, { value: out, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json(out);
  }

  const percentChange = ((currentPrice - startPrice) / startPrice) * 100;
  const out: StockSinceResponse = {
    ok: true,
    ticker,
    startDate: startDate.toISOString().slice(0, 10),
    startYear: startDate.getUTCFullYear(),
    startPrice,
    currentPrice,
    percentChange: Math.round(percentChange * 100) / 100,
  };
  cache.set(cacheKey, { value: out, expiresAt: Date.now() + CACHE_TTL_MS });
  return NextResponse.json(out);
}

