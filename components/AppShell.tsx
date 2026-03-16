"use client";

import { usePathname } from "next/navigation";
import { Layout } from "./Layout";
import { LandingNavbar } from "./LandingNavbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const isAboutPage = pathname === "/about";
  const isIdlePage = pathname === "/idle";
  const isFullPage = pathname.startsWith("/auth") || pathname === "/onboarding";

  if (isIdlePage) {
    return <>{children}</>;
  }

  if (isAboutPage) {
    return (
      <div className="min-h-screen app-page font-[&quot;Times_New_Roman&quot;,serif]">
        <LandingNavbar />
        {children}
      </div>
    );
  }

  if (isLanding) {
    return (
      <div className="min-h-screen app-page font-[&quot;Times_New_Roman&quot;,serif]">
        <LandingNavbar />
        {children}
      </div>
    );
  }

  if (isFullPage) {
    return <>{children}</>;
  }

  return <Layout>{children}</Layout>;
}
