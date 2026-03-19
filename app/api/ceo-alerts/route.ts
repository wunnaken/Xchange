import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export type CEOAlertItem = {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  company?: string;
  matchedTicker?: string;
};

type SupabaseCeoAlertRow = {
  company: string;
  ticker: string;
  headline: string;
  description: string | null;
  url: string;
  published_at: string;
  source: string | null;
  detected_at: string;
};

function normalizeTicker(t: string): string | null {
  const s = t.trim().toUpperCase();
  if (!s) return null;
  if (!/^[A-Z0-9.\-]+$/.test(s)) return null;
  return s;
}

function extractTickers(payload: unknown): string[] {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (!v) return;
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    if (typeof v === "object") {
      const obj = v as Record<string, unknown>;
      for (const key of ["symbol", "ticker", "constituent"]) {
        const maybe = obj[key];
        if (typeof maybe === "string") {
          const n = normalizeTicker(maybe);
          if (n) out.add(n);
        }
      }
      for (const key of ["constituents", "components", "members", "data"]) {
        if (Array.isArray(obj[key])) walk(obj[key]);
      }
    }
  };
  walk(payload);
  return Array.from(out);
}

async function fetchConstituents(symbol: string, token: string, from: string, to: string) {
  const candidates = [
    `https://finnhub.io/api/v1/indices-constituents?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${encodeURIComponent(token)}`,
    `https://finnhub.io/api/v1/index/constituents?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${encodeURIComponent(token)}`,
    `https://finnhub.io/api/v1/indices-constituents?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(token)}`,
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store", next: { revalidate: 0 } });
      if (!res.ok) continue;
      const data = await res.json();
      const tickers = extractTickers(data);
      if (tickers.length > 0) return tickers;
    } catch (error) {
      console.error("[ceo-alerts] Error (finnhub constituents fetch):", error);
    }
  }
  return [];
}

const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map<
  string,
  { data: { count: number; alerts: CEOAlertItem[]; weekly: CEOAlertItem[] }; fetchedAt: number }
>();

const NEWSDATA_BASE = "https://newsdata.io/api/1/news";

export async function GET(request: NextRequest) {
  const index = request.nextUrl.searchParams.get("index")?.trim().toLowerCase();
  if (index) {
    const finnhubKey = process.env.FINNHUB_API_KEY?.trim();
    if (!finnhubKey) return NextResponse.json({ tickers: [], error: "FINNHUB_API_KEY not set" }, { status: 500 });

    const indexToSymbol: Record<string, string> = {
      spy500: "^GSPC",
      qqq100: "^NDX",
      dow30: "^DJI",
      nasdaq100: "^NDX",
      dji: "^DJI",
      gspc: "^GSPC",
    };
    const finnhubSymbol = indexToSymbol[index];
    if (!finnhubSymbol) return NextResponse.json({ tickers: [], error: "Invalid index" }, { status: 400 });

    const now = new Date();
    const fromDate = new Date(now);
    fromDate.setFullYear(fromDate.getFullYear() - 2);
    const from = fromDate.toISOString().slice(0, 10);
    const to = now.toISOString().slice(0, 10);

    const tickers = await fetchConstituents(finnhubSymbol, finnhubKey, from, to);
    return NextResponse.json({ tickers });
  }

  const apiKey = process.env.NEWSDATA_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ count: 0, alerts: [], weekly: [] });
  }

  const cacheKey = "ceo-alerts";
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) {
    return NextResponse.json(cached.data);
  }

  const companyMap: Record<string, string> = {
    Apple: "AAPL",
    Microsoft: "MSFT",
    Tesla: "TSLA",
    Nvidia: "NVDA",
    Amazon: "AMZN",
    Google: "GOOGL",
    Alphabet: "GOOGL",
    Meta: "META",
    Facebook: "META",
    JPMorgan: "JPM",
    "JP Morgan": "JPM",
    Goldman: "GS",
    Disney: "DIS",
    Netflix: "NFLX",
    Walmart: "WMT",
    Exxon: "XOM",
    Chevron: "CVX",
    Johnson: "JNJ",
    Pfizer: "PFE",
    Nike: "NKE",
    Starbucks: "SBUX",
    Uber: "UBER",
    Coinbase: "COIN",
    Robinhood: "HOOD",
    Ford: "F",
    GM: "GM",
    Boeing: "BA",
    Caterpillar: "CAT",
    Salesforce: "CRM",
    Oracle: "ORCL",
    Adobe: "ADBE",
    Intel: "INTC",
    AMD: "AMD",
    Qualcomm: "QCOM",
    "Bank of America": "BAC",
    "Wells Fargo": "WFC",
    "Morgan Stanley": "MS",
    BlackRock: "BLK",
    Visa: "V",
    Mastercard: "MA",
  };

  try {
    const params = new URLSearchParams({
      apikey: apiKey,
      q: 'CEO replaced OR "new CEO" OR "steps down" OR "appointed CEO" OR "resigns as CEO" OR "named CEO"',
      language: "en",
      size: "20",
    });

    let res = await fetch(`${NEWSDATA_BASE}?${params.toString()}`, {
      cache: "no-store",
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 429) {
      if (cached?.data) return NextResponse.json(cached.data);
      return NextResponse.json({ count: 0, alerts: [], weekly: [] });
    }

    const data = res.ok
      ? ((await res.json()) as {
          status?: string;
          totalResults?: number;
          results?: { title?: string; description?: string; link?: string; source_name?: string; pubDate?: string }[];
        })
      : null;

    const raw = data?.status === "success" ? (data?.results ?? []) : [];

    const matchedAlerts = raw
      .filter((a) => a?.title && a?.link)
      .map((a) => {
        const title = String(a.title ?? "");
        const description = a?.description ? String(a.description) : "";
        const hay = (title + " " + description).toLowerCase();
        for (const [company, ticker] of Object.entries(companyMap)) {
          if (hay.includes(company.toLowerCase())) {
            return {
              company,
              ticker,
              headline: title,
              description: description || null,
              url: String(a.link),
              published_at: a.pubDate ?? new Date().toISOString(),
              source: (a as { source_name?: string }).source_name ?? null,
              detected_at: new Date().toISOString(),
            } satisfies SupabaseCeoAlertRow;
          }
        }
        return null;
      })
      .filter((x): x is SupabaseCeoAlertRow => Boolean(x));

    try {
      const admin = createServerClient();
      for (const m of matchedAlerts) {
        const { data: existing } = await admin
          .from("ceo_alerts")
          .select("headline")
          .eq("headline", m.headline)
          .maybeSingle();
        if (!existing) {
          await admin.from("ceo_alerts").insert(m);
        }
      }
    } catch (error) {
      console.error("[ceo-alerts] Error (supabase insert):", error);
    }

    try {
      const admin = createServerClient();
      const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [{ data: recent }, { data: weekly }] = await Promise.all([
        admin.from("ceo_alerts").select("*").order("detected_at", { ascending: false }).limit(5),
        admin.from("ceo_alerts").select("*").gte("detected_at", weekAgoIso).order("detected_at", { ascending: false }).limit(10),
      ]);

      const toItem = (r: Partial<SupabaseCeoAlertRow>): CEOAlertItem => ({
        title: String(r.headline ?? ""),
        url: String(r.url ?? ""),
        source: String(r.source ?? "News"),
        publishedAt: String(r.published_at ?? r.detected_at ?? new Date().toISOString()),
        company: typeof r.company === "string" ? r.company : undefined,
        matchedTicker: String(r.ticker ?? "").toUpperCase(),
      });

      const recentItems = Array.isArray(recent) ? (recent as Partial<SupabaseCeoAlertRow>[]).map(toItem) : [];
      const weeklyItems = Array.isArray(weekly) ? (weekly as Partial<SupabaseCeoAlertRow>[]).map(toItem) : [];

      const payload = { count: recentItems.length, alerts: recentItems, weekly: weeklyItems };
      cache.set(cacheKey, { data: payload, fetchedAt: Date.now() });
      return NextResponse.json(payload);
    } catch (error) {
      console.error("[ceo-alerts] Error (supabase read):", error);
      const fallbackItems: CEOAlertItem[] = matchedAlerts.slice(0, 20).map((m) => ({
        title: m.headline,
        url: m.url,
        source: m.source ?? "News",
        publishedAt: m.published_at,
        company: m.company,
        matchedTicker: m.ticker,
      }));
      const payload = { count: fallbackItems.length, alerts: fallbackItems, weekly: fallbackItems.slice(0, 10) };
      cache.set(cacheKey, { data: payload, fetchedAt: Date.now() });
      return NextResponse.json(payload);
    }
  } catch (error) {
    console.error("[ceo-alerts] Error:", error);
    const cached = cache.get("ceo-alerts");
    if (cached?.data) return NextResponse.json(cached.data);
    return NextResponse.json({ count: 0, alerts: [], weekly: [] });
  }
}
