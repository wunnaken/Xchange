import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type MapNewsArticle = {
  title: string;
  description: string | null;
  source: string;
  url: string;
  publishedAt: string;
  image_url?: string | null;
};

const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map<
  string,
  { data: MapNewsArticle[]; fetchedAt: number }
>();

const NEWSDATA_BASE = "https://newsdata.io/api/1/news";

/** Strategy 3: country → search query for main index/topics */
const COUNTRY_TOPICS: Record<string, string> = {
  USA: "S&P 500 OR Federal Reserve OR US economy",
  "United States": "S&P 500 OR Federal Reserve OR US economy",
  China: "China economy OR Shanghai OR PBOC",
  Germany: "Germany economy OR DAX OR Bundesbank",
  "United Kingdom": "UK economy OR FTSE OR Bank of England",
  UK: "UK economy OR FTSE OR Bank of England",
  Japan: "Japan economy OR Nikkei OR BOJ",
  France: "France economy OR CAC",
  India: "India economy OR Nifty OR RBI",
  Brazil: "Brazil economy OR Bovespa",
  Canada: "Canada economy OR TSX OR Bank of Canada",
  Australia: "Australia economy OR ASX OR RBA",
};

function getTopicQuery(country: string): string {
  const normalized = country.trim();
  return COUNTRY_TOPICS[normalized] ?? `${normalized} economy`;
}

type NewsDataResult = {
  title?: string;
  description?: string;
  link?: string;
  source_name?: string;
  pubDate?: string;
  image_url?: string;
};

async function fetchFromNewsData(
  apiKey: string,
  q: string,
  size: number
): Promise<{ articles: MapNewsArticle[]; status: number }> {
  try {
    const params = new URLSearchParams({
      apikey: apiKey,
      q: q.slice(0, 200),
      language: "en",
      size: String(size),
    });
    const res = await fetch(`${NEWSDATA_BASE}?${params.toString()}`, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(12000),
    });
    const data = (await res.json()) as {
      status?: string;
      results?: NewsDataResult[];
    };
    if (res.status === 429 || !res.ok) {
      return { articles: [], status: res.status };
    }
    if (data?.status !== "success") {
      return { articles: [], status: 500 };
    }
    const raw = Array.isArray(data?.results) ? data.results : [];
    const articles: MapNewsArticle[] = raw
      .filter((r) => r?.title && (r.link?.startsWith("http://") || r.link?.startsWith("https://")))
      .map((r) => ({
        title: String(r.title ?? ""),
        description: (r.description ?? "").trim() || null,
        source: (r.source_name ?? "—").trim(),
        url: (r.link ?? "").trim(),
        publishedAt: r.pubDate ?? new Date().toISOString(),
        image_url: (r.image_url ?? "").trim() || null,
      }))
      .slice(0, size);
    return { articles, status: res.status };
  } catch {
    return { articles: [], status: 500 };
  }
}

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get("country")?.trim();
  if (!country) {
    return NextResponse.json({ error: "Missing country" }, { status: 400 });
  }

  const apiKey = process.env.NEWSDATA_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({
      articles: [],
      message: "No recent market news found for " + country,
    });
  }

  const cacheKey = country.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) {
    return NextResponse.json({
      articles: cached.data,
      ...(cached.data.length === 0 ? { message: "No recent market news found for " + country } : {}),
    });
  }

  const size = 4;

  let result = await fetchFromNewsData(
    apiKey,
    `${country} economy OR market OR finance`,
    size
  );
  if (result.status === 429 && cached?.data?.length) {
    return NextResponse.json({ articles: cached.data });
  }
  if (result.articles.length >= 2) {
    cache.set(cacheKey, { data: result.articles, fetchedAt: Date.now() });
    return NextResponse.json({ articles: result.articles });
  }

  result = await fetchFromNewsData(apiKey, country, size);
  if (result.status === 429 && cached?.data?.length) {
    return NextResponse.json({ articles: cached.data });
  }
  if (result.articles.length >= 2) {
    cache.set(cacheKey, { data: result.articles, fetchedAt: Date.now() });
    return NextResponse.json({ articles: result.articles });
  }

  const topicQuery = getTopicQuery(country);
  result = await fetchFromNewsData(apiKey, topicQuery, size);
  if (result.status === 429 && cached?.data?.length) {
    return NextResponse.json({ articles: cached.data });
  }

  const articles = result.articles.length > 0 ? result.articles : [];
  cache.set(cacheKey, { data: articles, fetchedAt: Date.now() });

  return NextResponse.json({
    articles,
    ...(articles.length === 0 ? { message: "No recent market news found for " + country } : {}),
  });
}
