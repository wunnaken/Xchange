import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type TickerQuote = {
  price: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  high: number | null;
  low: number | null;
  open: number | null;
  previousClose: number | null;
};

async function fetchFinnhubQuote(symbol: string, token: string): Promise<TickerQuote | null> {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { c?: number; d?: number; dp?: number; h?: number; l?: number; o?: number; pc?: number; v?: number };
    if (data.c == null) return null;
    const price = data.c;
    const previousClose = data.pc ?? null;
    const change = data.d != null ? data.d : (previousClose != null ? price - previousClose : null);
    const changePercent = data.dp != null ? data.dp : (previousClose != null && previousClose !== 0 ? ((price - previousClose) / previousClose) * 100 : null);
    return {
      price,
      change,
      changePercent,
      volume: data.v ?? null,
      high: data.h ?? null,
      low: data.l ?? null,
      open: data.o ?? null,
      previousClose,
    };
  } catch {
    return null;
  }
}

const COINGECKO_CRYPTO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  BITCOIN: "bitcoin",
  ETHEREUM: "ethereum",
};

/** Crypto: CoinGecko returns rolling 24h change. TradingView shows "day" change (previous session close). Values will differ. */
async function fetchCryptoQuote(ticker: string): Promise<TickerQuote | null> {
  const id = COINGECKO_CRYPTO_IDS[ticker.toUpperCase()] ?? null;
  if (!id) return null;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const c = data?.[id];
    if (c?.usd == null) return null;
    const changePercent = c.usd_24h_change ?? 0;
    const change = (c.usd * changePercent) / 100;
    const previousClose = c.usd - change;
    return {
      price: c.usd,
      change,
      changePercent,
      volume: c.usd_24h_vol ?? null,
      high: null,
      low: null,
      open: null,
      previousClose: Number.isFinite(previousClose) ? previousClose : c.usd,
    };
  } catch {
    return null;
  }
}

/** Map display symbols to Finnhub API symbols (forex/commodities). */
function toFinnhubSymbol(ticker: string): string {
  const u = ticker.toUpperCase().trim();
  if (u === "EURUSD") return "OANDA:EUR_USD";
  if (u === "OIL") return "USO";
  return u;
}

function fallbackQuote(ticker: string): TickerQuote | null {
  switch (ticker.toUpperCase().trim()) {
    case "DXY":
      return {
        price: 104.2,
        change: 0.15,
        changePercent: 0.14,
        volume: null,
        high: null,
        low: null,
        open: null,
        previousClose: 104.05,
      };
    case "EURUSD":
      return {
        price: 1.085,
        change: -0.002,
        changePercent: -0.18,
        volume: null,
        high: null,
        low: null,
        open: null,
        previousClose: 1.087,
      };
    default:
      return null;
  }
}

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker")?.trim().toUpperCase();
  if (!ticker) {
    return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
  }
  // Crypto: only use CoinGecko (id "bitcoin" / "ethereum"). Never fall back to Finnhub —
  // Finnhub's "BTC" is a different asset (~$32); we must show real Bitcoin (~$75k).
  if (COINGECKO_CRYPTO_IDS[ticker] !== undefined) {
    const crypto = await fetchCryptoQuote(ticker);
    if (crypto?.price != null && Number.isFinite(crypto.price) && crypto.price > 0) {
      return NextResponse.json(crypto);
    }
    // CoinGecko often 429/blocks datacenter IPs; Finnhub Binance pairs return real spot (~$3k+ ETH, not wrong "ETH" stock)
    const key = process.env.FINNHUB_API_KEY?.trim();
    if (key) {
      const binanceSym = ticker === "BTC" || ticker === "BITCOIN" ? "BINANCE:BTCUSDT" : "BINANCE:ETHUSDT";
      const finn = await fetchFinnhubQuote(binanceSym, key);
      const p = finn?.price;
      if (finn && typeof p === "number" && Number.isFinite(p) && p > 0) {
        const min = ticker === "BTC" || ticker === "BITCOIN" ? 1000 : 100;
        if (p >= min) return NextResponse.json(finn);
      }
    }
    const empty: TickerQuote = { price: null, change: null, changePercent: null, volume: null, high: null, low: null, open: null, previousClose: null };
    return NextResponse.json(empty);
  }
  const key = process.env.FINNHUB_API_KEY;
  if (key) {
    const finnhubSymbol = toFinnhubSymbol(ticker);
    const quote = await fetchFinnhubQuote(finnhubSymbol, key);
    if (quote) return NextResponse.json(quote);
  }
  const fallback = fallbackQuote(ticker);
  if (fallback) return NextResponse.json(fallback);
  const empty: TickerQuote = { price: null, change: null, changePercent: null, volume: null, high: null, low: null, open: null, previousClose: null };
  return NextResponse.json(empty);
}
