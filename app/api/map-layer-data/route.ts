import { NextRequest, NextResponse } from "next/server";
import {
  LAYERS,
  type LayerId,
  HARDCODED_INTEREST,
  HARDCODED_CURRENCY,
  HARDCODED_POLITICAL,
  HARDCODED_SENTIMENT,
} from "../../../lib/map-layers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const WB_BASE = "https://api.worldbank.org/v2/country/all/indicator";
const CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours
const wbCache = new Map<string, { data: Record<string, number>; ts: number }>();
const wbHistoryCache = new Map<string, { data: Record<string, { year: string; value: number }[]>; ts: number }>();

/** World Bank returns countryiso3code (e.g. USA). We normalize to lowercase to match our ISO3 map. */
async function fetchWorldBankIndicator(indicator: string): Promise<Record<string, number>> {
  const key = `wb-${indicator}`;
  const hit = wbCache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_MS) return hit.data;
  const url = `${WB_BASE}/${indicator}?format=json&per_page=300&mrv=1`;
  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return {};
    const data = await res.json();
    if (!Array.isArray(data) || data.length < 2) return {};
    const list = data[1] as Array<{ countryiso3code?: string; value?: number | null }>;
    const out: Record<string, number> = {};
    for (const row of list ?? []) {
      const iso3 = row.countryiso3code?.toLowerCase();
      const val = row.value;
      if (iso3 && typeof val === "number" && !Number.isNaN(val)) out[iso3] = val;
    }
    wbCache.set(key, { data: out, ts: Date.now() });
    return out;
  } catch {
    return hit?.data ?? {};
  }
}

/** Multi-year history for sparkline (mrv = observations per country; annual indicators → many years). */
async function fetchWorldBankHistory(indicator: string): Promise<Record<string, { year: string; value: number }[]>> {
  const key = `wb-history-${indicator}`;
  const hit = wbHistoryCache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_MS) return hit.data;
  const url = `${WB_BASE}/${indicator}?format=json&per_page=20000&mrv=20`;
  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return {};
    const data = await res.json();
    if (!Array.isArray(data) || data.length < 2) return {};
    const list = data[1] as Array<{ countryiso3code?: string; date?: string; value?: number | null }>;
    const byIso3: Record<string, { year: string; value: number }[]> = {};
    for (const row of list ?? []) {
      const iso3 = row.countryiso3code?.toLowerCase();
      const year = row.date ?? "";
      const val = row.value;
      if (!iso3 || typeof val !== "number" || Number.isNaN(val)) continue;
      if (!byIso3[iso3]) byIso3[iso3] = [];
      byIso3[iso3].push({ year, value: val });
    }
    wbHistoryCache.set(key, { data: byIso3, ts: Date.now() });
    return byIso3;
  } catch {
    return hit?.data ?? {};
  }
}

/** Hardcoded market index % change (temporary). */
const HARDCODED_MARKETS: Record<string, number> = {
  "United States of America": 12.5,
  "United States": 12.5,
  "United Kingdom": 8.2,
  Germany: 6.1,
  France: 5.8,
  Japan: -2.1,
  China: -5.3,
  India: 15.2,
  Canada: 4.1,
  Australia: 3.9,
  Brazil: 11.0,
  "South Korea": 2.4,
  Italy: 4.0,
  Spain: 7.1,
  Mexico: 9.2,
  Indonesia: 6.5,
  Netherlands: 5.2,
  Turkey: -3.1,
  Switzerland: 4.8,
  "Saudi Arabia": 14.0,
  "South Africa": 2.1,
  Russia: -8.0,
  Taiwan: 18.2,
  Poland: 6.0,
  Sweden: 5.1,
  Belgium: 4.0,
  Argentina: 25.0,
  Norway: 3.2,
  Thailand: -1.5,
};

export async function GET(req: NextRequest) {
  const layer = (req.nextUrl.searchParams.get("layer") ?? "markets") as LayerId;
  const wantHistory = req.nextUrl.searchParams.get("history") === "1";
  const layerDef = LAYERS.find((l) => l.id === layer);
  if (!layerDef) {
    return NextResponse.json({ byIso3: {}, byName: {}, history: undefined });
  }

  if (layerDef.wbIndicator) {
    const [byIso3, history] = await Promise.all([
      fetchWorldBankIndicator(layerDef.wbIndicator),
      wantHistory && layerDef.sparklineIndicator
        ? fetchWorldBankHistory(layerDef.sparklineIndicator)
        : Promise.resolve(undefined),
    ]);
    return NextResponse.json({ byIso3, byName: {}, history: history ?? undefined });
  }

  if (layer === "markets") {
    return NextResponse.json({ byIso3: {}, byName: HARDCODED_MARKETS, history: undefined });
  }
  if (layer === "interest") {
    return NextResponse.json({ byIso3: {}, byName: HARDCODED_INTEREST, history: undefined });
  }
  if (layer === "currency") {
    return NextResponse.json({ byIso3: {}, byName: HARDCODED_CURRENCY, history: undefined });
  }
  if (layer === "political") {
    return NextResponse.json({ byIso3: {}, byName: HARDCODED_POLITICAL, history: undefined });
  }
  if (layer === "sentiment") {
    return NextResponse.json({ byIso3: {}, byName: HARDCODED_SENTIMENT, history: undefined });
  }

  return NextResponse.json({ byIso3: {}, byName: {}, history: undefined });
}
