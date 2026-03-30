"use client";
import dynamic from "next/dynamic";

const AIView = dynamic(() => import("./AIView"), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse flex min-h-[600px] flex-col gap-4 p-6">
      <div className="h-12 w-48 rounded-xl bg-white/5" />
      <div className="flex-1 rounded-2xl bg-white/5" />
      <div className="h-14 rounded-xl bg-white/5" />
    </div>
  ),
});

export default function AIPage() {
  return <AIView />;
}
