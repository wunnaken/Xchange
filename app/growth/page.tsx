"use client";
import dynamic from "next/dynamic";

const GrowthView = dynamic(() => import("./GrowthView"), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-10 w-48 rounded-lg bg-white/5" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-64 rounded-2xl bg-white/5" />
        <div className="space-y-4">
          <div className="h-28 rounded-2xl bg-white/5" />
          <div className="h-28 rounded-2xl bg-white/5" />
        </div>
      </div>
    </div>
  ),
});

export default function GrowthPage() {
  return <GrowthView />;
}
