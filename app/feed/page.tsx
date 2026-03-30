"use client";
import dynamic from "next/dynamic";

const BentoDashboardView = dynamic(() => import("./FeedView"), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse space-y-4 p-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <div className="h-48 rounded-2xl bg-white/5" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-36 rounded-2xl bg-white/5" />
            <div className="h-36 rounded-2xl bg-white/5" />
          </div>
        </div>
        <div className="space-y-4">
          <div className="h-48 rounded-2xl bg-white/5" />
          <div className="h-48 rounded-2xl bg-white/5" />
        </div>
      </div>
    </div>
  ),
});

export default function FeedPage() {
  return <BentoDashboardView />;
}
