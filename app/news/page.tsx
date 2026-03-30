"use client";
import dynamic from "next/dynamic";

const NewsView = dynamic(() => import("./NewsView"), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-10 w-32 rounded-lg bg-white/5" />
      <div className="space-y-3">
        {[0,1,2,3,4,5].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-white/5" />
        ))}
      </div>
    </div>
  ),
});

export default function NewsPage() {
  return <NewsView />;
}
