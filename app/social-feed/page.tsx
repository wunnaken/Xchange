"use client";
import dynamic from "next/dynamic";

const SocialFeedView = dynamic(() => import("./SocialFeedView"), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-10 w-48 rounded-lg bg-white/5" />
      <div className="space-y-3">
        {[0,1,2,3,4].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-white/5" />
        ))}
      </div>
    </div>
  ),
});

export default function SocialFeedPage() {
  return <SocialFeedView />;
}
