import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 120;

const MEME_IDS = "dogecoin,shiba-inu,pepe,floki,bonk,dogwifhat,memecoin,worldcoin-wld,arbitrum,optimism";

export async function GET() {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${MEME_IDS}&order=market_cap_desc&per_page=10&price_change_percentage=24h%2C7d`,
      { next: { revalidate: 120 } }
    );
    const list = (await res.json()) as Array<{
      id: string;
      symbol: string;
      name: string;
      current_price: number;
      price_change_percentage_24h?: number;
      price_change_percentage_7d_in_currency?: number;
      market_cap: number;
      total_volume: number;
    }>;
    return NextResponse.json({
      memecoins: list.map((c, i) => ({
        rank: i + 1,
        name: c.name,
        symbol: c.symbol.toUpperCase(),
        price: c.current_price,
        change24h: c.price_change_percentage_24h ?? 0,
        change7d: c.price_change_percentage_7d_in_currency ?? 0,
        marketCap: c.market_cap,
        volume: c.total_volume,
      })),
    });
  } catch (e) {
    console.error("[datahub/memecoins]", e);
    return NextResponse.json({ memecoins: [] });
  }
}
