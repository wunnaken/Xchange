import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/api-auth";

export type ProfileRow = {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  bio: string | null;
  profile_picture_url: string | null;
  banner_image_url: string | null;
  risk_profile: string | null;
  joined_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export async function GET() {
  const profileId = await getCurrentProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", profileId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json(data as ProfileRow);
}
