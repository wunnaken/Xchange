"use client";

import Link from "next/link";
import { useAuth } from "../../components/AuthContext";
import { useToast } from "../../components/ToastContext";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 19,
    period: "month",
    tagline: "Get in the game",
    features: [
      "Real-time market tickers & 1 index",
      "Access to 1 Smart Community room",
      "Basic risk profile & projections",
      "Email support",
    ],
    cta: "Start free trial",
    accent: "emerald",
    popular: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: 49,
    period: "month",
    tagline: "Trade with the room",
    features: [
      "Everything in Starter",
      "All Smart Community rooms",
      "Macro Radar map & country data",
      "Real-time news by region",
      "Priority support",
      "Export idea journal",
    ],
    cta: "Go Pro",
    accent: "green",
    popular: true,
  },
  {
    id: "institution",
    name: "Institution",
    price: 199,
    period: "month",
    tagline: "Desk-level intelligence",
    features: [
      "Everything in Pro",
      "Auto-verified (Verified Trader badge included)",
      "Dedicated account manager",
      "Custom indices & watchlists",
      "API access",
      "SLA & compliance reports",
      "Onboarding & training",
    ],
    cta: "Start free trial",
    accent: "cyan",
    popular: false,
  },
];

export default function PlansPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const handleCtaClick = () => {
    if (user) {
      showToast("Checkout (Stripe) coming soon. You're already signed in.");
    }
  };

  return (
    <div className="min-h-screen overflow-visible app-page font-[&quot;Times_New_Roman&quot;,serif]">
      <div className="mx-auto max-w-6xl px-6 py-10 lg:px-8 lg:py-14">
        <div className="mb-16 mt-12 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-[var(--accent-color)]/80">
            Pricing
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
            Plans that scale with your edge
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-zinc-400 sm:text-base">
            From solo traders to desks. Real-time intelligence, communities, and macro tools — pick the tier that fits.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          {PLANS.map((plan) => {
            const ctaHref = user ? undefined : "/auth/sign-up";
            const ctaClassName = plan.popular
              ? "bg-[var(--accent-color)] text-[#020308] shadow-lg shadow-[color-mix(in_srgb,var(--accent-color)_30%,transparent)] hover:opacity-90"
              : "border border-white/20 bg-white/5 text-zinc-200 hover:border-[var(--accent-color)]/50 hover:bg-[var(--accent-color)]/10 hover:text-[var(--accent-color)]";
            return (
              <div
                key={plan.id}
                className={`group relative flex flex-col rounded-2xl border bg-gradient-to-b from-[#050713] to-[#030510] p-6 transition-all duration-200 hover:translate-y-[-4px] hover:scale-[1.02] hover:shadow-2xl ${
                  plan.popular
                    ? "border-[var(--accent-color)]/60 hover:shadow-[0_0_60px_color-mix(in_srgb,var(--accent-color)_15%,transparent)] hover:ring-2 hover:ring-[var(--accent-color)]/50"
                    : "border-white/10 hover:border-[var(--accent-color)]/40 hover:ring-2 hover:ring-[var(--accent-color)]/20"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-[var(--accent-color)] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#020308]">
                      Most popular
                    </span>
                  </div>
                )}
                <div className="mb-4">
                  <h2 className="text-xl font-semibold text-zinc-50">{plan.name}</h2>
                  <p className="mt-1 text-xs text-zinc-500">{plan.tagline}</p>
                </div>
                <div className="mb-6 flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight text-zinc-50">
                    ${plan.price}
                  </span>
                  <span className="text-sm text-zinc-500">/{plan.period}</span>
                </div>
                <ul className="mb-8 flex-1 space-y-3 text-sm text-zinc-300">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-[var(--accent-color)]">
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
                {ctaHref ? (
                  <Link
                    href={ctaHref}
                    className={`block rounded-full py-3 text-center text-sm font-semibold transition ${ctaClassName}`}
                  >
                    {plan.cta}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleCtaClick(plan.name)}
                    className={`w-full rounded-full py-3 text-center text-sm font-semibold transition ${ctaClassName}`}
                  >
                    {plan.cta}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-12 text-center text-xs text-zinc-500">
          All plans include a 14-day free trial. No card required for Starter.
        </p>
      </div>
    </div>
  );
}
