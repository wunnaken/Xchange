"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "xchange-dev-notes";
const ORANGE = "#F97316";

type NoteType = "bug" | "warning" | "info" | "fixed";

type DevNote = {
  id: string;
  type: NoteType;
  title: string;
  description: string;
  page: string;
  timestamp: number;
  dismissed?: boolean;
};

const DEFAULT_NOTES: Omit<DevNote, "id" | "timestamp">[] = [
  { type: "bug", title: "Economic events showing no real data", description: "Finnhub economic calendar requires paid plan. Trading Economics guest credentials return old 2025 data. FMP API key needed — get free key at financialmodelingprep.com then update API route at app/api/calendar/economic/route.ts", page: "/calendar" },
  { type: "bug", title: "Trading Economics Importance field error", description: "Importance field is a number (1,2,3) not a string. Code calls .toLowerCase() on it causing crash. Fixed by mapping: 1=LOW, 2=MEDIUM, 3=HIGH without toLowerCase", page: "/calendar" },
  { type: "warning", title: "CEO data is hardcoded", description: "All 100+ CEO entries are hardcoded. Real CEO data would need Finnhub company profile API or similar. Current data may become outdated.", page: "/ceos" },
  { type: "warning", title: "Leaderboard shows demo data", description: "Top traders list is hardcoded. Real leaderboard needs database connected with actual user XP scores.", page: "/leaderboard" },
  { type: "warning", title: "Messages not persistent", description: "All messages are UI only. Sending a message doesn't save anywhere. Needs Supabase database connected to work.", page: "/messages" },
  { type: "warning", title: "Feed Posts not saving to database", description: "Posts submitted in the composer appear locally but disappear on refresh. Supabase tables exist but connection needs finalizing.", page: "/feed" },
  { type: "info", title: "Some DataHub tools use demo data", description: "Options Flow, Dark Pool, Short Interest, Congress Trades, and Earnings Whisper use hardcoded realistic data. Real data needs paid APIs: Unusual Whales ($50/mo) for options/dark pool, Quiver Quant ($10/mo) for congress trades.", page: "/datahub" },
  { type: "info", title: "Auth Redirect", description: "Logged in users can still see the landing page by navigating to /. Middleware needs to be added to redirect authenticated users straight to /feed.", page: "/" },
  { type: "info", title: "Price Alerts", description: "Alerts only work while browser tab is open. Background alerts when app is closed need a service worker (PWA) or server-side cron job with push notifications. Email alerts need Resend + cron job. Both should be added by backend developer.", page: "/watchlist" },
  { type: "info", title: "WebSocket Pricing", description: "Finnhub free tier WebSocket: max 50 simultaneous symbol subscriptions. If user has large watchlist (50+ tickers) will need to prioritize which to subscribe. Paid Finnhub plan removes this limit. Set NEXT_PUBLIC_FINNHUB_KEY for live prices. News, economic data, and options flow still use polling — no free WebSocket available for these data types.", page: "/" },
  { type: "info", title: "FMP economic calendar uses v4 endpoint", description: "FMP switched from v3 to v4 endpoint in August 2025 — v4 is now the correct URL. See app/api/calendar/economic/route.ts.", page: "/calendar" },
  { type: "info", title: "Broker API connection is placeholder UI only", description: "All broker connection flows show 'coming soon' after broker selection. Real integration needs: Tradier API (stocks), Alpaca API (stocks/crypto), or Plaid for multi-broker support. OAuth flow needed. Backend needs to securely store read-only access tokens in Supabase.", page: "/profile, /verify, /settings" },
  { type: "warning", title: "Custom Dashboard", description: "Widget data fetches independently per widget. With many widgets open this could hit Finnhub/NewsAPI rate limits on free tier. Consider debouncing or shared data fetching when database is connected.", page: "/dashboard" },
  { type: "info", title: "Continue with X / Link X account", description: "'Continue with Google' and 'Continue with Apple' on sign-in, and 'Link Google account' / 'Link Apple account' in Settings are placeholder UI. To implement: (1) Supabase: enable Google/Apple in Auth > Providers, add redirect URL, use signInWithOAuth() and link identity in client. (2) Or use NextAuth.js with Google/Apple providers and callbacks to merge accounts. Store provider id in user profile for 'Link account' (link existing email user to OAuth).", page: "/auth/sign-in, /settings" },
];

function loadNotes(): DevNote[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = DEFAULT_NOTES.map((n, i) => ({
        ...n,
        id: `dev-${i}-${Date.now()}`,
        timestamp: Date.now(),
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveNotes(notes: DevNote[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

const TYPE_ICON: Record<NoteType, string> = {
  bug: "🔴",
  warning: "🟡",
  info: "🔵",
  fixed: "✅",
};

const TYPE_LABEL: Record<NoteType, string> = {
  bug: "Bug",
  warning: "Warning",
  info: "Info",
  fixed: "Fixed",
};

export function DevNotes() {
  if (process.env.NODE_ENV !== "development") return null;

  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<DevNote[]>([]);
  const [filter, setFilter] = useState<NoteType | "all">("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addType, setAddType] = useState<NoteType>("bug");
  const [addTitle, setAddTitle] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addPage, setAddPage] = useState("");

  useEffect(() => {
    setNotes(loadNotes());
  }, []);

  const persist = useCallback((next: DevNote[]) => {
    setNotes(next);
    saveNotes(next);
  }, []);

  const markFixed = useCallback((id: string) => {
    persist(notes.map((n) => (n.id === id ? { ...n, type: "fixed" as const } : n)));
  }, [notes, persist]);

  const dismiss = useCallback((id: string) => {
    persist(notes.filter((n) => n.id !== id));
  }, [notes, persist]);

  const addNote = useCallback(() => {
    if (!addTitle.trim()) return;
    const newNote: DevNote = {
      id: `dev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: addType,
      title: addTitle.trim(),
      description: addDesc.trim(),
      page: addPage.trim() || "/",
      timestamp: Date.now(),
    };
    persist([...notes, newNote]);
    setAddTitle("");
    setAddDesc("");
    setAddPage("");
    setShowAddForm(false);
  }, [addType, addTitle, addDesc, addPage, notes, persist]);

  const copyAll = useCallback(() => {
    const date = new Date().toISOString().slice(0, 10);
    const byType = { bug: notes.filter((n) => n.type === "bug"), warning: notes.filter((n) => n.type === "warning"), info: notes.filter((n) => n.type === "info"), fixed: notes.filter((n) => n.type === "fixed") };
    let text = `XCHANGE DEV NOTES — ${date}\n\n`;
    text += `🔴 BUGS (${byType.bug.length}):\n`;
    byType.bug.forEach((n) => { text += `- ${n.title}: ${n.description}\n`; });
    text += `\n🟡 WARNINGS (${byType.warning.length}):\n`;
    byType.warning.forEach((n) => { text += `- ${n.title}: ${n.description}\n`; });
    text += `\n🔵 INFO (${byType.info.length}):\n`;
    byType.info.forEach((n) => { text += `- ${n.title}: ${n.description}\n`; });
    text += `\n✅ FIXED (${byType.fixed.length}):\n`;
    byType.fixed.forEach((n) => { text += `- ${n.title}: ${n.description}\n`; });
    navigator.clipboard.writeText(text);
  }, [notes]);

  const filtered = filter === "all" ? notes : notes.filter((n) => n.type === filter);
  const bugCount = notes.filter((n) => n.type === "bug").length;
  const hasUnreadBugs = bugCount > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-[9998] flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-lg transition-opacity hover:opacity-90"
        style={{ backgroundColor: ORANGE, color: "#fff" }}
        aria-label="Developer Notes"
      >
        <span className="relative inline-flex">
          🔧
          {hasUnreadBugs && (
            <span
              className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500 animate-pulse"
              aria-hidden
            />
          )}
        </span>
        Dev Notes
      </button>

      {open && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-start" aria-modal="true" role="dialog">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="relative max-h-[85vh] w-full max-w-md overflow-hidden rounded-t-xl border-2 shadow-2xl"
            style={{ backgroundColor: "#0F1520", borderColor: ORANGE }}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3" style={{ borderColor: "rgba(249,115,22,0.3)" }}>
              <div className="flex items-center gap-2">
                <span className="text-lg" style={{ color: ORANGE }}>🔧 Developer Notes</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-zinc-300">
                  {notes.filter((n) => n.type !== "fixed").length} issues
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex gap-1 border-b border-white/10 px-2 py-2">
              {(["all", "bug", "warning", "info", "fixed"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilter(tab)}
                  className={`rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                    filter === tab ? "bg-white/15 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                  }`}
                  style={filter === tab ? { color: ORANGE } : undefined}
                >
                  {tab === "all" ? "All" : TYPE_LABEL[tab]} ({tab === "all" ? notes.length : notes.filter((n) => n.type === tab).length})
                </button>
              ))}
            </div>

            <div className="max-h-[50vh] overflow-y-auto p-3 space-y-3">
              {filtered.length === 0 ? (
                <p className="py-4 text-center text-sm text-zinc-500">No notes in this filter.</p>
              ) : (
                filtered.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg border border-white/10 bg-white/5 p-3 text-left"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-base">{TYPE_ICON[note.type]}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-zinc-200">{note.title}</p>
                        <p className="mt-1 text-xs text-zinc-500">{note.description}</p>
                        <p className="mt-1 text-[10px] text-zinc-600">Page: {note.page} · {new Date(note.timestamp).toLocaleDateString()}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {note.type !== "fixed" && (
                            <button
                              type="button"
                              onClick={() => markFixed(note.id)}
                              className="rounded bg-emerald-500/20 px-2 py-1 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/30"
                            >
                              Mark Fixed
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => dismiss(note.id)}
                            className="rounded bg-red-500/20 px-2 py-1 text-[10px] font-medium text-red-400 hover:bg-red-500/30"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {showAddForm ? (
              <div className="border-t border-white/10 p-3 space-y-2">
                <p className="text-sm font-medium text-zinc-300">Add note</p>
                <select
                  value={addType}
                  onChange={(e) => setAddType(e.target.value as NoteType)}
                  className="w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-zinc-200"
                >
                  <option value="bug">Bug</option>
                  <option value="warning">Warning</option>
                  <option value="info">Info</option>
                </select>
                <input
                  type="text"
                  placeholder="Title"
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  className="w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-zinc-200 placeholder-zinc-500"
                />
                <textarea
                  placeholder="Description"
                  value={addDesc}
                  onChange={(e) => setAddDesc(e.target.value)}
                  rows={2}
                  className="w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-zinc-200 placeholder-zinc-500"
                />
                <input
                  type="text"
                  placeholder="Page (e.g. /calendar)"
                  value={addPage}
                  onChange={(e) => setAddPage(e.target.value)}
                  className="w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-zinc-200 placeholder-zinc-500"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={addNote}
                    disabled={!addTitle.trim()}
                    className="rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                    style={{ backgroundColor: ORANGE, color: "#fff" }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddForm(false); setAddTitle(""); setAddDesc(""); setAddPage(""); }}
                    className="rounded border border-white/10 px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/5"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 border-t border-white/10 p-3">
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="rounded px-3 py-1.5 text-sm font-medium"
                  style={{ backgroundColor: ORANGE, color: "#fff" }}
                >
                  + Add Note
                </button>
                <button
                  type="button"
                  onClick={copyAll}
                  className="rounded border border-white/10 px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/5"
                >
                  Copy all notes
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
