import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export type CEOLegalItem = {
  date: string;
  headline: string;
  url: string;
  source: string;
  active: boolean;
};

const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { data: CEOLegalItem[]; fetchedAt: number }>();

const NEWSDATA_BASE = "https://newsdata.io/api/1/news";

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim();
  if (!name) return NextResponse.json({ items: [] }, { status: 400 });

  const apiKey = process.env.NEWSDATA_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ items: [] });

  const cacheKey = `ceo-legal:${name}`.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) {
    return NextResponse.json({ items: cached.data });
  }

  const q = `"${name}" (lawsuit OR investigation OR fraud OR SEC OR DOJ)`;
  const params = new URLSearchParams({
    apikey: apiKey,
    q: q.slice(0, 200),
    language: "en",
    size: "10",
  });

  try {
    const res = await fetch(`${NEWSDATA_BASE}?${params.toString()}`, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      if (cached?.data) return NextResponse.json({ items: cached.data });
      return NextResponse.json({ items: [] });
    }
    const data = (await res.json()) as {
      status?: string;
      results?: { title?: string; link?: string; source_name?: string; pubDate?: string }[];
    };
    const raw = data?.status === "success" ? (data?.results ?? []) : [];
    const activeWords = /investigation|probe|charged|subpoena|lawsuit filed/i;
    const items: CEOLegalItem[] = raw
      .filter((r) => r?.title && r?.link)
      .slice(0, 10)
      .map((r) => ({
        date: (r.pubDate ?? "").slice(0, 10),
        headline: String(r.title).slice(0, 150),
        url: String(r.link),
        source: (r as { source_name?: string }).source_name ?? "News",
        active: activeWords.test(String(r.title)),
      }));
    cache.set(cacheKey, { data: items, fetchedAt: Date.now() });
    return NextResponse.json({ items });
  } catch {
    if (cached?.data) return NextResponse.json({ items: cached.data });
    return NextResponse.json({ items: [] });
  }
}
