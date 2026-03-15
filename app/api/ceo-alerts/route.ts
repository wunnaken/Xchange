import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export type CEOAlertItem = {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  matchedTicker?: string;
};

export async function GET() {
  const apiKey = process.env.NEWS_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ count: 0, alerts: [] });

  const from = new Date();
  from.setDate(from.getDate() - 30);
  const params = new URLSearchParams({
    q: "CEO replaced OR new CEO OR steps down OR appointed CEO OR CEO resign",
    from: from.toISOString().split("T")[0],
    sortBy: "publishedAt",
    pageSize: "30",
    language: "en",
    apiKey,
  });

  try {
    const res = await fetch(
      `https://newsapi.org/v2/everything?${params.toString()}`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return NextResponse.json({ count: 0, alerts: [] });
    const data = (await res.json()) as { status?: string; articles?: { title?: string; url?: string; source?: { name?: string }; publishedAt?: string }[] };
    const raw = data?.status !== "error" ? data?.articles ?? [] : [];
    const alerts: CEOAlertItem[] = raw
      .filter((a) => a?.title && a?.url)
      .slice(0, 20)
      .map((a) => ({
        title: String(a.title),
        url: String(a.url),
        source: (a.source as { name?: string })?.name ?? "News",
        publishedAt: a.publishedAt ?? new Date().toISOString(),
      }));
    return NextResponse.json({ count: alerts.length, alerts });
  } catch {
    return NextResponse.json({ count: 0, alerts: [] });
  }
}
