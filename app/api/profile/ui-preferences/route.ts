import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(request: NextRequest) {
  const profileId = await getCurrentProfileId();
  if (!profileId) return bad("Unauthorized", 401);

  const body = (await request.json().catch(() => null)) as
    | {
        aiPanels?: { leftOpen?: boolean; rightOpen?: boolean };
      }
    | null;

  if (!body?.aiPanels) return bad("Missing aiPanels", 400);

  const leftOpen = !!body.aiPanels.leftOpen;
  const rightOpen = !!body.aiPanels.rightOpen;

  const supabase = createServerClient();

  // NOTE: you requested adding this column:
  // ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ui_preferences jsonb;
  // If the column isn't present yet, this endpoint will return 500.
  const { data: existing, error: selectError } = await supabase
    .from("profiles")
    .select("ui_preferences")
    .eq("user_id", profileId)
    .single();

  if (selectError) return bad(selectError.message, 500);

  const prevPrefs = (existing?.ui_preferences ?? {}) as Record<string, unknown>;
  const nextPrefs = {
    ...(prevPrefs ?? {}),
    aiPanels: { leftOpen, rightOpen },
  };

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ ui_preferences: nextPrefs })
    .eq("user_id", profileId);

  if (updateError) return bad(updateError.message, 500);

  return NextResponse.json({ ok: true });
}

