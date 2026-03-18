import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

function normalizeBigintId(input: unknown): string | undefined {
  if (typeof input === "number" && Number.isFinite(input)) return String(Math.trunc(input));
  if (typeof input !== "string") return undefined;
  const t = input.trim();
  if (!t) return undefined;
  if (/^\d+$/.test(t)) return t;
  const digits = t.replace(/\D+/g, "");
  return digits ? digits : undefined;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function toDashboardResponseRow(row: any) {
  const updatedAt =
    row?.updated_at != null ? new Date(row.updated_at).toISOString() : row?.updatedAt != null ? String(row.updatedAt) : null;
  return {
    id: String(row.id),
    name: row.name ?? "",
    layout: row.layout ?? [],
    widgets: row.widgets ?? [],
    theme: row.theme ?? {},
    updatedAt,
  };
}

export async function GET(_request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return bad("Unauthorized", 401);

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("dashboards")
    .select("id,created_at,user_id,name,layout,widgets,theme,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) return bad(error.message, 500);

  return NextResponse.json({
    dashboards: Array.isArray(data) ? data.map(toDashboardResponseRow) : [],
  });
}

export async function POST(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return bad("Unauthorized", 401);

  const body = (await request.json().catch(() => null)) as
    | {
        dashboardId?: unknown;
        name?: unknown;
        layout?: unknown;
        widgets?: unknown;
        theme?: unknown;
      }
    | null;

  if (!body) return bad("Missing body", 400);

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return bad("Missing dashboard name");

  const existingIdForDb = normalizeBigintId(body.dashboardId);

  const currentLayout = Array.isArray(body.layout) ? body.layout : [];
  const currentWidgets = Array.isArray(body.widgets) ? body.widgets : [];
  const currentTheme = body.theme && typeof body.theme === "object" ? body.theme : {};

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("dashboards")
    .upsert(
      {
        id: existingIdForDb || undefined,
        user_id: userId,
        name,
        layout: currentLayout,
        widgets: currentWidgets,
        theme: currentTheme,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .select("id,created_at,user_id,name,layout,widgets,theme,updated_at")
    .single();

  if (error) return bad(error.message, 500);

  return NextResponse.json({ dashboard: toDashboardResponseRow(data) });
}

export async function DELETE(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return bad("Unauthorized", 401);

  const url = new URL(request.url);
  const dashboardIdRaw = url.searchParams.get("dashboardId") ?? url.searchParams.get("id");
  if (!dashboardIdRaw) return bad("Missing dashboard id");

  const dashboardIdForDb = normalizeBigintId(dashboardIdRaw);
  if (!dashboardIdForDb) return bad("Invalid dashboard id", 400);

  const supabase = createServerClient();
  const { error } = await supabase
    .from("dashboards")
    .delete()
    .eq("id", dashboardIdForDb)
    .eq("user_id", userId);

  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true });
}

