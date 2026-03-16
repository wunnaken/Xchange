import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const SECTOR_ETFS: { symbol: string; name: string }[] = [
  { symbol: "XLK", name: "Technology" },
  { symbol: "XLF", name: "Financials" },
  { symbol: "XLV", name: "Healthcare" },
  { symbol: "XLE", name: "Energy" },
  { symbol: "XLY", name: "Consumer Discretionary" },
  { symbol: "XLP", name: "Consumer Staples" },
  { symbol: "XLI", name: "Industrials" },
  { symbol: "XLB", name: "Materials" },
  { symbol: "XLRE", name: "Real Estate" },
  { symbol: "XLU", name: "Utilities" },
  { symbol: "XLC", name: "Communications" },
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") ?? "1D";
  const token = process.env.FINNHUB_API_KEY;

  if (!token) {
    return NextResponse.json({ sectors: [], range });
  }

  const now = Math.floor(Date.now() / 1000);
  const day = 86400;
  let from = now - day;
  if (range === "1W") from = now - 7 * day;
  else if (range === "1M") from = now - 30 * day;
  else if (range === "YTD") {
    const y = new Date().getFullYear();
    from = Math.floor(new Date(y, 0, 1).getTime() / 1000);
  }

  const results: { symbol: string; name: string; changePercent: number; price?: number }[] = [];

  if (range === "1D") {
    await Promise.all(
      SECTOR_ETFS.map(async (s) => {
        try {
          const res = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${s.symbol}&token=${token}`,
            { next: { revalidate: 60 } }
          );
          const q = (await res.json()) as { dp?: number; c?: number };
          results.push({
            symbol: s.symbol,
            name: s.name,
            changePercent: q.dp ?? 0,
            price: q.c,
          });
        } catch {
          results.push({ ...s, changePercent: 0 });
        }
      })
    );
  } else {
    await Promise.all(
      SECTOR_ETFS.map(async (s) => {
        try {
          const res = await fetch(
            `https://finnhub.io/api/v1/stock/candle?symbol=${s.symbol}&resolution=D&from=${from}&to=${now}&token=${token}`,
            { next: { revalidate: 300 } }
          );
          const c = (await res.json()) as { c?: number[]; o?: number[] };
          const closes = c.c ?? [];
          const opens = c.o ?? [];
          const firstOpen = opens[0];
          const lastClose = closes[closes.length - 1];
          let changePercent = 0;
          if (firstOpen != null && lastClose != null && firstOpen > 0) {
            changePercent = ((lastClose - firstOpen) / firstOpen) * 100;
          }
          results.push({
            symbol: s.symbol,
            name: s.name,
            changePercent,
            price: lastClose,
          });
        } catch {
          results.push({ ...s, changePercent: 0 });
        }
      })
    );
  }

  return NextResponse.json({ sectors: results, range });
}
