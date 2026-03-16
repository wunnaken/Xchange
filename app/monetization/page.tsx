"use client";

import Link from "next/link";

const PAGE_BG = "#0A0E1A";

export default function MonetizationPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: PAGE_BG }}>
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Link href="/profile" className="text-sm text-zinc-400 hover:text-[var(--accent-color)]">← Back to Profile</Link>
        <h1 className="mt-6 text-2xl font-bold text-white">Creator Monetization Policy</h1>
        <p className="mt-2 text-sm text-zinc-400">Last updated: March 2025</p>
        <div className="mt-8 space-y-6 text-zinc-300">
          <section>
            <h2 className="text-lg font-semibold text-white">Revenue share</h2>
            <p className="mt-2 text-sm leading-relaxed">
              Verified Traders who create paid communities on Xchange receive 80% of all membership revenue collected through the platform. Xchange retains 20% to cover payment processing, platform infrastructure, and ongoing product development.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white">Payouts</h2>
            <p className="mt-2 text-sm leading-relaxed">
              Payouts are processed monthly. Minimum payout thresholds and payment methods are set in your creator dashboard. You are responsible for any applicable taxes on your earnings.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white">Eligibility</h2>
            <p className="mt-2 text-sm leading-relaxed">
              Monetization is available only to Verified Trader subscribers in good standing. We reserve the right to withhold or adjust payouts in cases of policy violation, chargebacks, or fraud.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white">Questions</h2>
            <p className="mt-2 text-sm leading-relaxed">
              For questions about our monetization policy or your creator account, contact us via the <Link href="/feedback" className="text-[var(--accent-color)] hover:underline">Feedback</Link> page.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
