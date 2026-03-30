"use client";
import dynamic from "next/dynamic";

const DataHubView = dynamic(() => import("./DataHubView"), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-10 w-40 rounded-lg bg-white/5" />
      <div className="grid grid-cols-3 gap-4">
        {[0,1,2,3,4,5].map((i) => (
          <div key={i} className="h-36 rounded-2xl bg-white/5" />
        ))}
      </div>
    </div>
  ),
});

export default function DataHubPage() {
  return <DataHubView />;
}
