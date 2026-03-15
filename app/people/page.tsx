"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { getInitials } from "../../lib/suggested-people";

const RISK_STYLES: Record<string, string> = {
  Conservative: "bg-[var(--accent-color)]/20 text-[var(--accent-color)]",
  Moderate: "bg-blue-500/20 text-blue-400",
  Aggressive: "bg-amber-500/20 text-amber-400",
};

type SuggestedProfile = {
  id: string;
  name: string;
  username: string;
  risk_profile: string;
};

function UserCard({
  user,
  following,
  onToggle,
}: {
  user: SuggestedProfile;
  following: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="rounded-2xl border border-white/10 p-4 transition-colors hover:border-white/15"
      style={{ backgroundColor: "#0F1520" }}
    >
      <div className="flex items-start gap-4">
        <Link
          href={`/profile?u=${user.id}`}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-[var(--accent-color)]"
        >
          {getInitials(user.name)}
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={`/profile?u=${user.id}`}
            className="font-semibold text-zinc-100 hover:text-[var(--accent-color)]"
          >
            {user.name}
          </Link>
          <p className="text-xs text-zinc-500">@{user.username}</p>
          <span
            className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${RISK_STYLES[user.risk_profile] ?? "bg-zinc-500/20 text-zinc-400"}`}
          >
            {user.risk_profile}
          </span>
          <button
            type="button"
            onClick={onToggle}
            className={`mt-3 w-full rounded-full py-2 text-sm font-medium transition-colors ${
              following
                ? "border border-[var(--accent-color)]/50 bg-[var(--accent-color)]/10 text-[var(--accent-color)]"
                : "bg-[var(--accent-color)] text-[#020308] hover:bg-[var(--accent-color)]/90"
            }`}
          >
            {following ? (
              <span className="flex items-center justify-center gap-1.5">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Following
              </span>
            ) : (
              "Follow"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

async function fetchSuggested(): Promise<SuggestedProfile[]> {
  const res = await fetch("/api/profiles/suggested", { credentials: "include" });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.profiles) ? data.profiles : [];
}

async function fetchFollowed(): Promise<string[]> {
  const res = await fetch("/api/follows", { credentials: "include" });
  if (res.status === 401 || !res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.followedIds) ? data.followedIds : [];
}

function PeopleContent() {
  const searchParams = useSearchParams();
  const qFromUrl = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(qFromUrl);
  const [profiles, setProfiles] = useState<SuggestedProfile[]>([]);
  const [followed, setFollowed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setQuery(qFromUrl);
  }, [qFromUrl]);

  const refresh = useCallback(async () => {
    try {
      const [list, ids] = await Promise.all([fetchSuggested(), fetchFollowed()]);
      setProfiles(list);
      setFollowed(ids);
    } catch {
      setProfiles([]);
      setFollowed([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleToggle = async (user: SuggestedProfile) => {
    const isFollowed = followed.includes(user.id);
    try {
      if (isFollowed) {
        await fetch(`/api/follows?followed_id=${encodeURIComponent(user.id)}`, {
          method: "DELETE",
          credentials: "include",
        });
        setFollowed((prev) => prev.filter((id) => id !== user.id));
      } else {
        await fetch("/api/follows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ followed_id: user.id }),
        });
        setFollowed((prev) => [...prev, user.id]);
      }
    } catch {
      // ignore
    }
  };

  const filtered =
    query.trim()
      ? profiles.filter(
          (u) =>
            u.name.toLowerCase().includes(query.toLowerCase()) ||
            u.username.toLowerCase().includes(query.toLowerCase())
        )
      : profiles;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-zinc-100">Find People</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Discover traders to follow. They’ll show up in your feed and in People You Follow.
      </p>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or @handle..."
        className="mt-6 w-full rounded-xl border border-white/10 bg-[#0F1520] px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors focus:border-[var(--accent-color)]/50"
        aria-label="Search users"
      />
      {loading ? (
        <p className="mt-6 text-sm text-zinc-500">Loading…</p>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {filtered.map((user) => (
              <UserCard
                key={user.id}
                user={user}
                following={followed.includes(user.id)}
                onToggle={() => handleToggle(user)}
              />
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="mt-6 text-center text-sm text-zinc-500">
              {profiles.length === 0
                ? "No one to follow yet. Check back later or invite friends to join."
                : "No one matches your search."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function PeoplePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#0A0E1A]"><div className="h-8 w-8 animate-pulse rounded-full bg-white/10" /></div>}>
      <PeopleContent />
    </Suspense>
  );
}
