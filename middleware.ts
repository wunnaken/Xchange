import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED_PATHS = [
  "/feed",
  "/communities",
  "/map",
  "/news",
  "/growth",
  "/calendar",
  "/search",
  "/profile",
  "/journal",
  "/messages",
  "/ai",
  "/workspace",
  "/dashboard",
  "/whiteboard",
  "/ceos",
  "/leaderboard",
  "/people",
  "/mission",
  "/settings",
  "/ethics",
  "/plans",
  "/profiles",
  "/watchlist",
  "/datahub",
  "/verify",
];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            response.cookies.set(name, value, options as any)
          );
        },
      },
    }
  );

  // Refresh session and get user
  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  if (pathname === "/" && user) {
    return NextResponse.redirect(new URL("/feed", request.url), 307);
  }

  if (isProtectedPath(pathname) && !user) {
    const signInUrl = new URL("/auth/sign-in", request.url);
    signInUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(signInUrl, 307);
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/feed",
    "/feed/:path*",
    "/communities",
    "/communities/:path*",
    "/map",
    "/map/:path*",
    "/news",
    "/news/:path*",
    "/growth",
    "/growth/:path*",
    "/calendar",
    "/calendar/:path*",
    "/search",
    "/search/:path*",
    "/profile",
    "/profile/:path*",
    "/journal",
    "/journal/:path*",
    "/messages",
    "/messages/:path*",
    "/ai",
    "/ai/:path*",
    "/workspace",
    "/dashboard",
    "/dashboard/:path*",
    "/whiteboard",
    "/whiteboard/:path*",
    "/ceos",
    "/ceos/:path*",
    "/leaderboard",
    "/leaderboard/:path*",
    "/people",
    "/people/:path*",
    "/mission",
    "/mission/:path*",
    "/settings",
    "/settings/:path*",
    "/ethics",
    "/ethics/:path*",
    "/pricing",
    "/pricing/:path*",
    "/profiles",
    "/profiles/:path*",
    "/watchlist",
    "/watchlist/:path*",
    "/datahub",
    "/datahub/:path*",
    "/verify",
    "/verify/:path*",
  ],
};
