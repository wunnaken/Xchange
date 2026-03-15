import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type EarningsItem = {
  id: string;
  ticker: string;
  name: string;
  date: string;
  epsEstimate: number | null;
  revenueEstimate: number | null;
  epsActual: number | null;
  revenueActual: number | null;
  bmoAmc: "BMO" | "AMC" | null;
};

export type EconomicItem = {
  id: string;
  name: string;
  date: string;
  dateTimeET: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  country: string;
  previous?: string;
  estimate?: string;
  actual?: string;
};

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type"); // "earnings" | "economic"
  const from = request.nextUrl.searchParams.get("from"); // YYYY-MM-DD
  const to = request.nextUrl.searchParams.get("to"); // YYYY-MM-DD
  const token = process.env.FINNHUB_API_KEY;
  if (!token) {
    return NextResponse.json(
      { earnings: [], economic: [], error: "FINNHUB_API_KEY not set" },
      { status: 200 }
    );
  }
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date();
  if (!from) fromDate.setDate(fromDate.getDate());
  if (!to) toDate.setDate(toDate.getDate() + 7);
  const fromStr = dateStr(fromDate);
  const toStr = dateStr(toDate);

  const earnings: EarningsItem[] = [];
  const economic: EconomicItem[] = [];

  if (type !== "economic") {
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/calendar/earnings?from=${fromStr}&to=${toStr}&token=${token}`,
        { next: { revalidate: 0 } }
      );
      if (res.ok) {
        const data = (await res.json()) as { earningsCalendar?: Array<{
          date?: string;
          symbol?: string;
          epsActual?: number | null;
          epsEstimate?: number | null;
          revenueActual?: number | null;
          revenueEstimate?: number | null;
          quarter?: number;
          year?: number;
          hour?: string;
        }> };
        const list = (data?.earningsCalendar ?? []) as Array<{
          date?: string;
          symbol?: string;
          epsActual?: number | null;
          epsEstimate?: number | null;
          revenueActual?: number | null;
          revenueEstimate?: number | null;
          hour?: string;
        }>;
        const withRev = list.map((e, i) => ({
          item: {
            id: `earn-${e.symbol ?? i}-${e.date ?? ""}`,
            ticker: e.symbol ?? "",
            name: e.symbol ?? "",
            date: e.date ?? "",
            epsEstimate: e.epsEstimate ?? null,
            revenueEstimate: e.revenueEstimate ?? null,
            epsActual: e.epsActual ?? null,
            revenueActual: e.revenueActual ?? null,
            bmoAmc: (e.hour === "bmo" ? "BMO" : e.hour === "amc" ? "AMC" : null) as "BMO" | "AMC" | null,
          },
          rev: e.revenueEstimate ?? 0,
        }));
        withRev
          .sort((a, b) => b.rev - a.rev)
          .slice(0, 20)
          .forEach(({ item }) => earnings.push(item));
      }
    } catch (e) {
      console.error("[calendar earnings]", e);
    }
  }

  function parseEconomicResponse(data: unknown): EconomicItem[] {
    const out: EconomicItem[] = [];
    let rawList: unknown[] = [];
    if (Array.isArray(data)) rawList = data;
    else if (data && typeof data === "object") {
      const o = data as Record<string, unknown>;
      if (Array.isArray(o.economicCalendar)) rawList = o.economicCalendar;
      else if (Array.isArray(o.economic)) rawList = o.economic;
      else if (Array.isArray(o.data)) rawList = o.data;
      else {
        for (const v of Object.values(o)) {
          if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && v[0] !== null && ("event" in v[0] || "date" in v[0])) {
            rawList = v;
            break;
          }
        }
      }
    }
    const list = rawList as Array<{ date?: string; time?: string; country?: string; event?: string; previous?: string; estimate?: string; actual?: string; impact?: string }>;
    list.forEach((e, i) => {
      const eventName = (e.event ?? (e as Record<string, unknown>).name ?? "Event").toString();
      const eventDate = (e.date ?? "").toString();
      if (!eventDate) return;
      const impact = (e.impact?.toUpperCase() === "HIGH" ? "HIGH" : e.impact?.toUpperCase() === "LOW" ? "LOW" : "MEDIUM") as "HIGH" | "MEDIUM" | "LOW";
      out.push({
        id: `econ-${i}-${eventDate}-${eventName.replace(/\s/g, "-")}`,
        name: eventName,
        date: eventDate,
        dateTimeET: e.time ? `${eventDate} ${e.time}`.trim() : eventDate,
        impact,
        country: (e.country ?? "").toString(),
        previous: e.previous != null ? String(e.previous) : undefined,
        estimate: e.estimate != null ? String(e.estimate) : undefined,
        actual: e.actual != null ? String(e.actual) : undefined,
      });
    });
    return out;
  }

  if (type !== "earnings") {
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/calendar/economic?from=${fromStr}&to=${toStr}&token=${token}`,
        { next: { revalidate: 0 } }
      );
      const data = await res.json();
      if (res.ok && data) parseEconomicResponse(data).forEach((e) => economic.push(e));
    } catch (e) {
      console.error("[calendar economic]", e);
    }
  }

  let economicFallback = false;
  if (economic.length === 0) {
    try {
      const now = new Date();
      const latestFrom = new Date(now);
      latestFrom.setDate(now.getDate() - 60);
      const latestTo = new Date(now);
      latestTo.setDate(now.getDate() + 60);
      const latestFromStr = dateStr(latestFrom);
      const latestToStr = dateStr(latestTo);
      const res = await fetch(
        `https://finnhub.io/api/v1/calendar/economic?from=${latestFromStr}&to=${latestToStr}&token=${token}`,
        { next: { revalidate: 0 } }
      );
      const data = await res.json();
      if (res.ok && data) {
        const latest = parseEconomicResponse(data)
          .filter((e) => e.date)
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 50);
        latest.forEach((e) => economic.push(e));
        economicFallback = economic.length > 0;
      }
    } catch (e) {
      console.error("[calendar economic latest fallback]", e);
    }
  }

  return NextResponse.json({ earnings, economic, economicFallback, economicSample: false });
}
