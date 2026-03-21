"use client";

import dynamic from "next/dynamic";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="relative flex min-h-[480px] items-center justify-center rounded-2xl border border-white/10 bg-[#050713] text-sm text-zinc-500">
      Loading map…
    </div>
  ),
});

export default function MapPage() {
  return (
    <div className="min-h-screen app-page font-[&quot;Times_New_Roman&quot;,serif]">
      <div className="mx-auto max-w-7xl px-2 py-3 sm:px-4 lg:px-6">
        <div className="mb-2">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-[var(--accent-color)]/80">
            Macro Radar
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">
            Global map view
          </h1>
        </div>

        <p className="mb-2 text-xs text-zinc-400">
          Hover a country for a quick snapshot. Click for full data, projections, and elections.
        </p>

        <MapView />
      </div>
    </div>
  );
}
