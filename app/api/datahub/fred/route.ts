import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const FED_SERIES = "FEDFUNDS";

export async function GET() {
  const key = process.env.FRED_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({
      current: 4.5,
      lastChanged: "2024-09-18",
      history: generateMockHistory(),
      balanceSheet: 7.2,
      balanceSheetPeak: 8.9,
    });
  }
  try {
    const end = new Date();
    const start = new Date(2000, 0, 1);
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${FED_SERIES}&api_key=${key}&file_type=json&observation_start=${start.toISOString().slice(0, 10)}&observation_end=${end.toISOString().slice(0, 10)}&sort_order=asc`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error("FRED request failed");
    const data = (await res.json()) as { observations?: Array<{ date: string; value: string }> };
    const observations = data.observations ?? [];
    const valid = observations.filter((o) => o.value !== ".").map((o) => ({ date: o.date, value: parseFloat(o.value) }));
    const current = valid.length > 0 ? valid[valid.length - 1].value : 4.5;
    const lastObs = valid[valid.length - 1];
    const lastChanged = lastObs?.date ?? "2024-09-18";
    const history = valid.slice(-600).map((o) => ({ date: o.date, value: o.value }));
    return NextResponse.json({
      current,
      lastChanged,
      history,
      balanceSheet: 7.2,
      balanceSheetPeak: 8.9,
    });
  } catch (e) {
    console.error("[datahub/fred]", e);
    return NextResponse.json({
      current: 4.5,
      lastChanged: "2024-09-18",
      history: generateMockHistory(),
      balanceSheet: 7.2,
      balanceSheetPeak: 8.9,
    });
  }
}

function generateMockHistory(): { date: string; value: number }[] {
  const out: { date: string; value: number }[] = [];
  let v = 1.5;
  for (let y = 2000; y <= 2025; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === 2025 && m > 2) break;
      if (y >= 2022) v = Math.min(5.5, v + (Math.random() - 0.4) * 0.5);
      else if (y >= 2020) v = 0.1 + (y - 2020) * 0.2;
      else if (y >= 2016) v = Math.max(0.1, v + (Math.random() - 0.5) * 0.3);
      out.push({ date: `${y}-${String(m).padStart(2, "0")}-01`, value: Math.round(v * 100) / 100 });
    }
  }
  return out.slice(-400);
}
