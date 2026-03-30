"use client";
import dynamic from "next/dynamic";

const FiscalWatchView = dynamic(() => import("./FiscalWatchView"), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-10 w-48 rounded-lg bg-white/5" />
      <div className="grid grid-cols-4 gap-4">
        {[0,1,2,3].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-white/5" />
        ))}
      </div>
      <div className="h-64 rounded-2xl bg-white/5" />
      <div className="h-48 rounded-2xl bg-white/5" />
    </div>
  ),
});

export default function FiscalWatchPage() {
  return <FiscalWatchView />;
}
