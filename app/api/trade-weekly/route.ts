import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

type FredObservation = {
  date: string;
  value: string;
};

type FredResponse = {
  observations?: FredObservation[];
};

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function weeklyChange(current: number | null, previous: number | null): number {
  if (current == null || previous == null || previous === 0) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

async function fetchFredWeeklyPair(seriesId: string, apiKey: string): Promise<{ value: number; prev: number; date: string }> {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    limit: "2",
    sort_order: "desc",
    frequency: "w",
  });
  const res = await fetch(`${FRED_BASE}?${params.toString()}`, {
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return { value: 0, prev: 0, date: new Date().toISOString().slice(0, 10) };
  const data = (await res.json()) as FredResponse;
  const obs = Array.isArray(data.observations) ? data.observations : [];
  return {
    value: toNumber(obs[0]?.value) ?? 0,
    prev: toNumber(obs[1]?.value) ?? 0,
    date: obs[0]?.date ?? new Date().toISOString().slice(0, 10),
  };
}

export async function GET() {
  const key = process.env.FRED_API_KEY?.trim();
  if (!key) return NextResponse.json({ error: "Missing FRED_API_KEY" }, { status: 500 });

  try {
    const [oil, usdEur, usdCny, bdiTry] = await Promise.all([
      fetchFredWeeklyPair("DCOILWTICO", key),
      fetchFredWeeklyPair("DEXUSEU", key),
      fetchFredWeeklyPair("DEXCHUS", key),
      fetchFredWeeklyPair("DISCONTINUED_BDI", key),
    ]);

    const baltic = bdiTry.value > 0 ? bdiTry : await fetchFredWeeklyPair("WTISPLC", key);

    return NextResponse.json({
      oilPrice: { value: oil.value, weeklyChange: weeklyChange(oil.value, oil.prev) },
      usdEur: { value: usdEur.value, weeklyChange: weeklyChange(usdEur.value, usdEur.prev) },
      usdCny: { value: usdCny.value, weeklyChange: weeklyChange(usdCny.value, usdCny.prev) },
      balticDry: { value: baltic.value, weeklyChange: weeklyChange(baltic.value, baltic.prev) },
      asOf: oil.date,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
