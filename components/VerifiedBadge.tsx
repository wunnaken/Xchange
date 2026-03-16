"use client";

const VERIFIED_BLUE = "#3B82F6";

export function VerifiedBadge({ className, size = 18 }: { className?: string; size?: number }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-white ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        backgroundColor: VERIFIED_BLUE,
        boxShadow: `0 0 0 1px ${VERIFIED_BLUE}40, 0 0 ${size / 2}px ${VERIFIED_BLUE}50`,
      }}
      title="Verified Trader — Identity and track record confirmed"
      aria-label="Verified Trader"
      role="img"
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </span>
  );
}
