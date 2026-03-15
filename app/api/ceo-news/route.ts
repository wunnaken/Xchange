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

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim();
  const company = request.nextUrl.searchParams.get("company")?.trim();
  if (!name && !company) return NextResponse.json({ articles: [] }, { status: 400 });

  const apiKey = process.env.NEWS_API_KEY?.trim();
  const q = [name, company].filter(Boolean).join(" OR ") + " CEO";
  const params = new URLSearchParams({
    q: q.slice(0, 200),
    sortBy: "publishedAt",
    pageSize: "4",
    language: "en",
    apiKey: apiKey || "",
  });

  try {
    if (!apiKey) {
      return NextResponse.json({ articles: [] });
    }
    const res = await fetch(
      `https://newsapi.org/v2/everything?${params.toString()}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return NextResponse.json({ articles: [] });
    const data = (await res.json()) as { status?: string; articles?: { title?: string; url?: string; source?: { name?: string }; publishedAt?: string }[] };
    const raw = data?.status !== "error" ? data?.articles ?? [] : [];
    const articles: CEOArticle[] = raw
      .filter((a) => a?.title && a?.url && (a.url.startsWith("http://") || a.url.startsWith("https://")))
      .slice(0, 4)
      .map((a) => ({
        title: String(a.title).slice(0, 120),
        url: String(a.url),
        source: (a.source as { name?: string })?.name ?? "News",
        publishedAt: a.publishedAt ?? new Date().toISOString(),
        sentiment: detectSentiment(String(a.title)),
      }));
    return NextResponse.json({ articles });
  } catch {
    return NextResponse.json({ articles: [] });
  }
}
