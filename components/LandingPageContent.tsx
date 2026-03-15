"use client";

import Link from "next/link";
import { XchangeLogoImage } from "./XchangeLogoImage";
import { SiteFooter } from "./SiteFooter";

export function LandingPageContent({ hasInvite = false }: { hasInvite?: boolean }) {
  return (
    <>
      <div className="sticky top-0 z-20 flex items-center justify-center gap-2 border-b border-white/5 bg-[var(--accent-color)]/10 px-4 py-2 text-center text-xs font-medium text-zinc-200">
        {hasInvite ? (
          <Link href="/auth/sign-up" className="text-[var(--accent-color)] hover:underline">
            You&apos;ve been invited! Create your account to get started →
          </Link>
        ) : (
          <span>🚀 Xchange is in Beta — Join the waitlist for early access</span>
        )}
      </div>
      <main className="mx-auto flex max-w-6xl flex-col gap-16 px-6 py-16 lg:flex-row lg:items-center lg:gap-20 lg:px-8 lg:py-24">
        <section className="flex-1 space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-color)]/25 bg-[var(--accent-color)]/5 px-3 py-1 text-xs font-medium text-[var(--accent-color)]">
            Live social trading intelligence
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl lg:text-6xl">
              Where the World
              <span className="block bg-gradient-to-r from-[var(--accent-color)] via-emerald-300 to-cyan-300 bg-clip-text text-transparent">
                Trades Ideas
              </span>
            </h1>
            <p className="max-w-xl text-base text-zinc-400 sm:text-lg">
              Real-time market intelligence. Social communities. Risk-based
              investing — all in one place. Xchange gives you the signal, the
              crowd, and the tools to act with confidence.
            </p>
            <p className="max-w-xl text-sm text-zinc-500 sm:text-base">
              Whether you&apos;re just starting out or you trade for a living — one place to learn, share ideas, and move with the market.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/auth/sign-up" className="rounded-full bg-[var(--accent-color)] px-6 py-2.5 text-sm font-semibold text-[#020308] shadow-xl shadow-[var(--accent-color)]/40 transition hover:bg-[var(--accent-color)]">
              Join Xchange
            </Link>
            <Link href="/news" className="rounded-full border border-white/15 px-5 py-2 text-sm font-medium text-zinc-200 transition hover:border-[var(--accent-color)]/60 hover:text-[var(--accent-color)]">
              View Live Market Feed
            </Link>
          </div>
          <div className="flex flex-wrap gap-6 text-xs text-zinc-500">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-color)]" />
              Real-time global macro and earnings coverage
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-color)]" />
              Built for retail and professional investors
            </div>
          </div>
        </section>
        <section className="flex-1">
          <div className="relative rounded-3xl border border-white/5 bg-gradient-to-br from-slate-900 via-slate-950 to-black p-6 shadow-2xl shadow-black/60">
            <div className="pointer-events-none absolute -top-8 -right-10 h-40 w-40 rounded-full bg-[var(--accent-color)]/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-10 -left-8 h-40 w-40 rounded-full bg-cyan-500/15 blur-3xl" />
            <div className="mb-4 flex items-center justify-between text-xs text-zinc-400">
              <span className="font-medium text-zinc-200">Xchange Pulse</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-color)]/10 px-3 py-1 text-[11px] text-[var(--accent-color)]">
                <span className="live-dot inline-block h-1.5 w-1.5 rounded-full text-[var(--accent-color)]" />
                Markets Open · Live
              </span>
            </div>
            <p className="mb-4 text-[11px] text-zinc-500">
              <strong className="text-zinc-400">Xchange Pulse</strong> is your live dashboard: key indices, market mood, and session status in one place. When markets are open, it shows real-time context so you can see at a glance whether risk is on or off.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <Link href="/map" className="space-y-3 rounded-2xl border border-white/5 bg-white/5 p-4 backdrop-blur transition hover:border-[var(--accent-color)]/30">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Macro Radar</span>
                  <span className="text-[var(--accent-color)]">+1.2%</span>
                </div>
                <div className="h-20 w-full rounded-xl bg-gradient-to-tr from-[var(--accent-color)]/20 via-emerald-300/30 to-cyan-400/20">
                  <div className="h-full w-full bg-[radial-gradient(circle_at_0_0,color-mix(in_srgb,var(--accent-color)_35%,transparent),transparent_60%),radial-gradient(circle_at_100%_100%,rgba(56,189,248,0.35),transparent_55%)]" />
                </div>
                <p className="text-[11px] text-zinc-400">
                  <strong className="text-zinc-300">Macro Radar</strong> surfaces real-time geopolitical and macro events (central banks, data releases, headlines) and ties them to your watchlists and themes. So you see why markets are moving, not just that they are.
                </p>
              </Link>
              <Link href="/mission" className="pulse-logo-link group flex min-h-[7.5rem] flex-col items-center justify-center gap-2 md:min-h-0" aria-label="View Xchange mission">
                <span className="relative flex items-center justify-center">
                  <span className="pointer-events-none absolute inset-0 rounded-full bg-[var(--accent-color)]/20 opacity-0 blur-xl transition group-hover:opacity-40" aria-hidden />
                  <span className="inline-flex shrink-0 transition group-hover:scale-[1.03]">
                    <XchangeLogoImage size={200} />
                  </span>
                </span>
                <span className="flex items-center gap-1 text-xs text-zinc-500 transition group-hover:text-[var(--accent-color)]">
                  <span>Our mission</span>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </span>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <section className="border-t border-white/5 bg-[#080B14]">
        <div className="mx-auto max-w-6xl px-6 py-14 lg:px-8 lg:py-16">
          <h2 className="text-center text-2xl font-semibold text-zinc-100 sm:text-3xl">From first trade to full-time.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-sm text-zinc-400 sm:text-base">
            Xchange is built for everyone: total beginners learning the ropes and day trading experts who live by the tape. One platform, one feed, one place to get the edge.
          </p>
          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <h3 className="text-lg font-semibold text-zinc-100">Just getting started</h3>
              <p className="mt-2 text-sm text-zinc-400">
                Take the investor profile quiz, join communities that match your style, and follow ideas from traders who explain their thinking. Morning briefings and risk profiles keep you in your lane while you learn.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-zinc-500">
                <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-color)]" /> Risk profiles and growth paths</li>
                <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-color)]" /> Curated communities and ideas</li>
                <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-color)]" /> Morning briefings in plain English</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <h3 className="text-lg font-semibold text-zinc-100">Already in the game</h3>
              <p className="mt-2 text-sm text-zinc-400">
                Real-time macro radar, live market mood, and a feed that connects flows to your watchlist. Get context before the open, during the session, and in after-hours — so you trade with the crowd, not against it.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-zinc-500">
                <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-color)]" /> Live indices and session status</li>
                <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-color)]" /> Macro and geopolitical pulse</li>
                <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-color)]" /> Social signal and idea flow</li>
              </ul>
            </div>
          </div>
          <p className="mx-auto mt-10 max-w-xl text-center text-xs text-zinc-500">
            No gatekeeping. No jargon walls. Just one place where beginners learn and experts sharpen their edge.
          </p>
        </div>
      </section>
      <section className="dark-bg-section border-t border-white/5 bg-[#050713]">
        <div className="mx-auto max-w-6xl px-6 py-14 lg:px-8 lg:py-16">
          <div className="mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-zinc-100 sm:text-2xl">Built for how modern markets move.</h2>
              <p className="mt-2 max-w-xl text-sm text-zinc-300">
                From social communities to real-time news and growth tools, Xchange connects global flows, narratives, and portfolios in one interface.
              </p>
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <Link href="/communities" className="group rounded-2xl border border-white/5 bg-gradient-to-b from-white/5 to-white/[0.01] p-5 transition hover:border-[var(--accent-color)]/60 hover:shadow-[0_0_40px_var(--accent-color-40)] cursor-pointer">
              <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-color)]/15 text-[var(--accent-color)]"><span className="text-lg">🌍</span></div>
              <h3 className="text-sm font-semibold text-zinc-100">Smart Communities</h3>
              <p className="mt-2 text-sm text-zinc-300">Join focused rooms for equities, FX, crypto, macro, and more — curated by signal, not noise.</p>
              <p className="mt-3 text-xs text-emerald-300/80 group-hover:text-[var(--accent-color)]">Threads, live chats, and curated idea streams by strategy.</p>
            </Link>
            <Link href="/news" className="group rounded-2xl border border-white/5 bg-gradient-to-b from-white/5 to-white/[0.01] p-5 transition hover:border-[var(--accent-color)]/60 hover:shadow-[0_0_40px_var(--accent-color-40)] cursor-pointer">
              <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300"><span className="text-lg">📰</span></div>
              <h3 className="text-sm font-semibold text-zinc-100">Real-time News</h3>
              <p className="mt-2 text-sm text-zinc-300">Current market news and global updates. Choose your topics and regions — we surface what matters to you.</p>
              <p className="mt-3 text-xs text-cyan-300/80 group-hover:text-[var(--accent-color)]">Select what you want to follow. More coming soon.</p>
            </Link>
            <Link href="/profiles" className="group rounded-2xl border border-white/5 bg-gradient-to-b from-white/5 to-white/[0.01] p-5 transition hover:border-[var(--accent-color)]/60 hover:shadow-[0_0_40px_var(--accent-color-40)] cursor-pointer">
              <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-fuchsia-500/15 text-fuchsia-300"><span className="text-lg">📈</span></div>
              <h3 className="text-sm font-semibold text-zinc-100">Growth Profiles</h3>
              <p className="mt-2 text-sm text-zinc-300">Explore passive, moderate, and high-risk paths tailored to your time horizon.</p>
              <p className="mt-3 text-xs text-fuchsia-300/80 group-hover:text-[var(--accent-color)]">Click to view profile breakdowns and risk explanations.</p>
            </Link>
          </div>
        </div>
      </section>
      <section className="dark-bg-section border-t border-white/5 bg-[#050713]">
        <div className="mx-auto max-w-4xl px-6 py-12 text-center lg:px-8 lg:py-16">
          <h2 className="text-xl font-semibold text-zinc-100 sm:text-2xl">Ready to think smarter about markets?</h2>
          <p className="mt-3 text-sm text-zinc-300 sm:text-base">
            Join traders, investors, and macro thinkers from around the world. One interface for ideas, risk, and execution.
          </p>
          <div className="mt-6 flex justify-center">
            <Link href="/onboarding" className="rounded-full bg-[var(--accent-color)] px-7 py-2.5 text-sm font-semibold text-[#020308] shadow-xl shadow-[var(--accent-color)]/40 transition hover:bg-[var(--accent-color)]">
              Take the investor profile quiz
            </Link>
          </div>
        </div>
      </section>
      <SiteFooter />
    </>
  );
}
