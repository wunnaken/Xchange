import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

type WhiteboardScene = {
  elements: unknown[];
  appState: Record<string, unknown>;
  files?: Record<string, unknown> | null;
};

function normalizeScene(scene: unknown): WhiteboardScene {
  const raw = scene && typeof scene === "object" ? scene as WhiteboardScene : null;
  return {
    elements: Array.isArray(raw?.elements) ? raw.elements : [],
    appState: raw?.appState && typeof raw.appState === "object" ? raw.appState : {},
    files: raw?.files && typeof raw.files === "object" ? raw.files : {},
  };
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  const userId = await getCurrentProfileId();
  if (!userId) return bad("Unauthorized", 401);

  const boardId = request.nextUrl.searchParams.get("boardId");
  const supabase = createServerClient();

  let query = supabase
    .from("whiteboard_boards")
    .select("id,name,scene,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (boardId) query = query.eq("id", boardId);

  const { data, error } = await query;
  if (error) return bad(error.message, 500);

  return NextResponse.json({ boards: data ?? [] });
}

export async function POST(request: NextRequest) {
  const userId = await getCurrentProfileId();
  if (!userId) return bad("Unauthorized", 401);

  const body = await request.json().catch(() => null) as {
    boardId?: string;
    name?: string;
    scene?: unknown;
  } | null;

  if (!body?.name?.trim()) return bad("Missing board name");
  if (!body?.boardId?.trim()) return bad("Missing board id");

  const supabase = createServerClient();
  const scene = normalizeScene(body.scene);

  const { error } = await supabase.from("whiteboard_boards").upsert({
    id: body.boardId.trim(),
    user_id: userId,
    name: body.name.trim(),
    scene,
    updated_at: new Date().toISOString(),
  });

  if (error) return bad(error.message, 500);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const userId = await getCurrentProfileId();
  if (!userId) return bad("Unauthorized", 401);

  const boardId = request.nextUrl.searchParams.get("boardId")?.trim();
  if (!boardId) return bad("Missing board id");

  const supabase = createServerClient();
  const { error } = await supabase
    .from("whiteboard_boards")
    .delete()
    .eq("id", boardId)
    .eq("user_id", userId);

  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true });
}
