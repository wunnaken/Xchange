"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
import { VerifiedBadge } from "../../components/VerifiedBadge";
import { setVerified } from "../../lib/verified";

const VERIFIED_BLUE = "#3B82F6";
const STEP_LABELS = ["① Requirements", "② Application", "③ Review"];

const MARKETS = ["Stocks", "Options", "Crypto", "Forex", "Futures", "ETFs"];
const STYLES = ["Day Trading", "Swing", "Long Term", "Scalping", "Macro"];
const EXPERIENCE_OPTIONS = ["6mo-1yr", "1-3 years", "3-5 years", "5+ years"];

export default function VerifyPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [success, setSuccess] = useState(false);
  const [confetti, setConfetti] = useState(false);

  const [req1, setReq1] = useState(false);
  const [req2, setReq2] = useState(false);
  const [req3, setReq3] = useState(false);
  const [req4, setReq4] = useState(false);
  const [req5, setReq5] = useState(false);
  const allMet = req1 && req2 && req3 && req4 && req5;

  const [experience, setExperience] = useState("");
  const [markets, setMarkets] = useState<string[]>([]);
  const [styles, setStyles] = useState<string[]>([]);
  const [bio, setBio] = useState("");
  const [socialProof, setSocialProof] = useState("");
  const [whyVerify, setWhyVerify] = useState("");

  const toggleMarket = (m: string) => setMarkets((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));
  const toggleStyle = (s: string) => setStyles((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  const handleActivateDev = useCallback(() => {
    setVerified(true);
    setConfetti(true);
    setSuccess(true);
  }, []);

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0A0E1A] p-6">
        {confetti && (
          <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
            {Array.from({ length: 60 }).map((_, i) => (
              <div
                key={i}
                className="absolute animate-[confettiFall_2s_ease-out_forwards]"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: "-10px",
                  width: 8,
                  height: 8,
                  backgroundColor: [VERIFIED_BLUE, "#60A5FA", "#93C5FD", "#BFDBFE", "#fff"][i % 5],
                  transform: `rotate(${Math.random() * 360}deg)`,
                  animationDelay: `${Math.random() * 0.5}s`,
                }}
              />
            ))}
          </div>
        )}
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="animate-[scaleIn_0.5s_ease-out]">
            <VerifiedBadge size={80} />
          </div>
          <h1 className="mt-6 text-3xl font-bold text-white">You&apos;re now a Verified Trader!</h1>
          <p className="mt-2 text-zinc-400">Your badge is now live on your profile, posts, and across Xchange.</p>
          <Link
            href="/profile"
            className="mt-8 rounded-full px-8 py-3 text-lg font-semibold text-[#020308] transition hover:opacity-90"
            style={{ backgroundColor: VERIFIED_BLUE }}
          >
            Enter Xchange
          </Link>
        </div>
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes confettiFall { to { transform: translateY(100vh) rotate(720deg); } }
          @keyframes scaleIn { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
        `}} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0E1A]" style={{ fontFamily: "var(--app-font)" }}>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <header className="mb-10 text-center">
          <div className="flex justify-center">
            <VerifiedBadge size={56} />
          </div>
          <h1 className="mt-4 text-3xl font-bold text-white">Verified Trader Program</h1>
          <p className="mt-2 text-zinc-400">Join the most credible trading community on Xchange</p>
          <p className="mt-2 text-lg font-medium" style={{ color: VERIFIED_BLUE }}>$9/month · Cancel anytime</p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[1fr,1.1fr]">
          {/* Left — Benefits */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-white">What you get as a Verified Trader</h2>
            {[
              { icon: "✓", title: "Blue verified checkmark on your profile", desc: "Stand out as a credible trader" },
              { icon: "✓", title: "Performance Card on your profile", desc: "Showcase your real win rate, avg return and best calls" },
              { icon: "✓", title: "Feed Priority", desc: "Your posts shown higher to followers and in community feeds" },
              { icon: "✓", title: "Exclusive Verified Communities", desc: "Access to verified-only rooms where serious traders share real ideas" },
              { icon: "✓", title: "Leaderboard Priority", desc: "Rank separately in the verified trader leaderboard" },
              { icon: "✓", title: "Monetize Your Community", desc: "Charge members for access to your private group. Keep 80%, we take 20%" },
              { icon: "✓", title: "Verified Trader Profile Card", desc: "Real performance stats displayed publicly on your profile" },
            ].map((b, i) => (
              <div key={i} className="flex gap-3 rounded-xl border border-white/10 bg-[#0F1520] p-4">
                <span className="shrink-0 text-xl" style={{ color: VERIFIED_BLUE }}>{b.icon}</span>
                <div>
                  <p className="font-medium text-white">{b.title}</p>
                  <p className="mt-0.5 text-sm text-zinc-400">{b.desc}</p>
                </div>
              </div>
            ))}
          </section>

          {/* Right — Application */}
          <section className="rounded-2xl border border-white/10 bg-[#0F1520] p-6">
            <h2 className="text-lg font-semibold text-white">Apply for Verified Status</h2>
            <div className="mt-4 flex gap-2 text-sm text-zinc-400">
              {STEP_LABELS.map((label, i) => (
                <span key={i} className={step === i + 1 ? "font-medium text-white" : ""}>{label}</span>
              ))}
            </div>

            {step === 1 && (
              <div className="mt-6 space-y-4">
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={req1} onChange={(e) => setReq1(e.target.checked)} className="rounded border-white/20 bg-white/5" />
                  <span className="text-zinc-200">I have 6+ months of trading experience</span>
                </label>
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={req2} onChange={(e) => setReq2(e.target.checked)} className="rounded border-white/20 bg-white/5" />
                  <span className="text-zinc-200">I have a complete profile (bio + photo)</span>
                </label>
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={req3} onChange={(e) => setReq3(e.target.checked)} className="rounded border-white/20 bg-white/5" />
                  <span className="text-zinc-200">I have selected my trading style bubbles</span>
                </label>
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={req4} onChange={(e) => setReq4(e.target.checked)} className="rounded border-white/20 bg-white/5" />
                  <span className="text-zinc-200">I understand this is not financial advice</span>
                </label>
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={req5} onChange={(e) => setReq5(e.target.checked)} className="rounded border-white/20 bg-white/5" />
                  <span className="text-zinc-200">I agree to Xchange community guidelines</span>
                </label>
                <button
                  type="button"
                  disabled={!allMet}
                  onClick={() => setStep(2)}
                  className="mt-6 w-full rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: allMet ? VERIFIED_BLUE : "#374151" }}
                >
                  All requirements met? Continue →
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="mt-6 space-y-4">
                <div>
                  <label className="block text-sm text-zinc-400">Trading experience</label>
                  <select value={experience} onChange={(e) => setExperience(e.target.value)} className="mt-1 w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-zinc-200">
                    <option value="">Select</option>
                    {EXPERIENCE_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400">Primary markets</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {MARKETS.map((m) => (
                      <button key={m} type="button" onClick={() => toggleMarket(m)} className={`rounded-full px-3 py-1 text-xs font-medium ${markets.includes(m) ? "bg-blue-500/30 text-blue-200 border border-blue-500/50" : "border border-white/20 bg-white/5 text-zinc-400"}`}>{m}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400">Trading style</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {STYLES.map((s) => (
                      <button key={s} type="button" onClick={() => toggleStyle(s)} className={`rounded-full px-3 py-1 text-xs font-medium ${styles.includes(s) ? "bg-blue-500/30 text-blue-200 border border-blue-500/50" : "border border-white/20 bg-white/5 text-zinc-400"}`}>{s}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400">Brief bio as a trader (max 300 chars)</label>
                  <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 300))} rows={3} placeholder="Tell us about your trading background and approach" className="mt-1 w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-zinc-200 placeholder:text-zinc-500" />
                  <p className="mt-0.5 text-xs text-zinc-500">{bio.length}/300</p>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400">Social proof (optional)</label>
                  <input type="text" value={socialProof} onChange={(e) => setSocialProof(e.target.value)} placeholder="Link to trading history, brokerage statement, or track record" className="mt-1 w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-zinc-200 placeholder:text-zinc-500" />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400">Why do you want to be verified? (max 200 chars)</label>
                  <textarea value={whyVerify} onChange={(e) => setWhyVerify(e.target.value.slice(0, 200))} rows={2} className="mt-1 w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-zinc-200 placeholder:text-zinc-500" />
                  <p className="mt-0.5 text-xs text-zinc-500">{whyVerify.length}/200</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setStep(1)} className="rounded-lg border border-white/20 px-4 py-2 text-sm text-zinc-300">Back</button>
                  <button type="button" onClick={() => setStep(3)} className="rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: VERIFIED_BLUE }}>Review & Continue</button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="mt-6 space-y-6">
                <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-zinc-300">
                  <p><strong className="text-white">Experience:</strong> {experience || "—"}</p>
                  <p className="mt-1"><strong className="text-white">Markets:</strong> {markets.length ? markets.join(", ") : "—"}</p>
                  <p className="mt-1"><strong className="text-white">Styles:</strong> {styles.length ? styles.join(", ") : "—"}</p>
                </div>
                <div className="rounded-xl border-2 p-6" style={{ borderColor: `${VERIFIED_BLUE}40`, backgroundColor: `${VERIFIED_BLUE}08` }}>
                  <p className="text-xl font-semibold text-white">Verified Trader — $9/month</p>
                  <p className="mt-1 text-sm text-zinc-400">Blue badge · Performance card · Feed priority · Verified rooms · Leaderboard · Monetize community</p>
                  <p className="mt-4 text-sm text-zinc-500">Card required. Cancel before trial ends to avoid charge.</p>
                  <button
                    type="button"
                    onClick={handleActivateDev}
                    className="mt-4 w-full rounded-lg py-3 font-semibold text-[#020308] transition hover:opacity-90"
                    style={{ backgroundColor: "#22c55e" }}
                  >
                    Activate Verified (Dev Mode)
                  </button>
                </div>
                <button type="button" onClick={() => setStep(2)} className="text-sm text-zinc-400 hover:text-white">← Back to application</button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
