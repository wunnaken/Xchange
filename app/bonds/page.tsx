"use client";

import dynamic from "next/dynamic";

const BondView = dynamic(() => import("./BondView"), {
  ssr: false,
  loading: () => (
    <div className="relative flex min-h-[520px] items-center justify-center rounded-2xl border border-white/10 bg-[#050713] text-sm text-zinc-500">
      Loading bond markets...
    </div>
  ),
});

export default function BondsPage() {
  return (
    <div className="min-h-screen app-page font-[&quot;Times_New_Roman&quot;,serif]">
      <div className="mx-auto max-w-7xl px-2 py-3 sm:px-4 lg:px-6">
        <div className="mb-2">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-[var(--accent-color)]/80">Fixed Income</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">Bond Markets</h1>
          <p className="mt-1 text-xs text-zinc-400">
            Live government bond yields, spreads, and global fixed income intelligence.
          </p>
        </div>
        <BondView />
      </div>
    </div>
  );
}
