import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SYSTEM = `You are a macro analyst for Xchange. Analyze economic indicator data for traders and investors. Respond with valid JSON only, no markdown or extra text. Use this exact structure:
{"trend":"Improving|Deteriorating|Stable","trendColor":"green|red|yellow","summary":"2-3 sentences plain English","marketImpact":"what this means for stocks, bonds, dollar","watchFor":"what to watch next"}`;

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  let body: { indicatorName: string; currentValue: number | string; trend: string; dataSummary: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { indicatorName, currentValue, trend, dataSummary } = body;
  if (!indicatorName || dataSummary == null) {
    return NextResponse.json({ error: "indicatorName and dataSummary required" }, { status: 400 });
  }

  const user = `Analyze this economic indicator for traders and investors: ${indicatorName}. Current value: ${currentValue}. Trend: ${trend || "unknown"}. 10-year context: ${typeof dataSummary === "string" ? dataSummary : JSON.stringify(dataSummary)}. Respond in JSON only: trend (Improving/Deteriorating/Stable), trendColor (green/red/yellow), summary (2-3 sentences), marketImpact (stocks, bonds, dollar), watchFor (what to watch next).`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        system: SYSTEM,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[calendar economic-analysis]", res.status, err);
      return NextResponse.json({ error: "AI request failed" }, { status: 502 });
    }
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((c) => c.type === "text")?.text?.trim() ?? "";
    const parsed = JSON.parse(text.replace(/```json\s*|\s*```/g, "")) as {
      trend?: string;
      trendColor?: string;
      summary?: string;
      marketImpact?: string;
      watchFor?: string;
    };
    return NextResponse.json({
      trend: parsed.trend ?? "Stable",
      trendColor: parsed.trendColor ?? "yellow",
      summary: parsed.summary ?? "",
      marketImpact: parsed.marketImpact ?? "",
      watchFor: parsed.watchFor ?? "",
    });
  } catch (e) {
    console.error("[calendar economic-analysis]", e);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
