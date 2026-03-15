import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export type CEOAssessment = {
  leadershipScore: number;
  scoreLabel: string;
  summary: string;
  strengths: string[];
  watchPoints: string[];
  longTermOutlook: "Bullish" | "Neutral" | "Cautious";
  investorVerdict: string;
};

const PROMPT = `Analyze this CEO for long-term investors. Return only valid JSON, no markdown or extra text.

Input:
- Name: {{name}}
- Company: {{company}}
- Ticker: {{ticker}}
- Tenure: {{tenure}} years
- Recent news headlines: {{headlines}}

Respond in this exact JSON format:
{
  "leadershipScore": number (1-10),
  "scoreLabel": string (e.g. "Strong", "Adequate"),
  "summary": string (2-3 sentences),
  "strengths": array of exactly 3 strings,
  "watchPoints": array of exactly 2 strings,
  "longTermOutlook": "Bullish" | "Neutral" | "Cautious",
  "investorVerdict": string (1-2 sentences for long-term investors)
}`;

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured" }, { status: 503 });

  let body: { name: string; company: string; ticker: string; tenureYears: number; headlines: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { name, company, ticker, tenureYears, headlines } = body;
  if (!name || !company || !ticker) return NextResponse.json({ error: "Missing name/company/ticker" }, { status: 400 });

  const headlinesStr = Array.isArray(headlines) ? headlines.slice(0, 5).join(" | ") : "";
  const prompt = PROMPT.replace("{{name}}", name)
    .replace("{{company}}", company)
    .replace("{{ticker}}", ticker)
    .replace("{{tenure}}", String(tenureYears ?? 0))
    .replace("{{headlines}}", headlinesStr || "No recent headlines");

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
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: "AI request failed", detail: t.slice(0, 200) }, { status: 502 });
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data?.content?.find((c) => c.type === "text")?.text ?? "";
    const jsonStr = text.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, "$1").trim();
    const parsed = JSON.parse(jsonStr) as CEOAssessment;
    if (typeof parsed.leadershipScore !== "number") parsed.leadershipScore = 5;
    if (!Array.isArray(parsed.strengths)) parsed.strengths = [];
    if (!Array.isArray(parsed.watchPoints)) parsed.watchPoints = [];
    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json({ error: "Assessment failed", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
