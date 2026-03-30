"use client";
import dynamic from "next/dynamic";

const CalendarView = dynamic(() => import("./CalendarView"), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-10 w-48 rounded-lg bg-white/5" />
      <div className="flex gap-2">
        {[0,1,2,3,4,5,6].map((i) => (
          <div key={i} className="h-8 w-20 rounded-full bg-white/5" />
        ))}
      </div>
      <div className="space-y-2">
        {[0,1,2,3,4,5,6,7].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-white/5" />
        ))}
      </div>
    </div>
  ),
});

export default function CalendarPage() {
  return <CalendarView />;
}
