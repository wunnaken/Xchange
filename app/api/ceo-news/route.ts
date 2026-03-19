import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export type CEOArticle = {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  sentiment: "positive" | "neutral" | "negative";
};

const NEGATIVE = /lawsuit|fraud|resign|fired|scandal|investigation|fine|probe|charged|convicted|settlement/i;
const POSITIVE = /record|growth|breakthrough|profit|expansion|award|surge|beat|exceed|strong/i;

function detectSentiment(title: string): "positive" | "neutral" | "negative" {
  if (NEGATIVE.test(title)) return "negative";
  if (POSITIVE.test(title)) return "positive";
  return "neutral";
}

const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map<
  string,
  { data: { articles: CEOArticle[]; overallSentiment: "positive" | "neutral" | "negative" | null }; fetchedAt: number }
>();

const NEWSDATA_BASE = "https://newsdata.io/api/1/news";

async function fetchNewsFromNewsData(
  apiKey: string,
  q: string,
  size: number
): Promise<CEOArticle[]> {
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
    if (!res.ok) return [];
    const data = (await res.json()) as {
      status?: string;
      results?: { title?: string; link?: string; source_name?: string; pubDate?: string }[];
    };
    const raw = data?.status === "success" ? (data?.results ?? []) : [];
    return raw
      .filter((a) => a?.title && a?.link && (a.link.startsWith("http://") || a.link.startsWith("https://")))
      .slice(0, size)
      .map((a) => ({
        title: String(a.title).slice(0, 140),
        url: String(a.link),
        source: (a as { source_name?: string }).source_name ?? "News",
        publishedAt: a.pubDate ?? new Date().toISOString(),
        sentiment: detectSentiment(String(a.title)),
      }));
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim();
  const company = request.nextUrl.searchParams.get("company")?.trim();
  if (!name && !company) return NextResponse.json({ articles: [] }, { status: 400 });

  const apiKey = process.env.NEWSDATA_API_KEY?.trim();
  const ceoName = name ?? "";
  const companyName = company ?? "";
  const cacheKey = `ceo-news:${ceoName}::${companyName}`.toLowerCase();

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) {
    return NextResponse.json(cached.data);
  }

  const queryPrimary = (() => {
    const n = ceoName ? `"${ceoName}"` : "";
    const c = companyName ? `"${companyName} CEO"` : "";
    return [n, c].filter(Boolean).join(" OR ");
  })();

  const queryFallback = [ceoName, companyName].filter(Boolean).join(" ");

  const SENT_TTL_MS = 6 * 60 * 60 * 1000;
  type SentCache = Map<string, { value: "positive" | "neutral" | "negative"; expiresAt: number }>;
  const g = globalThis as unknown as { __xchange_ceo_sentiment_cache?: SentCache };
  const getCache = (): SentCache => {
    if (g.__xchange_ceo_sentiment_cache) return g.__xchange_ceo_sentiment_cache;
    const m: SentCache = new Map();
    g.__xchange_ceo_sentiment_cache = m;
    return m;
  };

  try {
    if (!apiKey) {
      return NextResponse.json({ articles: [], overallSentiment: null });
    }

    let articles = await fetchNewsFromNewsData(apiKey, queryPrimary, 5);
    if (articles.length === 0 && queryFallback.trim()) {
      articles = await fetchNewsFromNewsData(apiKey, queryFallback, 5);
    }

    let overallSentiment: "positive" | "neutral" | "negative" | null = null;
    const sentimentKey = `${ceoName}::${companyName}`.toLowerCase();
    if (articles.length > 0) {
      const cacheMap = getCache();
      const cachedSent = cacheMap.get(sentimentKey);
      if (cachedSent && cachedSent.expiresAt > Date.now()) {
        overallSentiment = cachedSent.value;
      } else if (process.env.ANTHROPIC_API_KEY) {
        try {
          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": process.env.ANTHROPIC_API_KEY,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-20250514",
              max_tokens: 24,
              system:
                "You rate sentiment for a CEO based on headlines. Reply with exactly one word: positive, neutral, or negative.",
              messages: [
                {
                  role: "user",
                  content:
                    `Rate the overall sentiment of these headlines about ${ceoName}.\n\n` +
                    articles.map((a) => `- ${a.title}`).join("\n"),
                },
              ],
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
            const text = (data.content?.[0]?.text ?? "").trim().toLowerCase();
            if (text === "positive" || text === "neutral" || text === "negative") {
              overallSentiment = text;
              cacheMap.set(sentimentKey, { value: text, expiresAt: Date.now() + SENT_TTL_MS });
            }
          }
        } catch {
          // ignore
        }
      }
    }

    const payload = { articles, overallSentiment };
    cache.set(cacheKey, { data: payload, fetchedAt: Date.now() });
    return NextResponse.json(payload);
  } catch {
    if (cached?.data) return NextResponse.json(cached.data);
    return NextResponse.json({ articles: [], overallSentiment: null });
  }
}
