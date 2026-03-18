import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { AUTH_EMAIL_COOKIE, AUTH_NAME_COOKIE } from "./auth-cookie";

export type SessionUser = { email: string; name: string };

/**
 * Reads the current demo-auth user from cookies (set by client on sign-in).
 * Returns null if not logged in. Used by API routes to resolve profile id.
 */
export async function getSessionFromCookies(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const email = cookieStore.get(AUTH_EMAIL_COOKIE)?.value;
  const name = cookieStore.get(AUTH_NAME_COOKIE)?.value;
  if (!email) return null;

  const decodedEmail = decodeURIComponent(email);
  const decodedName = name ? decodeURIComponent(name) : "Trader";

  // Best-effort: prefer the user's profile row (now keyed by `profiles.user_id`).
  try {
    const authUserId = await getUserId();
    if (!authUserId) return { email: decodedEmail, name: decodedName };

    const supabase = createServerClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, user_id, email, name, username")
      .eq("user_id", authUserId)
      .single();

    return {
      email: profile?.email ?? decodedEmail,
      name: profile?.name ?? decodedName,
    };
  } catch {
    return { email: decodedEmail, name: decodedName };
  }
}

/**
 * Returns the current user id (for use as user_id / profile_id in API routes).
 * Tries Supabase Auth session first; falls back to demo auth cookie (xchange-demo-email)
 * and resolves to profile id. Returns null if neither is present.
 */
export async function getUserId(): Promise<string | null> {
  // Debug: log all cookies
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  console.log("[api-auth] All cookies:", allCookies.map((c) => c.name));

  // 1. Try Supabase Auth first
  try {
    const supabase = await createRouteHandlerClient();
    const { data: { session } } = await supabase.auth.getSession();
    console.log("[api-auth] Supabase session:", session?.user?.id ?? "none");
    if (session?.user?.id) {
      return session.user.id;
    }
  } catch (e) {
    console.log("[api-auth] Supabase auth error:", e);
  }

  // 2. Fall back to demo auth cookie (xchange-demo-email): find user in auth.users by email
  const demoEmailRaw = cookieStore.get("xchange-demo-email")?.value;
  console.log("[api-auth] Demo email cookie:", demoEmailRaw ?? "not found");

  if (!demoEmailRaw) {
    console.log("[api-auth] No auth found - returning null");
    return null;
  }

  const demoEmail = decodeURIComponent(demoEmailRaw).trim().toLowerCase();
  console.log("[api-auth] Looking up auth user by email:", demoEmail);

  const supabase = createServerClient();
  const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) {
    console.log("[api-auth] listUsers error:", listError);
    return null;
  }

  const user = listData?.users?.find(
    (u) => u.email?.toLowerCase() === demoEmail
  );
  console.log("[api-auth] Auth user lookup result:", user ? user.id : "not found");

  if (user?.id) return user.id;

  console.log("[api-auth] No auth found - returning null");
  return null;
}

/**
 * Returns the current user's profile id (uuid). Supabase Auth preferred, then demo cookie.
 * Use this in API routes for consistent auth. Returns null if not authenticated.
 */
export async function getCurrentProfileId(): Promise<string | null> {
  return getUserId();
}
