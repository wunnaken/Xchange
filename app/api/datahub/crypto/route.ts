import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 120;

export async function GET() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=true&price_change_percentage=24h%2C7d",
      { next: { revalidate: 120 } }
    );
    const list = (await res.json()) as Array<{
      id: string;
      symbol: string;
      name: string;
      current_price: number;
      price_change_percentage_24h?: number;
      price_change_percentage_24h_in_currency?: number;
      price_change_percentage_7d_in_currency?: number;
      market_cap: number;
      total_volume: number;
    }>;
    const btc = list.find((c) => c.symbol === "btc");
    const totalMc = list.reduce((s, c) => s + (c.market_cap ?? 0), 0);
    const btcMc = btc?.market_cap ?? 0;
    const dominance = totalMc > 0 ? (btcMc / totalMc) * 100 : 52;

    return NextResponse.json({
      dominance: Math.round(dominance * 10) / 10,
      top10: list.map((c) => ({
        rank: list.indexOf(c) + 1,
        name: c.name,
        symbol: c.symbol.toUpperCase(),
        price: c.current_price,
        change24h: c.price_change_percentage_24h ?? c.price_change_percentage_24h_in_currency ?? 0,
        change7d: c.price_change_percentage_7d_in_currency ?? 0,
        marketCap: c.market_cap,
        volume: c.total_volume,
      })),
    });
  } catch (e) {
    console.error("[datahub/crypto]", e);
    return NextResponse.json({
      dominance: 52,
      top10: [],
    });
  }
}
