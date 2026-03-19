import { NextRequest, NextResponse } from "next/server";
import { countryToIso, countryToIsoLoose, countryToIso3, countryToIndexSymbol } from "../../../lib/country-mapping";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type NewsItem = { title: string; source: string; url: string; publishedAt: string };
type MarketSnapshot = { indexName: string; price: number; change: number; changePercent: number } | null;

/** World Bank: GDP growth (annual %) — no API key, free. */
const WB_INDICATOR_GDP_GROWTH = "NY.GDP.MKTP.KD.ZG";

type GdpGrowthPoint = { year: string; value: number | null };

async function fetchWorldBankGdpGrowth(iso3: string): Promise<{ latestYear: string; latestValue: number | null; history: GdpGrowthPoint[] } | null> {
  try {
    const url = `https://api.worldbank.org/v2/country/${iso3}/indicator/${WB_INDICATOR_GDP_GROWTH}?format=json&per_page=8&mrv=8`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length < 2) return null;
    const series = data[1] as Array<{ date: string; value: number | null }>;
    if (!series?.length) return null;
    const history: GdpGrowthPoint[] = series.map((d) => ({ year: d.date, value: d.value }));
    const latest = history.find((h) => h.value != null);
    return {
      latestYear: latest?.year ?? history[0]?.year ?? "",
      latestValue: latest?.value ?? null,
      history,
    };
  } catch {
    return null;
  }
}

async function fetchFinnhubQuote(symbol: string, token: string): Promise<MarketSnapshot> {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.c == null || data.d == null || data.dp == null) return null;
    return {
      indexName: symbol,
      price: data.c,
      change: data.d,
      changePercent: data.dp,
    };
  } catch {
    return null;
  }
}

const NEWSDATA_BASE = "https://newsdata.io/api/1/news";

/** Fetch headlines from NewsData.io (q=country or topic). */
async function fetchNewsDataSearch(query: string, apiKey: string, limit = 5): Promise<NewsItem[]> {
  try {
    const params = new URLSearchParams({
      apikey: apiKey,
      q: query.slice(0, 200),
      language: "en",
      size: String(limit),
    });
    const res = await fetch(`${NEWSDATA_BASE}?${params.toString()}`, { next: { revalidate: 0 }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json() as { status?: string; results?: { title?: string; link?: string; source_name?: string; pubDate?: string }[] };
    const raw = data?.status === "success" ? (data?.results ?? []) : [];
    return raw
      .filter((r) => r?.title && r?.link)
      .map((r) => ({
        title: r.title ?? "",
        source: (r as { source_name?: string }).source_name ?? "—",
        url: r.link ?? "#",
        publishedAt: r.pubDate ?? "",
      }));
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get("country");
  const full = request.nextUrl.searchParams.get("full") === "true";

  if (!country?.trim()) {
    return NextResponse.json(
      { error: "Missing country" },
      { status: 400 }
    );
  }

  const iso = countryToIsoLoose(country);
  const iso3 = countryToIso3(country);
  const indexSymbol = countryToIndexSymbol(country);
  const finnhubKey = process.env.FINNHUB_API_KEY ?? "";
  const newsKey = process.env.NEWSDATA_API_KEY ?? "";

  let market: MarketSnapshot = null;
  if (finnhubKey && indexSymbol) {
    market = await fetchFinnhubQuote(indexSymbol, finnhubKey);
  }

  let news: NewsItem[] = [];
  if (newsKey && country.trim()) {
    news = await fetchNewsDataSearch(country.trim(), newsKey, 5);
    if (news.length === 0) {
      news = await fetchNewsDataSearch(`${country.trim()} news`, newsKey, 5);
    }
  }

  let projections: {
    gdpGrowth: { latestYear: string; latestValue: number | null; history: GdpGrowthPoint[] } | null;
    source: string;
    disclaimer: string;
  } | undefined;
  if (full) {
    const gdpGrowth = iso3 ? await fetchWorldBankGdpGrowth(iso3) : null;
    projections = {
      gdpGrowth: gdpGrowth ?? null,
      source: "World Bank",
      disclaimer: "Latest reported GDP growth (annual %). For forward projections see IMF World Economic Outlook.",
    };
  }

  let elections: NewsItem[] = [];
  let political: NewsItem[] = [];
  const trustedSources = process.env.NEWS_SOURCES ?? ""; // e.g. "reuters,associated-press,bbc-news"
  if (full && newsKey) {
    const [electionRes, politicalRes] = await Promise.all([
      fetchNewsApiSearch(`election ${country}`, newsKey, 4, trustedSources),
      fetchNewsApiSearch(`politics ${country}`, newsKey, 4, trustedSources),
    ]);
    elections = electionRes;
    political = politicalRes;
  }

  return NextResponse.json({
    country: country.trim(),
    iso: iso ?? undefined,
    market,
    news,
    ...(full ? { elections, political, projections } : {}),
  });
}
