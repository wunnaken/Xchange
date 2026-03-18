import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SYSTEM_PROMPT = `You are an economic analyst. Given country data respond in this exact JSON:
{
  "bestCase": {
    "headline": string (max 8 words),
    "explanation": string (2-3 sentences),
    "confidence": "High" | "Medium" | "Low",
    "timeframe": string
  },
  "worstCase": {
    "headline": string (max 8 words),
    "explanation": string (2-3 sentences),
    "severity": "High" | "Medium" | "Low",
    "timeframe": string
  }
}
Return only valid JSON. No markdown, no code fences, no extra text.`;

export type ProjectionBestCase = {
  headline: string;
  explanation: string;
  confidence: "High" | "Medium" | "Low";
  timeframe: string;
};

export type ProjectionWorstCase = {
  headline: string;
  explanation: string;
  severity: "High" | "Medium" | "Low";
  timeframe: string;
};

export type MapCountryProjectionsResponse = {
  bestCase: ProjectionBestCase;
  worstCase: ProjectionWorstCase;
};

export async function POST(request: NextRequest) {
  let body: {
    country: string;
    gdpGrowth?: number | null;
    inflation?: number | null;
    unemployment?: number | null;
    gdpPerCapita?: number | null;
    imfGdp2025?: number | null;
    imfGdp2026?: number | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const country = body?.country?.trim();
  if (!country) {
    return NextResponse.json({ error: "Missing country" }, { status: 400 });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  const gdp = body.gdpGrowth != null ? `${body.gdpGrowth}%` : "N/A";
  const inf = body.inflation != null ? `${body.inflation}%` : "N/A";
  const unem = body.unemployment != null ? `${body.unemployment}%` : "N/A";
  const gdppc = body.gdpPerCapita != null ? `$${Math.round(body.gdpPerCapita / 1000)}k` : "N/A";
  const imf25 = body.imfGdp2025 != null ? `${body.imfGdp2025}%` : "N/A";
  const imf26 = body.imfGdp2026 != null ? `${body.imfGdp2026}%` : "N/A";

  const userMessage = `Country: ${country}
GDP Growth: ${gdp}
Inflation: ${inf}
Unemployment: ${unem}
GDP Per Capita: ${gdppc}
IMF GDP Forecast 2025: ${imf25}
IMF GDP Forecast 2026: ${imf26}`;

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
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { error: err || `Anthropic API error: ${res.status}` },
        { status: res.status >= 500 ? 502 : 400 }
      );
    }

    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.[0]?.text?.trim() ?? "";
    if (!text) return NextResponse.json({ error: "Empty response" }, { status: 502 });

    const jsonStr = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(jsonStr) as MapCountryProjectionsResponse;
    if (!parsed.bestCase || !parsed.worstCase) {
      return NextResponse.json({ error: "Invalid projection structure" }, { status: 502 });
    }
    return NextResponse.json(parsed);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
