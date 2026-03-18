import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type MapNewsArticle = {
  title: string;
  description: string | null;
  source: string;
  url: string;
  publishedAt: string;
};

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const cache = new Map<
  string,
  { articles: MapNewsArticle[]; fetchedAt: number; rateLimited?: boolean }
>();

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

type RawArticle = {
  title?: string;
  description?: string;
  url?: string;
  source?: { name?: string };
  publishedAt?: string;
};

type FetchStrategyResult = {
  articles: MapNewsArticle[];
  status: number;
  apiMessage?: string;
};

async function fetchStrategy(
  apiKey: string,
  q: string,
  pageSize: number
): Promise<FetchStrategyResult> {
  const params = new URLSearchParams({
    q,
    language: "en",
    sortBy: "publishedAt",
    pageSize: String(pageSize),
    apiKey,
  });
  const res = await fetch(`https://newsapi.org/v2/everything?${params.toString()}`, {
    next: { revalidate: 0 },
  });
  const data = (await res.json()) as {
    status?: string;
    message?: string;
    articles?: RawArticle[];
  };
  if (res.status === 429) {
    return { articles: [], status: 429, apiMessage: data?.message };
  }
  if (!res.ok) {
    return { articles: [], status: res.status, apiMessage: data?.message };
  }
  if (data?.status === "error") {
    return { articles: [], status: 500, apiMessage: data?.message };
  }
  const raw = data?.articles ?? [];
  const articles: MapNewsArticle[] = raw
    .filter((a) => a?.title && (a.url?.startsWith("http://") || a.url?.startsWith("https://")))
    .map((a) => ({
      title: a.title ?? "",
      description: a.description?.trim() || null,
      source: a.source?.name ?? "—",
      url: (a.url ?? "").trim(),
      publishedAt: a.publishedAt ?? "",
    }))
    .slice(0, pageSize);
  return { articles, status: res.status, apiMessage: data?.message };
}

// Use same env var as app/api/news/route.ts (NewsAPI key)
const getNewsApiKey = (): string | undefined =>
  process.env.NEWS_API_KEY?.trim() ??
  process.env.NEWSAPI_KEY?.trim() ??
  process.env.NEXT_PUBLIC_NEWS_API_KEY?.trim();

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get("country")?.trim();
  console.log("[map-news] API key present:", !!process.env.NEWS_API_KEY);
  console.log("[map-news] Country requested:", country);
  if (!country) {
    return NextResponse.json({ error: "Missing country" }, { status: 400 });
  }

  const apiKey = getNewsApiKey();
  if (!apiKey) {
    console.log("[map-news] No API key found (tried NEWS_API_KEY, NEWSAPI_KEY, NEXT_PUBLIC_NEWS_API_KEY)");
    return NextResponse.json({
      articles: [],
      message: "No recent market news found for " + country,
    });
  }

  const cacheKey = country.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached) {
    if (cached.rateLimited) {
      return NextResponse.json({
        articles: [],
        message: "News temporarily unavailable — please try again in a moment",
        rateLimited: true,
      });
    }
    if (Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return NextResponse.json({
        articles: cached.articles,
        ...(cached.articles.length === 0 ? { message: "No recent market news found for " + country } : {}),
      });
    }
  }

  const pageSize = 4;

  // Strategy 1: [country] economy OR market OR finance
  let result = await fetchStrategy(
    apiKey,
    `${country} economy OR market OR finance`,
    pageSize
  );
  console.log("[map-news] Strategy 1 result:", {
    status: result.status,
    articleCount: result.articles?.length ?? 0,
    error: result.apiMessage,
  });
  if (result.status === 429) {
    cache.set(cacheKey, { articles: [], fetchedAt: Date.now(), rateLimited: true });
    return NextResponse.json({
      articles: [],
      message: "News temporarily unavailable — please try again in a moment",
      rateLimited: true,
    });
  }
  if (result.articles.length >= 2) {
    cache.set(cacheKey, { articles: result.articles, fetchedAt: Date.now() });
    return NextResponse.json({ articles: result.articles });
  }

  // Strategy 2: broader — just [country]
  result = await fetchStrategy(apiKey, country, pageSize);
  console.log("[map-news] Strategy 2 result:", {
    status: result.status,
    articleCount: result.articles?.length ?? 0,
    error: result.apiMessage,
  });
  if (result.status === 429) {
    cache.set(cacheKey, { articles: [], fetchedAt: Date.now(), rateLimited: true });
    return NextResponse.json({
      articles: [],
      message: "News temporarily unavailable — please try again in a moment",
      rateLimited: true,
    });
  }
  if (result.articles.length >= 2) {
    cache.set(cacheKey, { articles: result.articles, fetchedAt: Date.now() });
    return NextResponse.json({ articles: result.articles });
  }

  // Strategy 3: country-specific topic query
  const topicQuery = getTopicQuery(country);
  result = await fetchStrategy(apiKey, topicQuery, pageSize);
  console.log("[map-news] Strategy 3 result:", {
    status: result.status,
    articleCount: result.articles?.length ?? 0,
    error: result.apiMessage,
    topicQuery,
  });
  if (result.status === 429) {
    cache.set(cacheKey, { articles: [], fetchedAt: Date.now(), rateLimited: true });
    return NextResponse.json({
      articles: [],
      message: "News temporarily unavailable — please try again in a moment",
      rateLimited: true,
    });
  }

  const articles = result.articles.length > 0 ? result.articles : [];
  cache.set(cacheKey, { articles, fetchedAt: Date.now() });

  return NextResponse.json({
    articles,
    ...(articles.length === 0 ? { message: "No recent market news found for " + country } : {}),
  });
}
