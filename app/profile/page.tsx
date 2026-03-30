"use client";
import dynamic from "next/dynamic";

const ProfileView = dynamic(() => import("./ProfileView"), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse space-y-4 p-6">
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 rounded-full bg-white/5" />
        <div className="space-y-2">
          <div className="h-6 w-40 rounded bg-white/5" />
          <div className="h-4 w-24 rounded bg-white/5" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="h-24 rounded-2xl bg-white/5" />
        <div className="h-24 rounded-2xl bg-white/5" />
        <div className="h-24 rounded-2xl bg-white/5" />
      </div>
      <div className="h-64 rounded-2xl bg-white/5" />
    </div>
  ),
});

export default function ProfilePage() {
  return <ProfileView />;
}
