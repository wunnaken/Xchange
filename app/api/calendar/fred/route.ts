import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Map indicator names (partial match) to FRED series IDs for historical charts */
export const FRED_SERIES_MAP: Record<string, string> = {
  "cpi": "CPIAUCSL",
  "consumer price": "CPIAUCSL",
  "inflation": "CPIAUCSL",
  "core cpi": "CPILFESL",
  "fed funds": "FEDFUNDS",
  "fomc": "FEDFUNDS",
  "federal reserve": "FEDFUNDS",
  "unemployment": "UNRATE",
  "gdp": "A191RL1Q225SBEA",
  "nonfarm payroll": "PAYEMS",
  "nfp": "PAYEMS",
  "jobs report": "PAYEMS",
  "payrolls": "PAYEMS",
  "retail sales": "RSXFS",
  "ppi": "PPIACO",
  "producer price": "PPIACO",
  "consumer sentiment": "UMCSENT",
  "housing starts": "HOUST",
  "ism manufacturing": "MANEMP",
  "jobless claims": "ICSA",
  "10y": "DGS10",
  "10 year": "DGS10",
  "treasury 10": "DGS10",
  "2y": "DGS2",
  "2 year": "DGS2",
  "treasury 2": "DGS2",
  "yield curve": "T10Y2Y",
  "pce": "PCEPI",
  "pce inflation": "PCEPI",
  "core pce": "PCEPILFE",
};

function getSeriesId(eventName: string): string | null {
  const n = eventName.toLowerCase();
  for (const [key, id] of Object.entries(FRED_SERIES_MAP)) {
    if (n.includes(key)) return id;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const seriesId = request.nextUrl.searchParams.get("series_id");
  const start = request.nextUrl.searchParams.get("observation_start");
  const end = request.nextUrl.searchParams.get("observation_end");
  const eventName = request.nextUrl.searchParams.get("event_name");

  const key = process.env.FRED_API_KEY?.trim();
  const sid = seriesId || (eventName ? getSeriesId(eventName) : null);
  if (!sid) {
    return NextResponse.json({ observations: [], series_id: null }, { status: 200 });
  }

  const endDate = end ? new Date(end) : new Date();
  const startDate = start ? new Date(start) : (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 10);
    return d;
  })();

  const startStr = startDate.toISOString().slice(0, 10);
  const endStr = endDate.toISOString().slice(0, 10);

  if (!key) {
    return NextResponse.json({ observations: [], series_id: sid }, { status: 200 });
  }

  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(sid)}&api_key=${key}&file_type=json&observation_start=${startStr}&observation_end=${endStr}&sort_order=asc&frequency=m`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) throw new Error("FRED request failed");
    const data = (await res.json()) as { observations?: Array<{ date: string; value: string }> };
    const observations = (data.observations ?? [])
      .filter((o) => o.value !== ".")
      .map((o) => ({ date: o.date, value: parseFloat(o.value) }));
    return NextResponse.json({ observations, series_id: sid });
  } catch (e) {
    console.error("[calendar/fred]", e);
    return NextResponse.json({ observations: [], series_id: sid }, { status: 200 });
  }
}
