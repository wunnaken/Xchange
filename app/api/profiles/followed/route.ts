import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/api-auth";

export type FollowedProfileRow = {
  id: string;
  name: string | null;
  username: string | null;
};

export async function GET() {
  const profileId = await getCurrentProfileId();
  if (!profileId) {
    return NextResponse.json({ profiles: [] });
  }

  const supabase = createServerClient();
  const { data: followRows, error: followError } = await supabase
    .from("follows")
    .select("followed_id")
    .eq("follower_id", profileId);

  if (followError || !followRows?.length) {
    return NextResponse.json({ profiles: [] });
  }

  const ids = followRows.map((r) => r.followed_id);
  const { data: profiles, error: profError } = await supabase
    .from("profiles")
    .select("user_id, name, username")
    .in("user_id", ids);

  if (profError) return NextResponse.json({ profiles: [] });

  const list = (profiles || []).map((p) => ({
    id: p.user_id,
    name: p.name ?? "Trader",
    username: p.username ?? p.user_id.slice(0, 8),
  }));

  return NextResponse.json({ profiles: list });
}
