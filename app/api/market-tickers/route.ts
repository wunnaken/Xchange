import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TickerRow = {
  id: string;
  name: string;
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  source: "live" | "mock";
};

const TICKER_ORDER = ["spy", "qqq", "btc", "eth", "gld", "oil", "dxy", "eurusd"] as const;

const MOCK_TICKERS: TickerRow[] = [
  { id: "spy", name: "S&P 500", symbol: "SPY", price: 5850, change: 42.5, changePercent: 0.73, source: "mock" },
  { id: "qqq", name: "Nasdaq", symbol: "QQQ", price: 5250, change: -18.2, changePercent: -0.35, source: "mock" },
  { id: "btc", name: "Bitcoin", symbol: "BTC", price: 97200, change: 1200, changePercent: 1.25, source: "mock" },
  { id: "eth", name: "Ethereum", symbol: "ETH", price: 3450, change: -22, changePercent: -0.63, source: "mock" },
  { id: "gld", name: "Gold", symbol: "GLD", price: 265, change: 1.2, changePercent: 0.47, source: "mock" },
  { id: "oil", name: "Oil", symbol: "OIL", price: 78.2, change: -1.1, changePercent: -1.39, source: "mock" },
  { id: "dxy", name: "Dollar Index", symbol: "DXY", price: 104.2, change: 0.15, changePercent: 0.14, source: "mock" },
  { id: "eurusd", name: "EUR/USD", symbol: "EURUSD", price: 1.085, change: -0.002, changePercent: -0.18, source: "mock" },
];

async function fetchFinnhubQuote(symbol: string, token: string): Promise<{ c: number; d: number; dp: number } | null> {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`,
      { next: { revalidate: 0 } }
    );
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 10000));
      const retry = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`,
        { next: { revalidate: 0 } }
      );
      if (!retry.ok) return null;
      const data = await retry.json();
      if (data.c == null || data.d == null || data.dp == null) return null;
      return { c: data.c, d: data.d, dp: data.dp };
    }
    if (!res.ok) return null;
    const data = await res.json();
    if (data.c == null || data.d == null || data.dp == null) return null;
    return { c: data.c, d: data.d, dp: data.dp };
  } catch {
    return null;
  }
}

async function fetchCryptoFromCoinGecko(ids: string): Promise<{ [id: string]: { price: number; changePercent: number } } | null> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const out: { [id: string]: { price: number; changePercent: number } } = {};
    for (const id of ids.split(",")) {
      const c = data?.[id];
      if (c?.usd != null) out[id] = { price: c.usd, changePercent: c.usd_24h_change ?? 0 };
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

const API_TIMEOUT_MS = 5000;

const SYMBOL_NAMES: Record<string, string> = {
  SPY: "S&P 500", QQQ: "Nasdaq", BTC: "Bitcoin", ETH: "Ethereum", GLD: "Gold",
  OIL: "Oil", USO: "Oil", DXY: "Dollar Index", EURUSD: "EUR/USD",
};

async function fetchCustomTickers(symbols: string[], token: string | undefined): Promise<TickerRow[]> {
  const normalized = symbols.slice(0, 8).map((s) => s.toUpperCase().trim()).filter(Boolean);
  if (normalized.length === 0) return [];
  const tickers: TickerRow[] = [];
  const crypto = normalized.filter((s) => s === "BTC" || s === "ETH");
  const stocks = normalized.filter((s) => s !== "BTC" && s !== "ETH");
  if (token && stocks.length > 0) {
    const finnhubSymbol = (s: string) => (s === "EURUSD" ? "OANDA:EUR_USD" : s);
    const results = await Promise.all(stocks.map((sym) => fetchFinnhubQuote(finnhubSymbol(sym), token)));
    results.forEach((q, i) => {
      if (q && stocks[i]) {
        const sym = stocks[i];
        const id = sym.toLowerCase().replace(/[^a-z0-9]/g, "");
        tickers.push({
          id: id || sym.toLowerCase(),
          name: SYMBOL_NAMES[sym] ?? sym,
          symbol: sym,
          price: q.c,
          change: q.d,
          changePercent: q.dp,
          source: "live",
        });
      }
    });
  }
  if (crypto.length > 0) {
    const ids = crypto.map((s) => (s === "BTC" ? "bitcoin" : "ethereum")).join(",");
    const cg = await fetchCryptoFromCoinGecko(ids);
    if (cg?.bitcoin) tickers.push({ id: "btc", name: "Bitcoin", symbol: "BTC", price: cg.bitcoin.price, change: (cg.bitcoin.price * cg.bitcoin.changePercent) / 100, changePercent: cg.bitcoin.changePercent, source: "live" });
    if (cg?.ethereum) tickers.push({ id: "eth", name: "Ethereum", symbol: "ETH", price: cg.ethereum.price, change: (cg.ethereum.price * cg.ethereum.changePercent) / 100, changePercent: cg.ethereum.changePercent, source: "live" });
  }
  const order = normalized.map((s) => tickers.find((t) => t.symbol.toUpperCase() === s)).filter(Boolean) as TickerRow[];
  return order.length > 0 ? order : tickers;
}

async function fetchTickersWithTimeout(): Promise<TickerRow[]> {
  const finnhubKey = process.env.FINNHUB_API_KEY;
  const tickers: TickerRow[] = [];

  if (finnhubKey) {
    const [spy, qqq, gld, uso, dxy, eurusd] = await Promise.all([
      fetchFinnhubQuote("SPY", finnhubKey),
      fetchFinnhubQuote("QQQ", finnhubKey),
      fetchFinnhubQuote("GLD", finnhubKey),
      fetchFinnhubQuote("USO", finnhubKey),
      fetchFinnhubQuote("DXY", finnhubKey),
      fetchFinnhubQuote("OANDA:EUR_USD", finnhubKey),
    ]);
    if (spy) tickers.push({ id: "spy", name: "S&P 500", symbol: "SPY", price: spy.c, change: spy.d, changePercent: spy.dp, source: "live" });
    if (qqq) tickers.push({ id: "qqq", name: "Nasdaq", symbol: "QQQ", price: qqq.c, change: qqq.d, changePercent: qqq.dp, source: "live" });
    if (gld) tickers.push({ id: "gld", name: "Gold", symbol: "GLD", price: gld.c, change: gld.d, changePercent: gld.dp, source: "live" });
    if (uso) tickers.push({ id: "oil", name: "Oil", symbol: "OIL", price: uso.c, change: uso.d, changePercent: uso.dp, source: "live" });
    if (dxy) tickers.push({ id: "dxy", name: "Dollar Index", symbol: "DXY", price: dxy.c, change: dxy.d, changePercent: dxy.dp, source: "live" });
    if (eurusd) tickers.push({ id: "eurusd", name: "EUR/USD", symbol: "EURUSD", price: eurusd.c, change: eurusd.d, changePercent: eurusd.dp, source: "live" });
  }

  const crypto = await fetchCryptoFromCoinGecko("bitcoin,ethereum");
  if (crypto?.bitcoin) {
    const b = crypto.bitcoin;
    tickers.push({ id: "btc", name: "Bitcoin", symbol: "BTC", price: b.price, change: (b.price * b.changePercent) / 100, changePercent: b.changePercent, source: "live" });
  }
  if (crypto?.ethereum) {
    const e = crypto.ethereum;
    tickers.push({ id: "eth", name: "Ethereum", symbol: "ETH", price: e.price, change: (e.price * e.changePercent) / 100, changePercent: e.changePercent, source: "live" });
  }

  const ordered = TICKER_ORDER.map((id) => tickers.find((t) => t.id === id) ?? MOCK_TICKERS.find((t) => t.id === id)).filter(Boolean) as TickerRow[];
  return ordered.length >= 8 ? ordered : ordered.length > 0 ? ordered : MOCK_TICKERS;
}

export async function GET(request: NextRequest) {
  const symbolsParam = request.nextUrl.searchParams.get("symbols");
  const customSymbols = symbolsParam ? symbolsParam.split(",").map((s) => s.trim()).filter(Boolean) : null;

  if (customSymbols && customSymbols.length > 0) {
    try {
      const token = process.env.FINNHUB_API_KEY;
      const result = await Promise.race([
        fetchCustomTickers(customSymbols, token ?? undefined),
        new Promise<TickerRow[]>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), API_TIMEOUT_MS)
        ),
      ]);
      const out = result.slice(0, 8);
      return NextResponse.json(out.length > 0 ? out : MOCK_TICKERS.slice(0, 8));
    } catch {
      return NextResponse.json(MOCK_TICKERS.slice(0, 8));
    }
  }

  try {
    const result = await Promise.race([
      fetchTickersWithTimeout(),
      new Promise<TickerRow[]>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), API_TIMEOUT_MS)
      ),
    ]);
    return NextResponse.json(result.slice(0, 8));
  } catch {
    return NextResponse.json(MOCK_TICKERS.slice(0, 8));
  }
}
