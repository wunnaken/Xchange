import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";
const WORLD_BANK_BASE = "https://api.worldbank.org/v2/country/WLD/indicator";

type FredObservation = {
  date: string;
  value: string;
};

type FredResponse = {
  observations?: FredObservation[];
};

type WorldBankRow = {
  date: string;
  value: number | null;
};

type WorldBankResponse = [unknown, WorldBankRow[]?];

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function calcChange(current: number | null, previous: number | null): number {
  if (current == null || previous == null || previous === 0) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

async function fetchFredLatest(seriesId: string, apiKey: string): Promise<{ value: number; date: string }> {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    limit: "1",
    sort_order: "desc",
  });
  const res = await fetch(`${FRED_BASE}?${params.toString()}`, {
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return { value: 0, date: new Date().toISOString().slice(0, 10) };
  const data = (await res.json()) as FredResponse;
  const obs = Array.isArray(data.observations) ? data.observations[0] : undefined;
  return {
    value: toNumber(obs?.value) ?? 0,
    date: obs?.date ?? new Date().toISOString().slice(0, 10),
  };
}

async function fetchWorldBankTwo(indicator: string): Promise<{ current: number; previous: number; date: string }> {
  const url = `${WORLD_BANK_BASE}/${indicator}?format=json&mrv=2&per_page=2`;
  const res = await fetch(url, {
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return { current: 0, previous: 0, date: new Date().getUTCFullYear().toString() };
  const payload = (await res.json()) as WorldBankResponse;
  const rows = Array.isArray(payload?.[1]) ? payload[1].filter((r) => r && r.value != null) : [];
  const current = toNumber(rows[0]?.value) ?? 0;
  const previous = toNumber(rows[1]?.value) ?? 0;
  return {
    current,
    previous,
    date: rows[0]?.date ?? new Date().getUTCFullYear().toString(),
  };
}

export async function GET() {
  const fredKey = process.env.FRED_API_KEY?.trim();
  if (!fredKey) {
    return NextResponse.json({ error: "Missing FRED_API_KEY" }, { status: 500 });
  }

  try {
    const [tradeBalance, exportsVal, importsVal, _wtiOil, globalTrade, throughput] = await Promise.all([
      fetchFredLatest("BOPGSTB", fredKey),
      fetchFredLatest("BOPXGS", fredKey),
      fetchFredLatest("BOPIGS", fredKey),
      fetchFredLatest("DCOILWTICO", fredKey),
      fetchWorldBankTwo("TG.VAL.TOTL.GD.ZS"),
      fetchWorldBankTwo("IS.SHP.GOOD.TU"),
    ]);

    return NextResponse.json({
      tradeBalance: { value: tradeBalance.value, unit: "M USD", date: tradeBalance.date },
      exports: { value: exportsVal.value, unit: "M USD", date: exportsVal.date },
      imports: { value: importsVal.value, unit: "M USD", date: importsVal.date },
      globalTradeVolume: {
        value: globalTrade.current,
        change: calcChange(globalTrade.current, globalTrade.previous),
        unit: "%GDP",
        date: globalTrade.date,
      },
      portThroughput: {
        value: throughput.current / 1_000_000,
        change: calcChange(throughput.current, throughput.previous),
        unit: "M TEU",
        date: throughput.date,
      },
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
