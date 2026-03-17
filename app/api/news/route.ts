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

let lastNewsCache: { articles: MarketNewsArticle[]; fetchedAt: number } | null = null;
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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
    let url = (link && link.trim().startsWith("http")) ? link.trim() : extractFirstUrl(block);
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
  const apiKey = process.env.NEWS_API_KEY?.trim();
  const category = (request.nextUrl.searchParams.get("category") ?? "all").toLowerCase();
  const query = CATEGORY_QUERIES[category] ?? "";

  type RawArticle = { title?: string; description?: string; url?: string; urlToImage?: string; source?: { name?: string }; publishedAt?: string };

  try {
    let raw: RawArticle[] = [];

    if (!apiKey) {
      let fullList: MarketNewsArticle[];
      const rssFirst = await fetchRealHeadlinesFromRss();
      if (rssFirst.length > 0) {
        lastNewsCache = { articles: rssFirst, fetchedAt: Date.now() };
        fullList = rssFirst;
      } else if (lastNewsCache && Date.now() - lastNewsCache.fetchedAt < CACHE_MAX_AGE_MS) {
        fullList = lastNewsCache.articles;
      } else {
        return NextResponse.json({ articles: [], usingLiveFeed: false, fromCache: false });
      }
      const filtered = filterArticlesByCategory(fullList, category);
      return NextResponse.json({
        articles: filtered.length > 0 ? filtered : fullList.slice(0, 10),
        usingLiveFeed: false,
        fromCache: fullList === lastNewsCache?.articles,
      });
    }

    if (apiKey) {
      if (!query || category === "all") {
        const res = await fetch(
          `https://newsapi.org/v2/top-headlines?country=us&category=business&pageSize=20&apiKey=${apiKey}`,
          { next: { revalidate: 0 } }
        );
        if (res.ok) {
          const data = (await res.json()) as { status?: string; articles?: RawArticle[] };
          raw = data?.status !== "error" ? (data?.articles ?? []) : [];
        }
        if (raw.length === 0) {
          const fallback = await fetch(
            `https://newsapi.org/v2/everything?q=business%20OR%20markets%20OR%20stocks&sortBy=publishedAt&pageSize=20&language=en&apiKey=${apiKey}`,
            { next: { revalidate: 0 } }
          );
          if (fallback.ok) {
            const data = (await fallback.json()) as { articles?: RawArticle[] };
            raw = data?.articles ?? [];
          }
        }
      } else {
        const res = await fetch(
          `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=20&language=en&apiKey=${apiKey}`,
          { next: { revalidate: 0 } }
        );
        if (res.ok) {
          const data = (await res.json()) as { articles?: RawArticle[] };
          raw = data?.articles ?? [];
        }
      }
    }

    let articles: MarketNewsArticle[] = raw
      .filter((a) => a?.title && isValidUrl(a.url ?? ""))
      .map((a) => ({
        title: a.title ?? "",
        description: a.description?.trim() || null,
        url: (a.url ?? "").trim(),
        urlToImage: a.urlToImage?.trim() || null,
        source: a.source?.name ?? "—",
        publishedAt: a.publishedAt ?? "",
      }))
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    if (articles.length === 0) {
      const rssFallback = await fetchRealHeadlinesFromRss();
      articles = filterArticlesByCategory(rssFallback, category);
      if (articles.length === 0 && rssFallback.length > 0) articles = rssFallback.slice(0, 10);
    }

    if (articles.length > 0 && raw.length > 0) {
      lastNewsCache = { articles, fetchedAt: Date.now() };
    } else if (articles.length === 0 && lastNewsCache && Date.now() - lastNewsCache.fetchedAt < CACHE_MAX_AGE_MS) {
      articles = filterArticlesByCategory(lastNewsCache.articles, category);
      if (articles.length === 0) articles = lastNewsCache.articles.slice(0, 10);
    }

    return NextResponse.json({
      articles,
      usingLiveFeed: articles.length > 0 && raw.length > 0,
      fromCache: articles.length > 0 && raw.length === 0,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[news API]", message);
    try {
      const fallback = await fetchRealHeadlinesFromRss();
      if (fallback.length > 0) {
        lastNewsCache = { articles: fallback, fetchedAt: Date.now() };
        const filtered = filterArticlesByCategory(fallback, category);
        return NextResponse.json({
          articles: filtered.length > 0 ? filtered : fallback.slice(0, 10),
          usingLiveFeed: false,
          fromCache: false,
        });
      }
      if (lastNewsCache && Date.now() - lastNewsCache.fetchedAt < CACHE_MAX_AGE_MS) {
        const filtered = filterArticlesByCategory(lastNewsCache.articles, category);
        return NextResponse.json({
          articles: filtered.length > 0 ? filtered : lastNewsCache.articles.slice(0, 10),
          usingLiveFeed: false,
          fromCache: true,
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
