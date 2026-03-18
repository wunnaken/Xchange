import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/api-auth";

const REACTION_TYPES = ["bullish", "bearish", "informative", "risky", "interesting"] as const;

export async function GET(request: NextRequest) {
  const profileId = await getCurrentProfileId();
  const supabase = createServerClient();
  const url = request.nextUrl;
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10));

  const { data: postsRows, error: postsError } = await supabase
    .from("posts")
    .select("id, user_id, content, created_at, comments_count")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (postsError) {
    console.error("[posts] GET error:", postsError);
    return NextResponse.json({ error: "Failed to load posts" }, { status: 500 });
  }

  const authorIds = [...new Set((postsRows || []).map((p: { user_id: string }) => p.user_id))];
  const { data: profilesRows } = await supabase
    .from("profiles")
    .select("user_id, name, username")
    .in("user_id", authorIds);

  const profilesById: Record<string, { name: string; username: string }> = {};
  for (const pr of profilesRows || []) {
    profilesById[pr.user_id] = {
      name: pr.name ?? "Trader",
      username: pr.username ?? pr.user_id.slice(0, 8),
    };
  }

  const posts = (postsRows || []).map((p: { id: string; user_id: string; content: string; created_at: string; comments_count: number }) => {
    const profile = profilesById[p.user_id];
    return {
      id: p.id,
      author_id: p.user_id,
      author: {
        name: profile?.name ?? "Trader",
        handle: profile?.username ?? p.user_id.slice(0, 8),
        avatar: null,
      },
      content: p.content,
      timestamp: p.created_at,
      comments: p.comments_count ?? 0,
    };
  });

  const postIds = posts.map((p) => p.id);
  if (postIds.length === 0) {
    return NextResponse.json({ posts, reactionCounts: {}, userReactions: {} });
  }

  const { data: countsRows } = await supabase
    .from("post_reactions")
    .select("post_id, reaction_type, count")
    .in("post_id", postIds);

  const reactionCounts: Record<string, Record<string, number>> = {};
  for (const post of posts) {
    reactionCounts[post.id] = { bullish: 0, bearish: 0, informative: 0, risky: 0, interesting: 0 };
  }
  for (const r of countsRows || []) {
    if (reactionCounts[r.post_id] && REACTION_TYPES.includes(r.reaction_type as (typeof REACTION_TYPES)[number])) {
      reactionCounts[r.post_id][r.reaction_type] = r.count ?? 0;
    }
  }

  const userReactions: Record<string, Record<string, boolean>> = {};
  if (profileId) {
    const { data: userRows } = await supabase
      .from("user_post_reactions")
      .select("post_id, reaction_type")
      .eq("user_id", profileId)
      .in("post_id", postIds);
    for (const u of userRows || []) {
      if (!userReactions[u.post_id]) userReactions[u.post_id] = {};
      userReactions[u.post_id][u.reaction_type] = true;
    }
  }

  return NextResponse.json({ posts, reactionCounts, userReactions });
}

export async function POST(request: NextRequest) {
  const profileId = await getCurrentProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: post, error } = await supabase
    .from("posts")
    .insert({ user_id: profileId, content })
    .select("id, user_id, content, created_at, comments_count")
    .single();

  if (error) {
    console.error("[posts] POST error:", error);
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, username")
    .eq("user_id", profileId)
    .single();

  return NextResponse.json({
    post: {
      id: post.id,
      author_id: post.user_id,
      author: {
        name: profile?.name ?? "Trader",
        handle: profile?.username ?? profileId.slice(0, 8),
        avatar: null,
      },
      content: post.content,
      timestamp: post.created_at,
      comments: post.comments_count ?? 0,
    },
    reactionCounts: { bullish: 0, bearish: 0, informative: 0, risky: 0, interesting: 0 },
    userReactions: {},
  });
}
