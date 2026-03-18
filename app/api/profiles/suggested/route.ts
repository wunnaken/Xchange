import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/api-auth";

export type SuggestedProfileRow = {
  id: string;
  name: string | null;
  username: string | null;
  risk_profile: string | null;
};

export async function GET() {
  const profileId = await getCurrentProfileId();
  const supabase = createServerClient();

  let query = supabase
    .from("profiles")
    .select("user_id, name, username, risk_profile")
    .limit(20)
    .order("created_at", { ascending: false });

  if (profileId) {
    query = query.neq("user_id", profileId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[profiles/suggested] GET error:", error);
    return NextResponse.json({ profiles: [] });
  }

  const profiles = (data || []).map((p) => ({
    id: p.user_id,
    name: p.name ?? "Trader",
    username: p.username ?? p.user_id.slice(0, 8),
    risk_profile: p.risk_profile ?? "Moderate",
  }));

  return NextResponse.json({ profiles });
}
