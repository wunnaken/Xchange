"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/AuthContext";
import { XchangeLogoImage } from "../components/XchangeLogoImage";
import { LandingPageContent } from "../components/LandingPageContent";
import { WelcomeAnimation } from "../components/WelcomeAnimation";
import { hasBeenWelcomed, WELCOMED_KEY } from "../lib/briefing";

const LOADING_MS = 400;

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0E1A]" aria-hidden>
      <div className="animate-pulse">
        <XchangeLogoImage size={80} />
      </div>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const [showContent, setShowContent] = useState(false);
  const [hasInvite, setHasInvite] = useState(false);

  useEffect(() => {
    if (user) {
      router.replace("/feed");
      return;
    }
    const t = setTimeout(() => setShowContent(true), LOADING_MS);
    return () => clearTimeout(t);
  }, [user, router]);

  useEffect(() => {
    setHasInvite(/[?&]invite=|[?&]ref=/i.test(window.location?.search ?? ""));
  }, []);

  const showWelcome = !!user && !hasBeenWelcomed() && false;
  const handleWelcomeComplete = () => {
    if (typeof window !== "undefined") window.localStorage.setItem(WELCOMED_KEY, "1");
  };

  if (user) return <LoadingScreen />;
  if (!showContent) return <LoadingScreen />;

  return (
    <>
      {showWelcome && <WelcomeAnimation onComplete={handleWelcomeComplete} />}
      <LandingPageContent hasInvite={hasInvite} />
    </>
  );
}
