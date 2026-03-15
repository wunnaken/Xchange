import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_COOKIE_NAME = "xchange-demo-auth";

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
  "/whiteboard",
  "/ceos",
  "/leaderboard",
  "/people",
  "/mission",
  "/onboarding",
  "/settings",
  "/ethics",
  "/pricing",
  "/profiles",
  "/watchlist",
];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(request: NextRequest) {
  try {
    const url = request.nextUrl;
    const pathname = url.pathname;
    const hasAuth = request.cookies.get(AUTH_COOKIE_NAME)?.value === "1";

    if (pathname === "/" && hasAuth) {
      const feedUrl = new URL("/feed", request.url);
      return NextResponse.redirect(feedUrl, 307);
    }

    if (isProtectedPath(pathname) && !hasAuth) {
      const signInUrl = new URL("/auth/sign-in", request.url);
      signInUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(signInUrl, 307);
    }
  } catch (_err) {
    // Allow request through on any error
  }
  return NextResponse.next();
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
    "/onboarding",
    "/onboarding/:path*",
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
  ],
};
