export const revalidate = 3600;

import { NextResponse } from "next/server";

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";
const NEWSDATA_BASE = "https://newsdata.io/api/1/news";
const ECB_SDW_DE_10Y_URL =
  "https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y?format=jsondata&lastNObservations=365";
const WORLD_BANK_LEND_BASE = "https://api.worldbank.org/v2/country";
const RSS_FEEDS = [
  { url: "https://feeds.reuters.com/reuters/businessNews", source: "Reuters" },
  { url: "https://www.ft.com/rss/home", source: "Financial Times" },
  { url: "https://feeds.marketwatch.com/marketwatch/topstories", source: "MarketWatch" },
] as const;
const BOND_NEWS_KEYWORDS = [
  "bond",
  "yield",
  "treasury",
  "federal reserve",
  "rate",
  "gilt",
  "bund",
  "central bank",
  "ecb",
  "boj",
  "boe",
];
const CURVE_ORDER = ["1M", "3M", "6M", "1Y", "2Y", "5Y", "7Y", "10Y", "20Y", "30Y"] as const;
const TREASURY_YIELD_XML_URL =
  "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve";
/** Yield-curve spot: filter obvious bad prints on the very short end (0–8%). */
const CURVE_SHORT_END_LABELS = new Set<string>(["1M", "3M", "6M"]);
/** US spot curve history served from Treasury XML instead of FRED when listed here. */
const US_TREASURY_DGS_SERIES = new Set<string>([
  "DTB4WK",
  "DTB3",
  "DGS6MO",
  "DGS1",
  "DGS2",
  "DGS5",
  "DGS7",
  "DGS10",
  "DGS20",
  "DGS30",
]);
/** Treasury daily XML tag per curve label (constant-maturity analogs; 1M ≈ BC_1MONTH vs FRED 4W bill). */
const TREASURY_FIELD_BY_CURVE_LABEL: Record<(typeof CURVE_ORDER)[number], string> = {
  "1M": "BC_1MONTH",
  "3M": "BC_3MONTH",
  "6M": "BC_6MONTH",
  "1Y": "BC_1YEAR",
  "2Y": "BC_2YEAR",
  "5Y": "BC_5YEAR",
  "7Y": "BC_7YEAR",
  "10Y": "BC_10YEAR",
  "20Y": "BC_20YEAR",
  "30Y": "BC_30YEAR",
};
const TREASURY_CURVE_LABELS = [...CURVE_ORDER] as const;

const RATE_UNAVAILABLE_NOTE = "Rate temporarily unavailable — check central bank website";

const ECB_MAIN_REFINANCING_URL =
  "https://data-api.ecb.europa.eu/service/data/FM/B.U2.EUR.4F.KR.MRR_FR.LEV?format=jsondata&lastNObservations=12";
const BOJ_IR_TABLE_HTML = "https://www.stat-search.boj.or.jp/ssi/mtshtml/ir01_m_1_en.html";
const BOE_BANK_RATE_PLOT_URL =
  "https://api.bankofengland.co.uk/chart/plot?seriesCodes=IUMBEDR&startdate=01/Jan/2024&enddate=today&yaxis=left";

/** BIS SDMX-ML (stats.bis.org) — data.bis.org jsondata URL is attempted first inside fetchBisPolicyRate. */
const bisCbpolStatsUrl = (refArea: string) =>
  `https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/M.${refArea}?startPeriod=2024-01`;
const bisCbpolJsonDataUrl = (refArea: string) =>
  `https://data.bis.org/api/data/WS_CBPOL/M.${refArea}?startPeriod=2024-01&format=jsondata`;

type PolicyRateResult = { value: number; lastUpdated: string; source: string };

async function safePolicyRateFetch(
  label: string,
  fn: () => Promise<PolicyRateResult | null>,
): Promise<PolicyRateResult | null> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[bonds] ${label} central bank fetch error`, e);
    return null;
  }
}

function policyFetchInit(): RequestInit {
  return { signal: AbortSignal.timeout(10000), cache: "no-store" };
}

/** Monthly period `YYYY-MM` → last calendar day as ISO date. */
function endOfMonthIsoFromYm(ym: string): string {
  const [ys, ms] = ym.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return ym;
  const last = new Date(y, m, 0);
  return last.toISOString().slice(0, 10);
}

function parseBisCbpolStatsXml(xml: string): { value: number; period: string } | null {
  const obs: Array<{ p: string; v: number }> = [];
  const re = /<Obs\b[^>]*TIME_PERIOD="([^"]+)"[^>]*OBS_VALUE="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const v = toNumber(m[2]);
    if (v != null && Number.isFinite(v)) obs.push({ p: m[1], v });
  }
  if (obs.length === 0) return null;
  obs.sort((a, b) => a.p.localeCompare(b.p));
  const last = obs.at(-1)!;
  return { value: last.v, period: last.p };
}

type SdmxJsonDataObs = {
  dataSets?: Array<{
    series?: Record<string, { observations?: Record<string, [unknown, ...unknown[]] | unknown[]> }>;
  }>;
  structure?: {
    dimensions?: {
      observation?: Array<{ values?: Array<{ id: string }> }>;
    };
  };
};

/** End-of-period instant (ms) for SDMX observation id; skip if unparseable. */
function observationPeriodEndMs(period: string): number | null {
  const d = period.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const t = new Date(`${d}T23:59:59.999Z`).getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (/^\d{4}-\d{2}$/.test(period)) {
    const iso = endOfMonthIsoFromYm(period);
    const t = new Date(`${iso}T23:59:59.999Z`).getTime();
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/** ECB / SDMX-JSON: latest observation whose period is not in the future (avoids ECB forward-dated rate rows). */
function parseSdmxJsonDataLastObs(jsonText: string): { value: number; period: string } | null {
  try {
    const data = JSON.parse(jsonText) as SdmxJsonDataObs;
    const seriesMap = data.dataSets?.[0]?.series ?? {};
    const dimValues = data.structure?.dimensions?.observation?.[0]?.values ?? [];
    const now = Date.now();
    let best: { period: string; value: number; t: number } | null = null;
    for (const ser of Object.values(seriesMap)) {
      const observations = ser?.observations ?? {};
      for (const [idxStr, valArr] of Object.entries(observations)) {
        const idx = Number.parseInt(idxStr, 10);
        if (!Number.isFinite(idx) || idx < 0) continue;
        const id = dimValues[idx]?.id;
        const raw = Array.isArray(valArr) ? valArr[0] : null;
        const value = toNumber(raw as string | number | null | undefined);
        if (id == null || value == null || !Number.isFinite(value)) continue;
        const t = observationPeriodEndMs(id);
        if (t == null || t > now) continue;
        if (!best || t > best.t) best = { period: id, value, t };
      }
    }
    return best ? { value: best.value, period: best.period } : null;
  } catch {
    return null;
  }
}

async function fetchBisPolicyRateFromStats(refArea: string): Promise<PolicyRateResult | null> {
  const url = bisCbpolStatsUrl(refArea);
  const res = await fetch(url, policyFetchInit());
  if (!res.ok) return null;
  const text = await res.text();
  if (text.includes("ErrorMessage") || text.includes("message:Error")) return null;
  const parsed = parseBisCbpolStatsXml(text);
  if (!parsed) return null;
  const lastUpdated = /^\d{4}-\d{2}$/.test(parsed.period) ? endOfMonthIsoFromYm(parsed.period) : parsed.period;
  return {
    value: parsed.value,
    lastUpdated,
    source: `BIS WS_CBPOL (${refArea})`,
  };
}

/**
 * BIS central bank policy rates — tries portal jsondata URL first, then stats.bis.org SDMX-ML.
 */
async function fetchBisPolicyRate(countryCode: string): Promise<PolicyRateResult | null> {
  try {
    const jUrl = bisCbpolJsonDataUrl(countryCode);
    const jRes = await fetch(jUrl, policyFetchInit());
    if (jRes.ok) {
      const jText = await jRes.text();
      if (!jText.includes('"detail"')) {
        const parsed = parseSdmxJsonDataLastObs(jText);
        if (parsed) {
          const lastUpdated = /^\d{4}-\d{2}$/.test(parsed.period)
            ? endOfMonthIsoFromYm(parsed.period)
            : parsed.period.length >= 10
              ? parsed.period.slice(0, 10)
              : parsed.period;
          return { value: parsed.value, lastUpdated, source: `BIS WS_CBPOL (${countryCode})` };
        }
      }
    }
  } catch {
    /* fall through */
  }
  try {
    return await fetchBisPolicyRateFromStats(countryCode);
  } catch {
    return null;
  }
}

async function fetchFedEffectiveRate(): Promise<{ value: number | null; date: string | null; source: string | null }> {
  const bis = await fetchBisPolicyRate("US");
  if (bis != null && bis.value != null && Number.isFinite(bis.value)) {
    console.log("[bonds] fed rate (BIS WS_CBPOL US):", bis.value, "as of", bis.lastUpdated);
    return { value: bis.value, date: bis.lastUpdated, source: "BIS WS_CBPOL (US)" };
  }
  console.error("[bonds] fed rate unavailable — all sources failed");
  return { value: null, date: null, source: null };
}

/** Fed policy display: BIS WS_CBPOL US (FRED CSV can be re-added when unblocked). */
async function fetchFedPolicyRate(): Promise<PolicyRateResult | null> {
  const r = await fetchFedEffectiveRate();
  if (r.value == null || !Number.isFinite(r.value) || r.source == null) return null;
  return {
    value: r.value,
    lastUpdated: r.date ?? new Date().toISOString().slice(0, 10),
    source: r.source,
  };
}

async function fetchEcbPolicyRate(): Promise<PolicyRateResult | null> {
  try {
    const res = await fetch(ECB_MAIN_REFINANCING_URL, policyFetchInit());
    if (res.ok) {
      const text = await res.text();
      const parsed = parseSdmxJsonDataLastObs(text);
      if (parsed) {
        const lastUpdated =
          parsed.period.length >= 10 ? parsed.period.slice(0, 10) : endOfMonthIsoFromYm(parsed.period);
        return { value: parsed.value, lastUpdated, source: "ECB Statistical Data Warehouse" };
      }
    }
  } catch {
    /* fall through */
  }
  try {
    return await fetchBisPolicyRate("XM");
  } catch {
    return null;
  }
}

function parseBojHtmlForCallRate(html: string): number | null {
  const lower = html.toLowerCase();
  const idx = lower.indexOf("uncollateralized overnight call rate");
  const window = idx >= 0 ? html.slice(idx, idx + 4000) : html.slice(-12000);
  const pctMatches = [...window.matchAll(/([\d.]+)\s*%/g)].map((m) => toNumber(m[1])).filter((n): n is number => n != null && n >= -2 && n <= 30);
  if (pctMatches.length === 0) return null;
  return pctMatches[pctMatches.length - 1];
}

async function fetchBojFromBojHtml(): Promise<PolicyRateResult | null> {
  const res = await fetch(BOJ_IR_TABLE_HTML, policyFetchInit());
  if (!res.ok) return null;
  const html = await res.text();
  const value = parseBojHtmlForCallRate(html);
  if (value == null) return null;
  return {
    value,
    lastUpdated: new Date().toISOString().slice(0, 10),
    source: "Bank of Japan (stat-search HTML)",
  };
}

async function fetchBojPolicyRate(): Promise<PolicyRateResult | null> {
  try {
    const bis = await fetchBisPolicyRate("JP");
    if (bis) return bis;
  } catch {
    /* continue */
  }
  try {
    return await fetchBojFromBojHtml();
  } catch {
    return null;
  }
}

function parseBoePlotResponse(text: string): PolicyRateResult | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed) as {
        series?: Array<{ data?: Array<{ x?: string; y?: number }> }>;
      };
      const pts = data.series?.[0]?.data;
      if (Array.isArray(pts) && pts.length > 0) {
        const last = pts.at(-1)!;
        const y = typeof last.y === "number" ? last.y : toNumber(last.y as unknown as string);
        const x = last.x;
        if (y != null && x) {
          const lastUpdated = /^\d{4}-\d{2}-\d{2}/.test(x) ? x.slice(0, 10) : x;
          return { value: y, lastUpdated, source: "Bank of England chart API (IUMBEDR)" };
        }
      }
    } catch {
      /* fall through */
    }
  }
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const nums: number[] = [];
  for (const line of lines) {
    const parts = line.split(/[,\t]/).map((s) => s.trim());
    const lastPart = parts.at(-1) ?? "";
    const n = toNumber(lastPart.replace(/%/g, ""));
    if (n != null && n >= 0 && n < 50) nums.push(n);
  }
  if (nums.length > 0) {
    return {
      value: nums[nums.length - 1],
      lastUpdated: new Date().toISOString().slice(0, 10),
      source: "Bank of England chart API (IUMBEDR)",
    };
  }
  return null;
}

async function fetchBoeFromPlotApi(): Promise<PolicyRateResult | null> {
  const res = await fetch(BOE_BANK_RATE_PLOT_URL, policyFetchInit());
  if (!res.ok) return null;
  const text = await res.text();
  return parseBoePlotResponse(text);
}

async function fetchBoePolicyRate(): Promise<PolicyRateResult | null> {
  try {
    const boe = await fetchBoeFromPlotApi();
    if (boe) return boe;
  } catch {
    /* continue */
  }
  try {
    return await fetchBisPolicyRate("GB");
  } catch {
    return null;
  }
}

async function fetchPbocPolicyRate(): Promise<PolicyRateResult | null> {
  try {
    return await fetchBisPolicyRate("CN");
  } catch {
    return null;
  }
}

function centralBankCard(label: string, res: PolicyRateResult | null): CentralBankRate {
  if (res == null) {
    return { label, value: null, source: "—", lastUpdated: null, note: RATE_UNAVAILABLE_NOTE };
  }
  return { label, value: res.value, source: res.source, lastUpdated: res.lastUpdated };
}

function logPolicyRate(name: string, res: PolicyRateResult | null) {
  if (res != null) {
    console.log(`[bonds] ${name} rate: ${res.value}% as of ${res.lastUpdated}`);
  } else {
    console.log(`[bonds] ${name} rate: unavailable`);
  }
}

type FredObservation = { date: string; value: string };
type FredResponse = { observations?: FredObservation[] };

type BondMaturityConfig = { label: string; seriesId: string };
type BondCountryConfig = {
  id: string;
  label: string;
  maturities: BondMaturityConfig[];
  tvSymbol: string;
};

const CURVE_SERIES: Array<{ label: string; seriesId: string }> = [
  { label: "1M", seriesId: "DTB4WK" },
  { label: "3M", seriesId: "DTB3" },
  { label: "6M", seriesId: "DGS6MO" },
  { label: "1Y", seriesId: "DGS1" },
  { label: "2Y", seriesId: "DGS2" },
  { label: "5Y", seriesId: "DGS5" },
  { label: "7Y", seriesId: "DGS7" },
  { label: "10Y", seriesId: "DGS10" },
  { label: "20Y", seriesId: "DGS20" },
  { label: "30Y", seriesId: "DGS30" },
];

/** International maturity cards: sparkline + levels from World Bank / ECB history (FRED spot series often blocked). */
const INTL_SPARK_HISTORY_KEY: Record<string, string> = {
  IRSTCB01GBM156N: "GBAM10Y",
  GBAM10Y: "GBAM10Y",
  IRSTCB01DEM156N: "DEAM10Y",
  DEAM10Y: "DEAM10Y",
  INTGSBEJPM193N: "INTGSBEJPM193N",
  INTDSRCNM193N: "INTDSRCNM193N",
  INTDSRBRM193N: "INTDSRBRM193N",
  INTDSRINM193N: "INTDSRINM193N",
  INTDSRMXM193N: "INTDSRMXM193N",
  INTDSRZAM193N: "INTDSRZAM193N",
};

const COUNTRY_CONFIG: BondCountryConfig[] = [
  {
    id: "us",
    label: "US Treasury",
    maturities: [
      { label: "2Y", seriesId: "DGS2" },
      { label: "5Y", seriesId: "DGS5" },
      { label: "10Y", seriesId: "DGS10" },
      { label: "30Y", seriesId: "DGS30" },
    ],
    tvSymbol: "TVC:US10Y",
  },
  {
    id: "uk",
    label: "UK Gilts",
    maturities: [
      { label: "2Y", seriesId: "IRSTCB01GBM156N" },
      { label: "10Y", seriesId: "GBAM10Y" },
    ],
    tvSymbol: "TVC:GB10Y",
  },
  {
    id: "de",
    label: "German Bunds",
    maturities: [
      { label: "2Y", seriesId: "IRSTCB01DEM156N" },
      { label: "10Y", seriesId: "DEAM10Y" },
    ],
    tvSymbol: "TVC:DE10Y",
  },
  {
    id: "jp",
    label: "Japan JGB",
    maturities: [{ label: "10Y", seriesId: "INTGSBEJPM193N" }],
    tvSymbol: "TVC:JP10Y",
  },
  {
    id: "cn",
    label: "China Bonds",
    maturities: [{ label: "10Y", seriesId: "INTDSRCNM193N" }],
    tvSymbol: "TVC:CN10Y",
  },
  {
    id: "em",
    label: "Emerging Markets",
    maturities: [
      { label: "Brazil 10Y", seriesId: "INTDSRBRM193N" },
      { label: "India 10Y", seriesId: "INTDSRINM193N" },
      { label: "Mexico 10Y", seriesId: "INTDSRMXM193N" },
      { label: "South Africa 10Y", seriesId: "INTDSRZAM193N" },
    ],
    tvSymbol: "TVC:BR10Y",
  },
];

type BondNewsArticle = {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
};
type CentralBankRate = {
  label: string;
  value: number | null;
  source: string;
  lastUpdated: string | null;
  note?: string;
};

function toNumber(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "string" && v.trim() === ".") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseObs(data: FredResponse): Array<{ date: string; value: number }> {
  const obs = Array.isArray(data.observations) ? data.observations : [];
  return obs
    .map((o) => ({ date: o.date, value: toNumber(o.value) }))
    .filter(
      (o): o is { date: string; value: number } =>
        o.value != null && Number.isFinite(o.value) && o.value > -5 && o.value < 100,
    );
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Full-parameter FRED observations for curve, series history, latest points, etc. */
async function fredSeriesObservations(
  apiKey: string,
  seriesId: string,
  limit: number,
  sortOrder: "asc" | "desc",
  observationStart?: string,
  observationEnd?: string,
): Promise<Array<{ date: string; value: number }>> {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    limit: String(limit),
    sort_order: sortOrder,
  });
  if (observationStart) params.set("observation_start", observationStart);
  if (observationEnd) params.set("observation_end", observationEnd);
  const url = `${FRED_BASE}?${params.toString()}`;
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  try {
    const data = (await res.json()) as FredResponse;
    return parseObs(data);
  } catch {
    return [];
  }
}

function pastTreasuryYearMonths(monthCount: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < monthCount; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    out.push(`${y}${m}`);
  }
  return out;
}

async function fetchTreasuryFieldForMonth(yearMonth: string, xmlField: string): Promise<Array<{ date: string; value: number }>> {
  const url = `${TREASURY_YIELD_XML_URL}&field_tdr_date_value_month=${yearMonth}`;
  try {
    const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.error("[bonds] treasury non-OK", yearMonth, xmlField, res.status);
      return [];
    }
    const text = await res.text();
    const results: Array<{ date: string; value: number }> = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let entry: RegExpExecArray | null;
    while ((entry = entryRegex.exec(text)) !== null) {
      const dateMatch = entry[1].match(/<d:NEW_DATE[^>]*>([^<]+)<\/d:NEW_DATE>/);
      const valueMatch = entry[1].match(new RegExp(`<d:${xmlField}[^>]*>([^<]+)</d:${xmlField}>`));
      if (dateMatch && valueMatch) {
        const date = dateMatch[1].split("T")[0];
        const value = Number.parseFloat(valueMatch[1]);
        if (date && Number.isFinite(value)) results.push({ date, value });
      }
    }
    return results;
  } catch (e) {
    console.error("[bonds] treasury fetch error", yearMonth, xmlField, e);
    return [];
  }
}

/** US Treasury daily yield curve XML — parallel months, dedupe by date, trim with buffer so year-ago anchors exist. */
async function fetchTreasuryYields(curveLabel: (typeof TREASURY_CURVE_LABELS)[number]): Promise<Array<{ date: string; value: number }>> {
  const xmlField = TREASURY_FIELD_BY_CURVE_LABEL[curveLabel];
  const months = pastTreasuryYearMonths(16);
  const chunks = await Promise.all(months.map((ym) => fetchTreasuryFieldForMonth(ym, xmlField)));
  const byDate = new Map<string, number>();
  for (const rows of chunks) {
    for (const { date, value } of rows) {
      byDate.set(date, value);
    }
  }
  const retentionDays = 420;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return [...byDate.entries()]
    .filter(([date]) => date >= cutoff)
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fredPointAtOrBefore(apiKey: string, seriesId: string, targetDate: string): Promise<number | null> {
  const rows = await fredSeriesObservations(apiKey, seriesId, 1, "desc", undefined, targetDate);
  return rows[0]?.value ?? null;
}

/** Latest observation on or before `targetDate` (YYYY-MM-DD); `rows` sorted ascending by date. */
function treasuryYieldAtOrBefore(rows: Array<{ date: string; value: number }>, targetDate: string): number | null {
  let best: { date: string; value: number } | null = null;
  for (const r of rows) {
    if (r.date <= targetDate && (!best || r.date > best.date)) best = r;
  }
  if (best) return best.value;
  // Target can fall before the earliest retained business day (UTC vs calendar + 365d trim); oldest row is closest proxy.
  if (rows.length > 0) return rows[0].value;
  return null;
}

function diffBps(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  return (current - previous) * 100;
}

function calculateCurveInversionDays(twoHistory: Array<{ date: string; value: number }>, tenHistory: Array<{ date: string; value: number }>): number {
  const tenByDate = new Map(tenHistory.map((r) => [r.date, r.value]));
  const merged = twoHistory
    .map((r) => ({ date: r.date, two: r.value, ten: tenByDate.get(r.date) }))
    .filter((r): r is { date: string; two: number; ten: number } => r.ten != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  let count = 0;
  for (let i = merged.length - 1; i >= 0; i--) {
    if (merged[i].two > merged[i].ten) count++;
    else break;
  }
  return count;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function sentimentFromSpreads(twoTen: number | null, vix: number | null): number {
  const slopeScore = twoTen == null ? 50 : clamp(50 + twoTen * 8, 0, 100);
  const vixScore = vix == null ? 50 : clamp(100 - (vix - 15) * 3, 0, 100);
  return Math.round((slopeScore * 0.5 + vixScore * 0.5) * 10) / 10;
}

function sentimentLabel(score: number): string {
  if (score <= 20) return "Extreme Fear";
  if (score <= 40) return "Fear";
  if (score <= 60) return "Neutral";
  if (score <= 80) return "Greed";
  return "Extreme Greed";
}

function spreadInterpretation(name: string, value: number | null, inversionDays: number): string {
  if (value == null) return "No recent data.";
  if (name === "Yield Curve") {
    if (value < 0) return `Recession signal: curve has been inverted for ${inversionDays} day${inversionDays === 1 ? "" : "s"}.`;
    if (value < 0.5) return "Curve is flat: growth expectations are cautious.";
    return "Steeper curve: growth and inflation expectations are healthier.";
  }
  return "";
}

function vixInterpretation(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "No recent data.";
  if (v < 15) return "Market calm — low volatility expected";
  if (v <= 25) return "Moderate uncertainty in markets";
  if (v <= 35) return "Elevated fear — hedging activity increasing";
  return "Extreme fear — market stress signal";
}

function tenTwoSpreadInterpretation(spreadPct: number | null): string {
  if (spreadPct == null || !Number.isFinite(spreadPct)) return "No recent data.";
  if (spreadPct >= 0) return "Normal curve — growth expectations intact";
  return "Inverted curve — historical recession indicator";
}

type YahooChartJson = {
  chart?: { result?: Array<{ indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> };
};

function parseYahooVixCloses(json: unknown): { current: number | null; previous: number | null } {
  try {
    const close = (json as YahooChartJson).chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    if (!Array.isArray(close)) return { current: null, previous: null };
    const vals = close.filter((x): x is number => x != null && Number.isFinite(x));
    if (vals.length === 0) return { current: null, previous: null };
    return {
      current: vals.at(-1)!,
      previous: vals.length >= 2 ? vals.at(-2)! : null,
    };
  } catch {
    return { current: null, previous: null };
  }
}

async function fetchVixFromYahoo(): Promise<{ value: number | null; change: number | null }> {
  try {
    const res = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d", {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "xchange-bonds/1.0" },
    });
    if (!res.ok) return { value: null, change: null };
    const json: unknown = await res.json();
    const { current, previous } = parseYahooVixCloses(json);
    if (current == null) return { value: null, change: null };
    const change = previous != null ? current - previous : null;
    return { value: current, change };
  } catch (e) {
    console.error("[bonds] VIX fetch failed:", e);
    return { value: null, change: null };
  }
}

function parseRssItems(xml: string, source: string): BondNewsArticle[] {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  const decode = (v: string) =>
    v
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const extract = (block: string, tag: "title" | "description" | "link" | "pubDate") => {
    const cdata = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i").exec(block)?.[1];
    const plain = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i").exec(block)?.[1];
    return decode(cdata ?? plain ?? "");
  };
  return items
    .map((item) => {
      const title = extract(item, "title");
      const description = extract(item, "description");
      const link = extract(item, "link");
      const pubDate = extract(item, "pubDate");
      const hay = `${title} ${description}`.toLowerCase();
      const match = BOND_NEWS_KEYWORDS.some((k) => hay.includes(k));
      if (!match || !link.startsWith("http")) return null;
      return {
        title,
        url: link,
        source,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      } satisfies BondNewsArticle;
    })
    .filter((a): a is BondNewsArticle => a != null && a.title.length > 0);
}

async function fetchBondNewsFromRss(): Promise<BondNewsArticle[]> {
  const all = await Promise.all(
    RSS_FEEDS.map(async (feed) => {
      try {
        const res = await fetch(feed.url, {
          next: { revalidate: 3600 },
          signal: AbortSignal.timeout(15000),
          headers: { "User-Agent": "Mozilla/5.0 (compatible; XchangeBondNews/1.0)" },
        });
        if (!res.ok) return [] as BondNewsArticle[];
        const xml = await res.text();
        return parseRssItems(xml, feed.source);
      } catch {
        return [] as BondNewsArticle[];
      }
    }),
  );
  return all
    .flat()
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 8);
}

async function fetchBondNewsFromNewsData(apiKey: string): Promise<BondNewsArticle[]> {
  const params = new URLSearchParams({
    apikey: apiKey,
    q: "bond yield treasury federal reserve central bank",
    language: "en",
    size: "8",
  });
  const res = await fetch(`${NEWSDATA_BASE}?${params.toString()}`, {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    status?: string;
    results?: Array<{ title?: string; source_name?: string; source_id?: string; pubDate?: string; link?: string }>;
  };
  if (data.status !== "success" || !Array.isArray(data.results)) return [];
  return data.results
    .map((r) => ({
      title: r.title?.trim() ?? "",
      source: (r.source_name ?? r.source_id ?? "Unknown").trim(),
      url: r.link?.trim() ?? "",
      publishedAt: r.pubDate ?? new Date().toISOString(),
    }))
    .filter((a) => a.title && a.url.startsWith("http"))
    .slice(0, 8);
}

async function fetchBondNews(apiKey: string): Promise<BondNewsArticle[]> {
  const rss = await fetchBondNewsFromRss();
  if (rss.length > 0) return rss;
  if (!apiKey) return [];
  return fetchBondNewsFromNewsData(apiKey);
}

/** Most recent `limit` observations, oldest → newest (`desc` returns newest-first from FRED). */
async function fredRecentChronological(
  apiKey: string,
  seriesId: string,
  limit: number,
): Promise<Array<{ date: string; value: number }>> {
  try {
    const rows = await fredSeriesObservations(apiKey, seriesId, limit, "desc");
    return [...rows].reverse();
  } catch {
    return [];
  }
}

type EcbSdwJsonData = {
  dataSets?: Array<{
    series?: Record<string, { observations?: Record<string, [number] | [string] | [number | string]> }>;
  }>;
  structure?: {
    dimensions?: {
      observation?: Array<{ values?: Array<{ id: string }> }>;
    };
  };
};

/** World Bank lending rate (FR.INR.LEND) as proxy; returns oldest → newest by `date`. */
async function fetchWorldBankRates(
  countryCode: string,
  opts?: { mrv?: number; perPage?: number },
): Promise<Array<{ date: string; value: number }>> {
  const mrv = opts?.mrv ?? 24;
  const perPage = opts?.perPage ?? 24;
  const url = `${WORLD_BANK_LEND_BASE}/${countryCode}/indicator/FR.INR.LEND?format=json&mrv=${mrv}&per_page=${perPage}`;
  try {
    const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(20000) });
    const text = await res.text();
    if (!res.ok || text.trimStart().startsWith("<")) {
      console.error("[bonds] WorldBank non-OK", countryCode, res.status, text.slice(0, 200));
      return [];
    }
    const json = JSON.parse(text) as unknown;
    if (!Array.isArray(json) || json.length < 2 || !Array.isArray(json[1])) return [];
    type WbRow = { date?: string; value?: number | null };
    return (json[1] as WbRow[])
      .map((row) => {
        const value = toNumber(row.value);
        const date = row.date != null ? String(row.date) : "";
        return { date, value };
      })
      .filter((o): o is { date: string; value: number } => o.date.length > 0 && o.value != null && Number.isFinite(o.value))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (e) {
    console.error("[bonds] WorldBank error", countryCode, e);
    return [];
  }
}

/** Germany 10Y spot curve from ECB SDW (jsondata). */
async function fetchEcbGermany10YHistorical(): Promise<Array<{ date: string; value: number }>> {
  try {
    const res = await fetch(ECB_SDW_DE_10Y_URL, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    if (!res.ok || text.trimStart().startsWith("<")) {
      console.error("[bonds] ECB DE 10Y non-OK", res.status, text.slice(0, 200));
      return [];
    }
    const data = JSON.parse(text) as EcbSdwJsonData;
    const seriesMap = data.dataSets?.[0]?.series ?? {};
    const firstSeries = Object.values(seriesMap)[0];
    const obs = firstSeries?.observations ?? {};
    const dimValues = data.structure?.dimensions?.observation?.[0]?.values ?? [];
    const rows: Array<{ date: string; value: number }> = [];
    for (const [idxStr, valArr] of Object.entries(obs)) {
      const idx = Number.parseInt(idxStr, 10);
      if (!Number.isFinite(idx) || idx < 0) continue;
      const id = dimValues[idx]?.id;
      const raw = Array.isArray(valArr) ? valArr[0] : null;
      const value = toNumber(raw as string | number | null | undefined);
      if (id == null || value == null || !Number.isFinite(value)) continue;
      rows.push({ date: id, value });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));
    return rows;
  } catch (e) {
    console.error("[bonds] ECB DE 10Y error", e);
    return [];
  }
}

export async function GET() {
  console.log("[bonds] route hit, FRED key present:", !!process.env.FRED_API_KEY?.trim());
  const fredKey = process.env.FRED_API_KEY?.trim();
  if (!fredKey) return NextResponse.json({ error: "Missing FRED_API_KEY" }, { status: 500 });
  const newsKey = process.env.NEWSDATA_API_KEY?.trim() ?? "";

  try {
    const today = new Date();
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    const yearAgo = new Date(today);
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const monthAgoStr = monthAgo.toISOString().slice(0, 10);
    const yearAgoStr = yearAgo.toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);
    const uniqueSeries = [...new Set([
      ...CURVE_SERIES.map((x) => x.seriesId),
      ...COUNTRY_CONFIG.flatMap((c) => c.maturities.map((m) => m.seriesId)),
    ])].filter((sid) => !US_TREASURY_DGS_SERIES.has(sid));

    const [
      seriesHistoryEntries,
      treasuryByLabelEntries,
      fedPolicy,
      ecbPolicy,
      bojPolicy,
      boePolicy,
      pbocPolicy,
      vixSnap,
    ] = await Promise.all([
      Promise.all(uniqueSeries.map(async (sid) => [sid, await fredRecentChronological(fredKey, sid, 600)] as const)),
      Promise.all(TREASURY_CURVE_LABELS.map(async (label) => [label, await fetchTreasuryYields(label)] as const)),
      safePolicyRateFetch("fed", fetchFedPolicyRate),
      safePolicyRateFetch("ecb", fetchEcbPolicyRate),
      safePolicyRateFetch("boj", fetchBojPolicyRate),
      safePolicyRateFetch("boe", fetchBoePolicyRate),
      safePolicyRateFetch("pboc", fetchPbocPolicyRate),
      fetchVixFromYahoo(),
    ]);
    const treasuryByCurveLabel = Object.fromEntries(treasuryByLabelEntries) as Record<
      (typeof TREASURY_CURVE_LABELS)[number],
      Array<{ date: string; value: number }>
    >;
    logPolicyRate("fed", fedPolicy);
    logPolicyRate("ecb", ecbPolicy);
    logPolicyRate("boj", bojPolicy);
    logPolicyRate("boe", boePolicy);
    logPolicyRate("pboc", pbocPolicy);

    const seriesHistory = new Map(seriesHistoryEntries);
    for (const m of CURVE_SERIES) {
      const rows = treasuryByCurveLabel[m.label as (typeof TREASURY_CURVE_LABELS)[number]];
      if (rows?.length) seriesHistory.set(m.seriesId, rows);
    }

    const curveCurrentRaw = await Promise.all(
      CURVE_SERIES.map(async (m) => {
        const currentRows = await fredSeriesObservations(fredKey, m.seriesId, 5, "desc", thirtyDaysAgoStr);
        const valuesForMedian = CURVE_SHORT_END_LABELS.has(m.label)
          ? currentRows.map((r) => r.value).filter((v) => v > 0 && v < 8)
          : currentRows.map((r) => r.value);
        const current = median(valuesForMedian);
        const oneMonthAgo = await fredPointAtOrBefore(fredKey, m.seriesId, monthAgoStr);
        const oneYearAgo = await fredPointAtOrBefore(fredKey, m.seriesId, yearAgoStr);
        return { maturity: m.label, current, oneMonthAgo, oneYearAgo };
      }),
    );

    type CurveRow = (typeof curveCurrentRaw)[number];
    function applyTreasuryPillarBackfill(row: CurveRow): CurveRow {
      const hist = treasuryByCurveLabel[row.maturity as (typeof TREASURY_CURVE_LABELS)[number]];
      if (!hist?.length) return row;
      let { current, oneMonthAgo, oneYearAgo } = row;
      if (current == null || !Number.isFinite(current)) {
        const latest = hist.at(-1)?.value;
        if (latest != null && Number.isFinite(latest)) current = latest;
      }
      if (oneMonthAgo == null || !Number.isFinite(oneMonthAgo)) {
        const v = treasuryYieldAtOrBefore(hist, monthAgoStr);
        if (v != null && Number.isFinite(v)) oneMonthAgo = v;
      }
      if (oneYearAgo == null || !Number.isFinite(oneYearAgo)) {
        const v = treasuryYieldAtOrBefore(hist, yearAgoStr);
        if (v != null && Number.isFinite(v)) oneYearAgo = v;
      }
      return { ...row, current, oneMonthAgo, oneYearAgo };
    }

    const curveBackfilled = curveCurrentRaw.map(applyTreasuryPillarBackfill);

    const curveCurrent = curveBackfilled
      .filter((x) => x.current != null && Number.isFinite(x.current))
      .sort((a, b) => CURVE_ORDER.indexOf(a.maturity as (typeof CURVE_ORDER)[number]) - CURVE_ORDER.indexOf(b.maturity as (typeof CURVE_ORDER)[number]));

    const usHistoricalEntries = CURVE_SERIES.map((m) => [m.seriesId, treasuryByCurveLabel[m.label as (typeof TREASURY_CURVE_LABELS)[number]] ?? []] as const);
    const intlHistoricalSpec = [
      ["GBAM10Y", () => fetchWorldBankRates("GB", { mrv: 12, perPage: 12 })] as const,
      ["DEAM10Y", fetchEcbGermany10YHistorical] as const,
      ["INTGSBEJPM193N", () => fetchWorldBankRates("JP")] as const,
      ["INTDSRCNM193N", () => fetchWorldBankRates("CN")] as const,
      ["INTDSRBRM193N", () => fetchWorldBankRates("BR")] as const,
      ["INTDSRINM193N", () => fetchWorldBankRates("IN")] as const,
      ["INTDSRMXM193N", () => fetchWorldBankRates("MX")] as const,
      ["INTDSRZAM193N", () => fetchWorldBankRates("ZA")] as const,
    ];

    const [bondNews, intlHistoricalEntries] = await Promise.all([
      fetchBondNews(newsKey),
      Promise.all(
        intlHistoricalSpec.map(async ([key, fn]) => {
          const rows = await fn();
          console.log(`[bonds] historical intl ${key}: ${rows.length} points`);
          return [key, rows] as const;
        }),
      ),
    ]);

    for (const [sid, rows] of usHistoricalEntries) {
      console.log(`[bonds] historical Treasury ${sid}: ${rows.length} points`);
    }

    const historicalYields = Object.fromEntries([...usHistoricalEntries, ...intlHistoricalEntries]);
    console.log("[bonds] historicalYields keys:", Object.keys(historicalYields));
    console.log("[bonds] sample DGS10 points:", historicalYields.DGS10?.length ?? 0);

    const bondsByCountry = Object.fromEntries(
      COUNTRY_CONFIG.map((country) => {
        const maturities = country.maturities.map((m) => {
          if (country.id === "us") {
            const history = seriesHistory.get(m.seriesId) ?? [];
            const current = history.at(-1)?.value ?? null;
            const dailyPrev = history.length > 1 ? history.at(-2)?.value ?? null : null;
            const weeklyPrev = history.length > 5 ? history.at(-6)?.value ?? null : null;
            return {
              label: m.label,
              seriesId: m.seriesId,
              current,
              dailyChangeBps: diffBps(current, dailyPrev),
              weeklyChangeBps: diffBps(current, weeklyPrev),
              sparkline: history.slice(-30),
            };
          }
          const histKey = INTL_SPARK_HISTORY_KEY[m.seriesId] ?? m.seriesId;
          const history = historicalYields[histKey] ?? [];
          const current = history.at(-1)?.value ?? null;
          const dailyPrev = history.length > 1 ? history.at(-2)?.value ?? null : null;
          const weeklyPrev = history.length > 5 ? history.at(-6)?.value ?? null : null;
          return {
            label: m.label,
            seriesId: m.seriesId,
            current,
            dailyChangeBps: diffBps(current, dailyPrev),
            weeklyChangeBps: diffBps(current, weeklyPrev),
            sparkline: history.slice(-30),
          };
        });
        return [
          country.id,
          {
            id: country.id,
            label: country.label,
            tvSymbol: country.tvSymbol,
            maturities,
          },
        ] as const;
      }),
    );

    const us2 = seriesHistory.get("DGS2") ?? [];
    const us10 = seriesHistory.get("DGS10") ?? [];
    const latest2 = us2.at(-1)?.value ?? null;
    const latest10 = us10.at(-1)?.value ?? null;
    const twoTenSpread = latest10 != null && latest2 != null ? latest10 - latest2 : null;
    const inversionDays = calculateCurveInversionDays(us2, us10);

    const vixValue = vixSnap.value;
    const vixChange = vixSnap.change;

    const sentimentScore = sentimentFromSpreads(twoTenSpread, vixValue);

    const spreads = {
      yieldCurve: {
        value: twoTenSpread,
        change: diffBps(twoTenSpread, (us10.at(-2)?.value ?? 0) - (us2.at(-2)?.value ?? 0)),
        interpretation: spreadInterpretation("Yield Curve", twoTenSpread, inversionDays),
        inversionDays,
      },
      vix: {
        value: vixValue,
        change: vixChange,
        interpretation: vixInterpretation(vixValue),
      },
      tenTwoSpread: {
        value: twoTenSpread,
        change: diffBps(twoTenSpread, (us10.at(-2)?.value ?? 0) - (us2.at(-2)?.value ?? 0)),
        interpretation: tenTwoSpreadInterpretation(twoTenSpread),
      },
    };

    const centralBankRates = {
      fed: centralBankCard("Fed", fedPolicy),
      ecb: centralBankCard("ECB", ecbPolicy),
      boj: centralBankCard("BOJ", bojPolicy),
      boe: centralBankCard("BOE", boePolicy),
      pboc: centralBankCard("PBOC", pbocPolicy),
    };

    console.log("[bonds] response shape check:", {
      hasSpreads: !!spreads,
      hasCentralBankRates: !!centralBankRates,
      hasBondsByCountry: !!bondsByCountry,
      usMaturityCount: bondsByCountry.us?.maturities?.length ?? 0,
      fedRate: centralBankRates.fed?.value,
    });

    return NextResponse.json({
      yieldCurve: {
        current: curveCurrent.map((x) => ({ maturity: x.maturity, value: x.current })),
        monthAgo: curveCurrent.map((x) => ({ maturity: x.maturity, value: x.oneMonthAgo })),
        yearAgo: curveCurrent.map((x) => ({ maturity: x.maturity, value: x.oneYearAgo })),
        shape: twoTenSpread != null && twoTenSpread < 0 ? "Inverted" : "Normal",
        twoTenSpread,
      },
      bondsByCountry,
      spreads,
      sentiment: {
        score: sentimentScore,
        label: sentimentLabel(sentimentScore),
      },
      centralBankRates,
      historicalYields,
      news: bondNews,
      lastUpdated: new Date().toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
