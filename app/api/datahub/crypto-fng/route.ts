import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export async function GET() {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=30", { next: { revalidate: 3600 } });
    const data = (await res.json()) as { data?: Array<{ value: string; value_classification: string; timestamp: string }> };
    const history = (data.data ?? []).map((d) => ({
      value: parseInt(d.value, 10),
      label: d.value_classification,
      date: d.timestamp,
    }));
    const current = history[0];
    return NextResponse.json({
      value: current?.value ?? 55,
      label: current?.label ?? "Greed",
      history: history.reverse(),
    });
  } catch (e) {
    console.error("[datahub/crypto-fng]", e);
    return NextResponse.json({
      value: 55,
      label: "Greed",
      history: Array.from({ length: 30 }, (_, i) => ({
        value: 45 + Math.floor(Math.random() * 25),
        label: "Greed",
        date: String(Math.floor(Date.now() / 1000) - (30 - i) * 86400),
      })),
    });
  }
}
