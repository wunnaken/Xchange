"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthContext";

const MENU_CLASS = "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 transition-colors duration-200 hover:bg-white/5 hover:text-[var(--accent-color)]";
const DOT_CLASS = "h-1.5 w-1.5 rounded-full bg-zinc-500 opacity-40 transition-transform transition-opacity duration-200 group-hover:scale-125 group-hover:opacity-100 group-hover:bg-[var(--accent-color)]";
const DOT_SIGN_OUT = "h-1.5 w-1.5 rounded-full bg-zinc-500 opacity-40 transition-transform transition-opacity duration-200 group-hover:scale-125 group-hover:opacity-100 group-hover:bg-red-400";
const TEXT_CLASS = "truncate transition-transform duration-150 group-hover:translate-x-0.5 group-hover:scale-105";

export function ProfileIcon() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const href = user ? "/profile" : "/auth/sign-in";
  const label = user ? "User menu" : "Sign in";

  return (
    <div className="group relative overflow-visible">
      <Link
        href={href}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-zinc-300 transition hover:border-[var(--accent-color)]/50 hover:bg-white/5 hover:text-[var(--accent-color)]"
        aria-label={label}
        title={label}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </Link>
      <div className="invisible absolute right-0 top-full z-[100] pt-1 opacity-0 transition-[visibility,opacity] duration-150 group-hover:visible group-hover:opacity-100" style={{ position: "absolute" }}>
        <div className="min-w-[220px] rounded-xl border border-white/10 bg-[#0F1520] py-2 pb-4 shadow-xl" style={{ backgroundColor: "#0F1520" }} role="menu">
          {user ? (
            <>
              <div className="px-4 py-2">
                <p className="truncate text-sm font-medium text-zinc-100">{user.name || "Trader"}</p>
                <p className="truncate text-xs text-zinc-500">@{user.username?.trim() || "trader"}</p>
              </div>
              <div className="my-2 h-px bg-white/10" />
              <Link href="/profile" className={MENU_CLASS}>
                <span className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center">
                  <span className={DOT_CLASS} />
                </span>
                <span className={TEXT_CLASS}>View Profile</span>
              </Link>
              <Link href="/profiles" className={MENU_CLASS}>
                <span className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center">
                  <span className={DOT_CLASS} />
                </span>
                <span className={TEXT_CLASS}>My Risk Profile</span>
              </Link>
              <Link href="/settings" className={MENU_CLASS}>
                <span className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center">
                  <span className={DOT_CLASS} />
                </span>
                <span className={TEXT_CLASS}>Settings</span>
              </Link>
              <Link href="/plans" className={MENU_CLASS}>
                <span className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center">
                  <span className={DOT_CLASS} />
                </span>
                <span className={TEXT_CLASS}>Plans</span>
              </Link>
              <div className="my-2 h-px bg-white/10" />
              <button
                type="button"
                onClick={() => { signOut(); router.push("/"); }}
                className={`${MENU_CLASS} hover:text-red-400`}
              >
                <span className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center">
                  <span className={DOT_SIGN_OUT} />
                </span>
                <span className={TEXT_CLASS}>Sign Out</span>
              </button>
            </>
          ) : (
            <>
              <Link href="/auth/sign-in" className={MENU_CLASS}>
                <span className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center">
                  <span className={DOT_CLASS} />
                </span>
                <span className={TEXT_CLASS}>Sign in</span>
              </Link>
              <Link href="/plans" className={MENU_CLASS}>
                <span className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center">
                  <span className={DOT_CLASS} />
                </span>
                <span className={TEXT_CLASS}>Plans</span>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
