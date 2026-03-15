import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export type CEOLegalItem = {
  date: string;
  headline: string;
  url: string;
  source: string;
  active: boolean;
};

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim();
  if (!name) return NextResponse.json({ items: [] }, { status: 400 });

  const apiKey = process.env.NEWS_API_KEY?.trim();
  const q = `"${name}" (lawsuit OR investigation OR fraud OR SEC OR DOJ)`;
  const params = new URLSearchParams({
    q: q.slice(0, 200),
    sortBy: "publishedAt",
    pageSize: "10",
    language: "en",
    apiKey: apiKey || "",
  });

  try {
    if (!apiKey) return NextResponse.json({ items: [] });
    const res = await fetch(
      `https://newsapi.org/v2/everything?${params.toString()}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return NextResponse.json({ items: [] });
    const data = (await res.json()) as { status?: string; articles?: { title?: string; url?: string; source?: { name?: string }; publishedAt?: string }[] };
    const raw = data?.status !== "error" ? data?.articles ?? [] : [];
    const activeWords = /investigation|probe|charged|subpoena|lawsuit filed/i;
    const items: CEOLegalItem[] = raw
      .filter((a) => a?.title && a?.url)
      .slice(0, 10)
      .map((a) => ({
        date: (a.publishedAt ?? "").slice(0, 10),
        headline: String(a.title).slice(0, 150),
        url: String(a.url),
        source: (a.source as { name?: string })?.name ?? "News",
        active: activeWords.test(String(a.title)),
      }));
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
