import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type QuiverRecord = {
  Representative?: string;
  BioGuideID?: string;
  ReportDate?: string;
  TransactionDate?: string;
  Ticker?: string;
  Transaction?: string;
  Range?: string;
  House?: string;
  Party?: string;
  Description?: string | null;
  ExcessReturn?: number | null;
  PriceChange?: number | null;
};

function normalizeType(t?: string): string {
  if (!t) return "Sale (Full)";
  const u = t.toLowerCase();
  if (u.includes("purchase") || u.includes("buy")) return "Purchase";
  if (u === "sale (full)" || u.includes("sale_full")) return "Sale (Full)";
  if (u === "sale (partial)" || u.includes("sale_partial")) return "Sale (Partial)";
  if (u.includes("sale")) return "Sale (Full)";
  if (u.includes("exchange")) return "Exchange";
  return t;
}

function daysApart(a?: string, b?: string): number {
  if (!a || !b) return 0;
  const diff = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(0, Math.round(diff / 86400000));
}

export async function GET() {
  try {
    const res = await fetch("https://api.quiverquant.com/beta/live/congresstrading", {
      headers: { "User-Agent": "Xchange/1.0", "Accept": "application/json" },
      next: { revalidate: 3600 },
    });

    if (!res.ok) throw new Error(`Quiver API ${res.status}`);

    const json: QuiverRecord[] = await res.json();

    const trades = json
      .filter((t) => t.Ticker && t.Ticker !== "--" && t.Ticker !== "N/A")
      // sort most-recent first so we get the freshest trades
      .sort(
        (a, b) =>
          new Date(b.TransactionDate ?? "").getTime() -
          new Date(a.TransactionDate ?? "").getTime()
      )
      .map((t, i) => {
        const name = t.Representative ?? "Unknown";
        const days = daysApart(t.TransactionDate, t.ReportDate);
        const amount = t.Range ?? "Undisclosed";
        const chamber = t.House === "Senate" ? "Senate" : "House";
        const party = (t.Party ?? "I") as "D" | "R" | "I";
        return {
          id: `q${i}`,
          politician: name,
          bioguideId: t.BioGuideID ?? "",
          party,
          state: "US",
          chamber: chamber as "House" | "Senate",
          ticker: (t.Ticker ?? "N/A").replace("$", "").trim(),
          company: t.Description ?? t.Ticker ?? "N/A",
          transaction: normalizeType(t.Transaction),
          amountRange: amount,
          tradeDate: t.TransactionDate ?? "",
          disclosedDate: t.ReportDate ?? "",
          daysToDisclose: days,
          excessReturn: t.ExcessReturn ?? null,
          priceChange: t.PriceChange ?? null,
          isNotable:
            days >= 44 ||
            amount.includes("1,000,001") ||
            amount.includes("5,000,001"),
        };
      });

    const from = trades.length ? trades[trades.length - 1].tradeDate : "";
    const to = trades.length ? trades[0].tradeDate : "";

    return NextResponse.json({ trades, source: "live", dateRange: { from, to } });
  } catch (err) {
    console.error("[insider-trades/congress]", err);
    return NextResponse.json({ trades: [], source: "error", dateRange: null });
  }
}
