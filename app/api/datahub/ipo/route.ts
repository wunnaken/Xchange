import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 86400;

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? dateStr(new Date());
  const to = searchParams.get("to") ?? dateStr(new Date(Date.now() + 90 * 86400 * 1000));
  const token = process.env.FINNHUB_API_KEY;

  if (!token) {
    return NextResponse.json({ ipoCalendar: [], recent: [] });
  }

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/calendar/ipo?from=${from}&to=${to}&token=${token}`,
      { next: { revalidate: 86400 } }
    );
    const data = (await res.json()) as { ipoCalendar?: Array<Record<string, unknown>> };
    const ipoCalendar = (data.ipoCalendar ?? []).map((e: Record<string, unknown>) => ({
      name: e.name ?? "—",
      date: e.date ?? from,
      exchange: e.exchange ?? "—",
      numberOfShares: e.numberOfShares,
      priceRangeLow: e.priceRangeLow,
      priceRangeHigh: e.priceRangeHigh,
      status: e.status ?? "Filed",
    }));
    return NextResponse.json({ ipoCalendar, recent: ipoCalendar.slice(0, 20) });
  } catch (e) {
    console.error("[datahub/ipo]", e);
    return NextResponse.json({ ipoCalendar: [], recent: [] });
  }
}
