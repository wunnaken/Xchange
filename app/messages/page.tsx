"use client";
import dynamic from "next/dynamic";

const MessagesView = dynamic(() => import("./MessagesView"), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse flex min-h-[600px] gap-0">
      <div className="w-72 shrink-0 border-r border-white/10 space-y-2 p-3">
        <div className="h-8 rounded-lg bg-white/5" />
        {[0,1,2,3,4,5].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-white/5" />
        ))}
      </div>
      <div className="flex-1 p-4 space-y-3">
        {[0,1,2,3,4].map((i) => (
          <div key={i} className={`h-10 rounded-2xl bg-white/5 ${i % 2 === 0 ? "w-2/3" : "w-1/2 ml-auto"}`} />
        ))}
      </div>
    </div>
  ),
});

export default function MessagesPage() {
  return <MessagesView />;
}
