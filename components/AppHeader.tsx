"use client";

import Link from "next/link";
import { useAuth } from "./AuthContext";
import { DemoInfoIcon } from "./DemoInfoIcon";
import { MarketTickerBar } from "./MarketTickerBar";
import { ProfileIcon } from "./ProfileIcon";
import { XchangeLogo } from "./XchangeLogo";

export function AppHeader() {
  const { user } = useAuth();
  return (
    <header
      className="overflow-visible border-b backdrop-blur transition-colors duration-300"
      style={{
        backgroundColor: "var(--app-navbar-bg)",
        borderColor: "var(--app-navbar-border)",
        color: "var(--app-navbar-text)",
      }}
      role="banner"
    >
      <nav
        className="mx-auto flex max-w-6xl items-center gap-4 overflow-visible px-6 py-4.5 lg:px-8"
        aria-label="Main navigation"
      >
        <div className="flex shrink-0 items-center gap-4">
          <XchangeLogo />
          <Link
            href="/feed"
            className="rounded-full border px-3 py-1.5 text-xs font-medium transition hover:border-[var(--accent-color)]/50 hover:bg-[var(--accent-color)]/10 hover:text-[var(--accent-color)]"
            style={{ borderColor: "var(--app-border)", backgroundColor: "var(--app-card)" }}
          >
            Feed
          </Link>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link
            href="/watchlist"
            className="flex shrink-0 items-center justify-center rounded p-2 text-zinc-400 transition-colors hover:bg-white/5 hover:text-[var(--accent-color)]"
            aria-label="My Watchlist"
            title="My Watchlist"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <MarketTickerBar />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <DemoInfoIcon />
          <ProfileIcon />
          {!user && (
            <>
              <Link
                href="/auth/sign-in"
                className="rounded-full border px-4 py-1.5 text-sm font-medium transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/50 focus:ring-offset-2 focus:ring-offset-[var(--app-bg)]"
                style={{ borderColor: "var(--app-border)", color: "var(--app-navbar-text)" }}
              >
                Sign In
              </Link>
              <Link
                href="/auth/sign-up"
                className="rounded-full bg-[var(--accent-color)] px-4 py-1.5 text-sm font-semibold text-[#020308] shadow-lg shadow-[var(--accent-color)]/40 transition hover:bg-[var(--accent-color)]/90 focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-2 focus:ring-offset-[var(--app-bg)]"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
