import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

type ChatMessage = { role: "user" | "assistant"; content: string };

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeBigintId(input: unknown): string | undefined {
  if (typeof input === "number" && Number.isFinite(input)) return String(Math.trunc(input));
  if (typeof input !== "string") return undefined;
  const t = input.trim();
  if (!t) return undefined;
  if (/^\d+$/.test(t)) return t;
  const digits = t.replace(/\D+/g, "");
  return digits || undefined;
}

function titleFromMessages(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  const raw = (firstUser?.content ?? "").trim();
  if (!raw) return "New chat";
  const trimmed = raw.slice(0, 50);
  return raw.length > 50 ? `${trimmed}...` : trimmed;
}

export async function GET(_request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return bad("Unauthorized", 401);

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("ai_conversations")
    .select("id,created_at,user_id,title,messages,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) return bad(error.message, 500);

  const rows = Array.isArray(data) ? data : [];
  return NextResponse.json({
    conversations: rows.map((r) => ({
      id: String(r.id),
      title: r.title ?? "",
      created_at: r.created_at ?? null,
      updated_at: r.updated_at ?? null,
      messages: (r.messages ?? []) as ChatMessage[],
    })),
  });
}

export async function POST(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return bad("Unauthorized", 401);

  const body = (await request.json().catch(() => null)) as
    | {
        id?: unknown;
        title?: unknown;
        messages?: unknown;
      }
    | null;

  if (!body) return bad("Missing body", 400);

  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages: ChatMessage[] = rawMessages
    .filter((m): m is ChatMessage => {
      if (!m || typeof m !== "object") return false;
      const role = (m as any).role;
      const content = (m as any).content;
      return (role === "user" || role === "assistant") && typeof content === "string";
    })
    .map((m) => ({ role: m.role, content: m.content }));

  if (messages.length === 0) return bad("messages array required", 400);

  const normalizedId = normalizeBigintId(body.id);

  const computedTitle = titleFromMessages(messages);
  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : computedTitle;

  const supabase = createServerClient();

  const upsertRow: any = {
    user_id: userId,
    title,
    messages,
    updated_at: new Date().toISOString(),
  };

  if (normalizedId) upsertRow.id = normalizedId;

  const { data, error } = await supabase
    .from("ai_conversations")
    .upsert(upsertRow, { onConflict: "id" })
    .select("id,created_at,user_id,title,messages,updated_at")
    .single();

  if (error) return bad(error.message, 500);

  return NextResponse.json({
    conversation: {
      id: String(data.id),
      title: data.title ?? "",
      created_at: data.created_at ?? null,
      updated_at: data.updated_at ?? null,
      messages: (data.messages ?? []) as ChatMessage[],
    },
  });
}

export async function DELETE(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return bad("Unauthorized", 401);

  const url = new URL(request.url);
  const idRaw = url.searchParams.get("id") ?? url.searchParams.get("conversationId");
  const normalizedId = normalizeBigintId(idRaw);
  if (!normalizedId) return bad("Missing or invalid id", 400);

  const supabase = createServerClient();
  const { error } = await supabase
    .from("ai_conversations")
    .delete()
    .eq("id", normalizedId)
    .eq("user_id", userId);

  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true });
}

