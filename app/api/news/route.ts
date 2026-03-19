import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type MarketNewsArticle = {
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  source: string;
  publishedAt: string;
};

const CATEGORY_QUERIES: Record<string, string> = {
  all: "",
  markets: "stock market OR equities",
  crypto: "cryptocurrency OR bitcoin",
  macro: "Federal Reserve OR inflation OR GDP",
  geopolitical: "geopolitical OR sanctions OR trade war",
  earnings: "earnings OR revenue OR EPS",
};

/** Filter articles by category using keyword match on title/description (for RSS or when News API has no results). */
function filterArticlesByCategory(
  articles: MarketNewsArticle[],
  category: string
): MarketNewsArticle[] {
  if (category === "all" || !category) return articles;
  const query = CATEGORY_QUERIES[category];
  if (!query) return articles;
  const terms = query
    .split(/\s+OR\s+/i)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (terms.length === 0) return articles;
  return articles.filter((a) => {
    const text = `${a.title ?? ""} ${a.description ?? ""}`.toLowerCase();
    return terms.some((term) => text.includes(term));
  });
}

const RSS_FEEDS = [
  "https://feeds.reuters.com/reuters/businessNews",
  "https://feeds.reuters.com/reuters/topNews",
  "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TldnU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en",
  "https://feeds.bbci.co.uk/news/business/rss.xml",
];

const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map<
  string,
  { data: MarketNewsArticle[]; fetchedAt: number }
>();

const NEWSDATA_BASE = "https://newsdata.io/api/1/news";

type NewsDataResult = {
  title?: string;
  description?: string;
  link?: string;
  source_name?: string;
  pubDate?: string;
  image_url?: string;
};

function normalizeNewsDataResult(r: NewsDataResult): MarketNewsArticle | null {
  const url = (r.link ?? "").trim();
  if (!r?.title || !url.startsWith("http")) return null;
  return {
    title: String(r.title),
    description: (r.description ?? "").trim() || null,
    url,
    urlToImage: (r.image_url ?? "").trim() || null,
    source: (r.source_name ?? "—").trim(),
    publishedAt: r.pubDate ?? new Date().toISOString(),
  };
}

async function fetchFromNewsData(
  apiKey: string,
  q: string,
  size: number
): Promise<MarketNewsArticle[]> {
  const params = new URLSearchParams({
    apikey: apiKey,
    q: q || "business OR markets OR stocks",
    language: "en",
    size: String(size),
  });
  const res = await fetch(`${NEWSDATA_BASE}?${params.toString()}`, {
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json()) as {
    status?: string;
    totalResults?: number;
    results?: NewsDataResult[];
  };
  if (!res.ok || data?.status !== "success") return [];
  const raw = Array.isArray(data?.results) ? data.results : [];
  return raw
    .map(normalizeNewsDataResult)
    .filter((a): a is MarketNewsArticle => a != null)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

function isValidUrl(url: string): boolean {
  return typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"));
}

function extractFirstUrl(block: string): string | null {
  const hrefMatch = /<link[^>]+href=["']([^"']+)["']/i.exec(block);
  if (hrefMatch) return hrefMatch[1].trim();
  const linkTag = /<link[^>]*>([^<]+)<\/link>/i.exec(block);
  if (linkTag && linkTag[1].trim().startsWith("http")) return linkTag[1].trim();
  const guidTag = /<guid[^>]*>([^<]+)<\/guid>/i.exec(block);
  if (guidTag && guidTag[1].trim().startsWith("http")) return guidTag[1].trim();
  const anyUrl = /https?:\/\/[^\s<"']+/i.exec(block);
  return anyUrl ? anyUrl[0].trim() : null;
}

function parseRssItem(xml: string, sourceName = "News"): MarketNewsArticle[] {
  const articles: MarketNewsArticle[] = [];
  const getTag = (blob: string, tag: string): string | null => {
    const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i").exec(blob);
    if (!m) return null;
    return m[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .trim();
  };

  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml)) !== null && articles.length < 20) {
    const block = m[1];
    const title = getTag(block, "title");
    const link = getTag(block, "link") || getTag(block, "guid");
    const pubDate = getTag(block, "pubDate");
    const description = getTag(block, "description");
    const url = (link && link.trim().startsWith("http")) ? link.trim() : extractFirstUrl(block);
    if (title && url && (url.startsWith("http://") || url.startsWith("https://"))) {
      articles.push({
        title,
        description: description || null,
        url,
        urlToImage: null,
        source: sourceName,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      });
    }
  }

  const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
  let em: RegExpExecArray | null;
  while ((em = entryRegex.exec(xml)) !== null && articles.length < 20) {
    const block = em[1];
    const title = getTag(block, "title");
    const pubDate = getTag(block, "published") || getTag(block, "updated");
    const url = extractFirstUrl(block);
    if (title && url) {
      articles.push({
        title,
        description: getTag(block, "summary") || null,
        url,
        urlToImage: null,
        source: sourceName,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      });
    }
  }

  return articles.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

async function fetchRealHeadlinesFromRss(opts?: RequestInit): Promise<MarketNewsArticle[]> {
  const defaultOpts: RequestInit = {
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(12000),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; XchangeNews/1.0; +https://xchange.app)" },
  };
  const fetchOpts = { ...defaultOpts, ...opts };
  const sourceNames: Record<string, string> = {
    "reuters.com": "Reuters",
    "google.com": "Google News",
    "bbci.co.uk": "BBC",
  };
  for (const feedUrl of RSS_FEEDS) {
    try {
      const res = await fetch(feedUrl, fetchOpts);
      if (!res.ok) continue;
      const xml = await res.text();
      const source = Object.keys(sourceNames).find((k) => feedUrl.includes(k));
      const articles = parseRssItem(xml, source ? sourceNames[source] : "News");
      if (articles.length > 0) return articles.slice(0, 20);
    } catch {
      continue;
    }
  }
  return [];
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.NEWSDATA_API_KEY?.trim();
  const category = (request.nextUrl.searchParams.get("category") ?? "all").toLowerCase();
  const query = CATEGORY_QUERIES[category] ?? "";
  const cacheKey = `news:${category}`;

  try {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_MS) {
      return NextResponse.json({
        articles: cached.data,
        usingLiveFeed: true,
        fromCache: true,
      });
    }

    if (!apiKey) {
      const rssFirst = await fetchRealHeadlinesFromRss();
      if (rssFirst.length > 0) {
        const filtered = filterArticlesByCategory(rssFirst, category);
        return NextResponse.json({
          articles: filtered.length > 0 ? filtered : rssFirst.slice(0, 10),
          usingLiveFeed: false,
          fromCache: false,
        });
      }
      return NextResponse.json({ articles: [], usingLiveFeed: false, fromCache: false });
    }

    const searchQ = query && category !== "all" ? query : "business OR markets OR stocks";
    let articles = await fetchFromNewsData(apiKey, searchQ, 20);

    if (articles.length === 0 && (category === "all" || !query)) {
      articles = await fetchFromNewsData(apiKey, "business OR markets", 20);
    }

    if (articles.length === 0) {
      const rssFallback = await fetchRealHeadlinesFromRss();
      articles = filterArticlesByCategory(rssFallback, category);
      if (articles.length === 0 && rssFallback.length > 0) articles = rssFallback.slice(0, 10);
    } else {
      articles = filterArticlesByCategory(articles, category);
      if (articles.length === 0 && cached?.data?.length) {
        articles = cached.data.slice(0, 10);
      }
      cache.set(cacheKey, { data: articles, fetchedAt: Date.now() });
    }

    return NextResponse.json({
      articles,
      usingLiveFeed: articles.length > 0,
      fromCache: false,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[news API]", message);
    const cached = cache.get(cacheKey);
    if (cached && cached.data.length > 0) {
      const filtered = filterArticlesByCategory(cached.data, category);
      return NextResponse.json({
        articles: filtered.length > 0 ? filtered : cached.data.slice(0, 10),
        usingLiveFeed: true,
        fromCache: true,
      });
    }
    try {
      const fallback = await fetchRealHeadlinesFromRss();
      if (fallback.length > 0) {
        const filtered = filterArticlesByCategory(fallback, category);
        return NextResponse.json({
          articles: filtered.length > 0 ? filtered : fallback.slice(0, 10),
          usingLiveFeed: false,
          fromCache: false,
        });
      }
    } catch {
      // ignore
    }
    return NextResponse.json(
      { articles: [] as MarketNewsArticle[], usingLiveFeed: false, error: message },
      { status: 500 }
    );
  }
}
