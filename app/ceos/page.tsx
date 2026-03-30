"use client";
import dynamic from "next/dynamic";

const CEOsView = dynamic(() => import("./CEOsView"), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-10 w-64 rounded-lg bg-white/5" />
      <div className="h-8 w-96 rounded-lg bg-white/5" />
      <div className="grid grid-cols-4 gap-4">
        {[0,1,2,3,4,5,6,7].map((i) => (
          <div key={i} className="h-48 rounded-2xl bg-white/5" />
        ))}
      </div>
    </div>
  ),
});

export default function CEOsPage() {
  return <CEOsView />;
}
