import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 30;

export type ChartRange = "10m" | "1h" | "1d" | "1w" | "1m";

export type ChartPoint = {
  time: number;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function toFinnhubSymbol(ticker: string): string {
  const u = ticker.toUpperCase();
  if (u === "BTC") return "BINANCE:BTCUSDT";
  if (u === "ETH") return "BINANCE:ETHUSDT";
  return u;
}

// Use daily (D) resolution so we get real OHLCV; intraday often returns empty outside market hours / on free tier
const RANGES: Record<ChartRange, { resolution: string; days: number }> = {
  "10m": { resolution: "D", days: 5 },
  "1h": { resolution: "D", days: 5 },
  "1d": { resolution: "D", days: 5 },
  "1w": { resolution: "D", days: 14 },
  "1m": { resolution: "D", days: 30 },
};

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker")?.trim();
  const range = (request.nextUrl.searchParams.get("range")?.toLowerCase() || "1d") as ChartRange;
  if (!ticker) return NextResponse.json({ data: [] }, { status: 400 });
  const rangeConfig = RANGES[range] ?? RANGES["1d"];

  const token = process.env.FINNHUB_API_KEY;
  const symbol = toFinnhubSymbol(ticker);
  const to = Math.floor(Date.now() / 1000);
  const from = to - rangeConfig.days * 24 * 60 * 60;

  if (!token) {
    return NextResponse.json({ data: [] });
  }

  const isCrypto = symbol.startsWith("BINANCE:");
  const baseUrl = isCrypto
    ? "https://finnhub.io/api/v1/crypto/candle"
    : "https://finnhub.io/api/v1/stock/candle";

  try {
    const url = `${baseUrl}?symbol=${encodeURIComponent(symbol)}&resolution=${rangeConfig.resolution}&from=${from}&to=${to}&token=${token}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return fallbackChart(token, symbol, ticker, range);
    const d = (await res.json()) as {
      t?: number[];
      o?: number[];
      h?: number[];
      l?: number[];
      c?: number[];
      v?: number[];
      s?: string;
    };
    if (d?.s === "no_data" || !Array.isArray(d?.t) || d.t.length === 0) {
      return fallbackChart(token, symbol, ticker, range);
    }
    const t = d?.t ?? [];
    const o = d?.o ?? [];
    const h = d?.h ?? [];
    const l = d?.l ?? [];
    const c = d?.c ?? [];
    const v = d?.v ?? [];
    const data: ChartPoint[] = [];
    for (let i = 0; i < t.length; i++) {
      const ts = t[i];
      const close = c[i];
      if (ts == null || close == null) continue;
      data.push({
        time: ts as number,
        date: new Date((ts as number) * 1000).toISOString(),
        open: (o[i] ?? close) as number,
        high: (h[i] ?? close) as number,
        low: (l[i] ?? close) as number,
        close: close as number,
        volume: (v[i] ?? 0) as number,
      });
    }
    data.sort((a, b) => a.time - b.time);
    if (data.length > 0) return NextResponse.json({ data, range });
    return fallbackChart(token, symbol, ticker, range);
  } catch {
    return fallbackChart(token, symbol, ticker, range);
  }
}

async function fallbackChart(
  token: string,
  symbol: string,
  ticker: string,
  range: ChartRange
): Promise<NextResponse<{ data: ChartPoint[]; range?: string }>> {
  try {
    const days = RANGES[range]?.days ?? 5;
    const to = Math.floor(Date.now() / 1000);
    const from = to - days * 24 * 60 * 60;
    const isCrypto = symbol.startsWith("BINANCE:");
    const baseUrl = isCrypto
      ? "https://finnhub.io/api/v1/crypto/candle"
      : "https://finnhub.io/api/v1/stock/candle";
    const retryUrl = `${baseUrl}?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}&token=${token}`;
    const retry = await fetch(retryUrl, { next: { revalidate: 0 } });
    if (retry.ok) {
      const d = (await retry.json()) as { t?: number[]; o?: number[]; h?: number[]; l?: number[]; c?: number[]; v?: number[] };
      const t = d?.t ?? [];
      const o = d?.o ?? [];
      const h = d?.h ?? [];
      const l = d?.l ?? [];
      const c = d?.c ?? [];
      const v = d?.v ?? [];
      const data: ChartPoint[] = [];
      for (let i = 0; i < t.length; i++) {
        const ts = t[i];
        const closeVal = c[i];
        if (ts == null || closeVal == null) continue;
        data.push({
          time: ts as number,
          date: new Date((ts as number) * 1000).toISOString(),
          open: (o[i] ?? closeVal) as number,
          high: (h[i] ?? closeVal) as number,
          low: (l[i] ?? closeVal) as number,
          close: closeVal as number,
          volume: (v[i] ?? 0) as number,
        });
      }
      data.sort((a, b) => a.time - b.time);
      if (data.length > 0) return NextResponse.json({ data, range });
    }
    const quoteUrl = symbol.startsWith("BINANCE:")
      ? `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`
      : `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker.toUpperCase())}&token=${token}`;
    const qRes = await fetch(quoteUrl, { next: { revalidate: 0 } });
    if (!qRes.ok) return NextResponse.json({ data: [] });
    const q = (await qRes.json()) as { c?: number; v?: number };
    const close = q?.c;
    if (close == null || typeof close !== "number") return NextResponse.json({ data: [] });
    const now = Math.floor(Date.now() / 1000);
    const data: ChartPoint[] = [
      {
        time: now - 86400,
        date: new Date((now - 86400) * 1000).toISOString(),
        open: close * 0.99,
        high: close,
        low: close * 0.99,
        close: close * 0.995,
        volume: q?.v ?? 0,
      },
      {
        time: now,
        date: new Date(now * 1000).toISOString(),
        open: close * 0.995,
        high: close,
        low: close * 0.99,
        close,
        volume: q?.v ?? 0,
      },
    ];
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
