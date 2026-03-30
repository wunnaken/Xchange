"use client";
import dynamic from "next/dynamic";

const SentimentRadarView = dynamic(() => import("./SentimentView"), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-10 w-56 rounded-lg bg-white/5" />
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 h-72 rounded-2xl bg-white/5" />
        <div className="space-y-4">
          <div className="h-32 rounded-2xl bg-white/5" />
          <div className="h-32 rounded-2xl bg-white/5" />
        </div>
      </div>
    </div>
  ),
});

export default function SentimentRadarPage() {
  return <SentimentRadarView />;
}
