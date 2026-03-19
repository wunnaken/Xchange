import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Server-side cache for CEO Claude profile (sentiment, tenure, stock). One call per ticker per 24h. */
const ceoCache = new Map<
  string,
  { data: { content: string }; fetchedAt: number }
>();
const CACHE_24H = 24 * 60 * 60 * 1000;

/** Detect CEO profile request and extract ticker from prompt (e.g. "Ticker: AAPL"). */
function getCeoProfileTicker(messages: { role: string; content: string }[]): string | null {
  const userContent = messages.find((m) => m.role === "user")?.content ?? "";
  if (!userContent.includes("Ticker:") || !userContent.includes("tenure_start")) return null;
  const match = /Ticker:\s*([A-Z0-9.\-]+)/i.exec(userContent);
  return match?.[1]?.trim() ?? null;
}

/** Strict system prompt so callers can expect machine-parseable JSON in `content`. */
const JSON_ONLY_SYSTEM = `You are a data extraction assistant. Reply with a single valid JSON object only.
Rules:
- No markdown, no code fences, no explanation, no text before or after the JSON.
- Use double quotes for all JSON keys and string values.
- Numbers must be unquoted JSON numbers.
- Use null (not the string "null") where appropriate for absent data.`;

type Message = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "AI is not configured" }, { status: 503 });
  }

  let body: { messages?: Message[] };
  try {
    body = (await req.json()) as { messages?: Message[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  const ticker = getCeoProfileTicker(messages);
  const cacheKey = ticker ? ticker.toUpperCase() : null;

  if (cacheKey) {
    const cached = ceoCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_24H) {
      return NextResponse.json(cached.data);
    }
  }

  const anthropicMessages = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

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
        system: JSON_ONLY_SYSTEM,
        messages: anthropicMessages,
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
    const result = { content: text };

    if (cacheKey && text) {
      ceoCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
    }

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
