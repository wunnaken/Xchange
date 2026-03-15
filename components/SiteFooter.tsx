"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { XchangeLogoImage } from "./XchangeLogoImage";
import { useAuth } from "./AuthContext";

const FOOTER_BG = "#080B14";
const FOOTER_TEXT = "#6B7280";

const SOCIAL_LINKS = [
  { label: "Twitter/X", href: "#", aria: "Twitter" },
  { label: "LinkedIn", href: "#", aria: "LinkedIn" },
  { label: "Discord", href: "#", aria: "Discord" },
  { label: "Reddit", href: "#", aria: "Reddit" },
];

const PLATFORM_LINKS = [
  { label: "Feed", href: "/feed" },
  { label: "Communities", href: "/communities" },
  { label: "Trade Journal", href: "/journal" },
  { label: "Growth Profiles", href: "/profiles" },
  { label: "Morning Briefing", href: "/feed" },
  { label: "Market Map", href: "/map" },
];

const RESOURCES_LINKS = [
  { label: "Getting Started (coming soon)", href: "#" },
  { label: "Risk Profiles Explained", href: "/profiles" },
  { label: "How to Use the Journal (coming soon)", href: "#" },
  { label: "API & Data Sources (coming soon)", href: "#" },
  { label: "Feedback", href: "/feedback" },
  { label: "Changelog (coming soon)", href: "#" },
  { label: "Trading Ethics & Conduct", href: "/ethics" },
  { label: "Idle", href: "/idle" },
];

const COMPANY_LINKS_BASE = [
  { label: "About Xchange", href: "/about" },
  { label: "Our Mission", href: "/mission" },
  { label: "Careers (coming soon)", href: "#" },
  { label: "Press (coming soon)", href: "#" },
  { label: "Terms of Service (coming soon)", href: "#" },
  { label: "Privacy Policy (coming soon)", href: "#" },
  { label: "Cookie Policy (coming soon)", href: "#" },
];

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-white">
        {title}
      </h3>
      <ul className="mt-4 space-y-3">
        {links.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className="text-sm text-zinc-400 transition-colors hover:text-[var(--accent-color)]"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  const { user } = useAuth();
  const [apiStatus, setApiStatus] = useState<"ok" | "delayed" | "error" | null>(null);
  const [apiLabel, setApiLabel] = useState<string>("");
  const companyLinks = useMemo(
    () => [{ label: "Home", href: user ? "/feed" : "/" }, ...COMPANY_LINKS_BASE],
    [user]
  );

  useEffect(() => {
    fetch("/api/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setApiStatus(d?.status ?? "error");
        setApiLabel(d?.label ?? "Data issues — we're on it");
      })
      .catch(() => {
        setApiStatus("error");
        setApiLabel("Data issues — we're on it");
      });
  }, []);

  const statusColor = apiStatus === "ok" ? "bg-emerald-500" : apiStatus === "delayed" ? "bg-amber-500" : apiStatus === "error" ? "bg-red-500" : "bg-zinc-500";

  return (
    <footer
      className="w-full border-t pt-10 pb-8"
      style={{
        backgroundColor: FOOTER_BG,
        borderColor: "color-mix(in srgb, var(--accent-color) 15%, transparent)",
      }}
      role="contentinfo"
    >
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* Column 1 — Brand */}
          <div className="flex flex-col gap-4 lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <XchangeLogoImage size={36} />
              <span className="text-lg font-semibold" style={{ color: "var(--accent-color)" }}>
                Xchange
              </span>
            </div>
            <p className="text-sm font-medium text-white/90">
              Where the World Trades Ideas
            </p>
            <p className="text-sm max-w-[240px]" style={{ color: FOOTER_TEXT }}>
              The social trading intelligence platform for investors of every level.
            </p>
            <div className="flex gap-4">
              {SOCIAL_LINKS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.aria}
                  className="text-[#6B7280] transition-colors hover:text-[var(--accent-color)]"
                >
                  {s.label === "Twitter/X" && (
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  )}
                  {s.label === "LinkedIn" && (
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                    </svg>
                  )}
                  {s.label === "Discord" && (
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                    </svg>
                  )}
                  {s.label === "Reddit" && (
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .968-.786 1.754-1.754 1.754-.431 0-.839-.157-1.149-.438a5.27 5.27 0 0 1-3.837 1.484.295.295 0 0 1-.056-.005 5.28 5.28 0 0 1-3.838-1.484c-.31.28-.718.438-1.15.438-.967 0-1.754-.786-1.754-1.754 0-.968.787-1.754 1.754-1.754.463 0 .898.178 1.207.49 1.195-.856 2.85-1.418 4.674-1.486l.8-3.747-2.597.547a1.25 1.25 0 0 1-2.498-.056c0-.688.562-1.25 1.25-1.25z" />
                    </svg>
                  )}
                </a>
              ))}
            </div>
          </div>

          <FooterColumn title="Platform" links={PLATFORM_LINKS} />
          <FooterColumn title="Resources" links={RESOURCES_LINKS} />
          <FooterColumn title="Company" links={companyLinks} />
        </div>

        {/* Bottom bar */}
        <div
          className="mt-10 flex flex-col gap-3 border-t pt-5 text-center text-sm md:flex-row md:items-center md:justify-between md:text-left"
          style={{
            borderColor: "color-mix(in srgb, var(--accent-color) 12%, transparent)",
            color: FOOTER_TEXT,
          }}
        >
          <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
            <span>© 2026 Xchange. All rights reserved.</span>
            {apiStatus && (
              <span className="flex items-center gap-1.5" title={apiLabel}>
                <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${statusColor}`} aria-hidden />
                <span className="text-xs">{apiLabel}</span>
              </span>
            )}
          </div>
          <span>Not financial advice. For educational purposes only.</span>
          <span>Built for traders, by traders.</span>
        </div>
      </div>
    </footer>
  );
}
