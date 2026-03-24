"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/suggested-people";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useAuth } from "@/components/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type ConvType = "community" | "dm" | "group";

type Conversation = {
  id: string;
  type: ConvType;
  name: string | null;
  room_id: string | null;
  created_at: string;
  last_message_at: string;
  last_message_preview: string | null;
  other_user?: { user_id: string; name: string; username: string; is_verified?: boolean; is_founder?: boolean } | null;
  unread: number;
};

type Reaction = { emoji: string; count: number; by_me: boolean };

type Message = {
  id: string;
  user_id: string | null;
  content: string;
  created_at: string;
  is_mine: boolean;
  author: { name: string; username: string } | null;
  reply_to_id?: string | null;
  reply_to?: { content: string; author_name: string } | null;
  reactions?: Reaction[];
  is_pinned?: boolean;
  edited_at?: string | null;
};

type SearchProfile = { user_id: string; name: string; username: string; is_verified?: boolean; is_founder?: boolean };

type ActiveTab = "community" | "direct";

// ─── Ticker Card ────────────────────────────────────────────────────────────

const TICKER_PREFIX = "__ticker:";

function TickerCardMsg({ symbol }: { symbol: string }) {
  const [quote, setQuote] = useState<{ price: number | null; changePercent: number | null } | null>(null);
  useEffect(() => {
    fetch(`/api/ticker-quote?ticker=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((d: { price: number | null; changePercent: number | null }) => setQuote(d))
      .catch(() => {});
  }, [symbol]);

  const up = (quote?.changePercent ?? 0) >= 0;
  const pct = quote?.changePercent != null ? `${up ? "+" : ""}${quote.changePercent.toFixed(2)}%` : null;
  const price = quote?.price != null
    ? quote.price >= 1 ? `$${quote.price.toFixed(2)}` : `$${quote.price.toFixed(4)}`
    : null;

  return (
    <Link
      href={`/search/${encodeURIComponent(symbol)}`}
      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0F1520] px-4 py-3 text-zinc-200 transition-opacity hover:opacity-90"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
        {symbol.slice(0, 3)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{symbol}</p>
        <p className="text-[10px] text-zinc-500">View chart →</p>
      </div>
      {price != null ? (
        <div className="shrink-0 text-right">
          <p className="text-sm font-medium">{price}</p>
          {pct != null && (
            <p className={`text-[10px] font-medium ${up ? "text-emerald-400" : "text-red-400"}`}>{pct}</p>
          )}
        </div>
      ) : (
        <div className="h-4 w-16 animate-pulse rounded bg-white/10" />
      )}
    </Link>
  );
}

function FounderBadge({ size = 14 }: { size?: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-amber-500/20 text-amber-400" style={{ width: size, height: size }} title="Founder">
      <svg width={size * 0.65} height={size * 0.65} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
      </svg>
    </span>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 60000;
  if (diff < 1) return "Now";
  if (diff < 60) return `${Math.floor(diff)}m`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function convDisplayName(c: Conversation): string {
  if (c.type === "dm") return c.other_user?.name ?? "Unknown";
  return c.name ?? c.room_id ?? "Chat";
}

function convAvatar(c: Conversation): string {
  const name = convDisplayName(c);
  return getInitials(name) || name.slice(0, 2).toUpperCase();
}

// ─── New DM Modal ─────────────────────────────────────────────────────────────

function NewDmModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const res = await fetch(`/api/profiles/search?q=${encodeURIComponent(q)}`);
      const data = await res.json() as { profiles: SearchProfile[] };
      setResults(data.profiles ?? []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const startDm = async (profile: SearchProfile) => {
    setCreating(true);
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "dm", other_user_id: profile.user_id }),
    });
    const data = await res.json() as { id: string };
    setCreating(false);
    onCreated(data.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0F1520] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-zinc-100">New Message</h2>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-300">✕</button>
        </div>
        <input
          type="search"
          placeholder="Search by name or username..."
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-[var(--accent-color)]/50"
        />
        <ul className="mt-3 space-y-1">
          {searching && <li className="py-2 text-center text-xs text-zinc-500">Searching…</li>}
          {!searching && q.length >= 2 && results.length === 0 && (
            <li className="py-2 text-center text-xs text-zinc-500">No users found</li>
          )}
          {results.map((p) => (
            <li key={p.user_id}>
              <button
                type="button"
                disabled={creating}
                onClick={() => startDm(p)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-[var(--accent-color)]">
                  {getInitials(p.name)}
                </span>
                <div>
                  <p className="text-sm font-medium text-zinc-100">{p.name}</p>
                  <p className="text-xs text-zinc-500">@{p.username}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── New Group Modal ──────────────────────────────────────────────────────────

function NewGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchProfile[]>([]);
  const [members, setMembers] = useState<SearchProfile[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/profiles/search?q=${encodeURIComponent(q)}`);
      const data = await res.json() as { profiles: SearchProfile[] };
      setResults((data.profiles ?? []).filter((p) => !members.some((m) => m.user_id === p.user_id)));
    }, 300);
    return () => clearTimeout(t);
  }, [q, members]);

  const addMember = (p: SearchProfile) => {
    setMembers((prev) => [...prev, p]);
    setQ("");
    setResults([]);
  };

  const removeMember = (uid: string) => setMembers((prev) => prev.filter((m) => m.user_id !== uid));

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "group", name: name.trim(), member_ids: members.map((m) => m.user_id) }),
    });
    const data = await res.json() as { id: string };
    setCreating(false);
    onCreated(data.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0F1520] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-zinc-100">New Group</h2>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-300">✕</button>
        </div>
        <input
          type="text"
          placeholder="Group name…"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-3 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-[var(--accent-color)]/50"
        />
        {members.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {members.map((m) => (
              <span key={m.user_id} className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-300">
                {m.name}
                <button type="button" onClick={() => removeMember(m.user_id)} className="ml-0.5 text-zinc-500 hover:text-zinc-200">✕</button>
              </span>
            ))}
          </div>
        )}
        <input
          type="search"
          placeholder="Add members…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-[var(--accent-color)]/50"
        />
        {results.length > 0 && (
          <ul className="mt-2 space-y-1">
            {results.map((p) => (
              <li key={p.user_id}>
                <button type="button" onClick={() => addMember(p)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white/5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-[var(--accent-color)]">
                    {getInitials(p.name)}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{p.name}</p>
                    <p className="text-xs text-zinc-500">@{p.username}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={create}
          disabled={!name.trim() || creating}
          className="mt-4 w-full rounded-xl bg-[var(--accent-color)] py-2.5 text-sm font-semibold text-[#020308] transition hover:opacity-90 disabled:opacity-40"
        >
          {creating ? "Creating…" : "Create Group"}
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function MessagesContent() {
  const searchParams = useSearchParams();
  const withHandle = searchParams.get("with");
  const withDmId = searchParams.get("dm");
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<ActiveTab>("direct");
  const [conversations, setConversations] = useState<{
    community: Conversation[];
    dms: Conversation[];
    groups: Conversation[];
  }>({ community: [], dms: [], groups: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showNewDm, setShowNewDm] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [search, setSearch] = useState("");
  const [peopleResults, setPeopleResults] = useState<SearchProfile[]>([]);
  const [peopleSearching, setPeopleSearching] = useState(false);
  const [startingDm, setStartingDm] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [otherLastRead, setOtherLastRead] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const presenceChannelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const myReactionKeys = useRef<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<{ id: string; content: string; author_name: string } | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [emojiPickerMsgId, setEmojiPickerMsgId] = useState<string | null>(null);
  const [tickerPickerOpen, setTickerPickerOpen] = useState(false);
  const [tickerInput, setTickerInput] = useState("");

  useEffect(() => { currentUserIdRef.current = user?.id ?? null; }, [user?.id]);

  // Global presence — track who's online
  useEffect(() => {
    if (!user?.id) return;
    const supabase = createClient();
    const ch = supabase.channel("global-presence", { config: { presence: { key: user.id } } });
    presenceChannelRef.current = ch;
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<{ user_id: string }>();
      const ids = new Set(Object.keys(state));
      setOnlineUserIds(ids);
    }).subscribe(async (status) => {
      if (status === "SUBSCRIBED") await ch.track({ user_id: user.id });
    });
    return () => { void ch.unsubscribe(); };
  }, [user?.id]);

  // Load conversations
  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/conversations");
    if (!res.ok) return;
    const data = await res.json() as typeof conversations;
    setConversations(data);
    setLoading(false);
  }, []);

  useEffect(() => { void loadConversations(); }, [loadConversations]);

  // People search when typing in the sidebar search bar
  useEffect(() => {
    if (search.length < 2) { setPeopleResults([]); return; }
    const t = setTimeout(async () => {
      setPeopleSearching(true);
      const res = await fetch(`/api/profiles/search?q=${encodeURIComponent(search)}`);
      const data = await res.json() as { profiles: SearchProfile[] };
      setPeopleResults(data.profiles ?? []);
      setPeopleSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Handle ?with= param (navigate to existing DM by username)
  useEffect(() => {
    if (!withHandle || loading) return;
    const dm = conversations.dms.find((d) => d.other_user?.username === withHandle);
    if (dm) { setActiveTab("direct"); setSelectedId(dm.id); }
  }, [withHandle, loading, conversations.dms]);

  // Handle ?dm= param (navigate to existing DM by id)
  useEffect(() => {
    if (!withDmId || loading) return;
    const dm = conversations.dms.find((d) => d.id === withDmId);
    if (dm) { setActiveTab("direct"); setSelectedId(dm.id); }
  }, [withDmId, loading, conversations.dms]);

  // Load messages + realtime subscription
  useEffect(() => {
    if (!selectedId) { setMessages([]); setTypingUsers([]); setOtherLastRead(null); return; }

    setMsgLoading(true);
    fetch(`/api/conversations/${selectedId}/messages`)
      .then((r) => r.json())
      .then((data: { messages: Message[] }) => {
        setMessages(data.messages ?? []);
        setMsgLoading(false);
      })
      .catch(() => setMsgLoading(false));

    // Realtime
    const supabase = createClient();
    if (channelRef.current) { void channelRef.current.unsubscribe(); }

    // Mark conversation as read and broadcast read receipt
    const markRead = async () => {
      const userId = currentUserIdRef.current;
      if (!userId) return;
      const now = new Date().toISOString();
      await supabase
        .from("conversation_members")
        .update({ last_read_at: now })
        .eq("conversation_id", selectedId)
        .eq("user_id", userId);
      void channelRef.current?.send({ type: "broadcast", event: "read", payload: { userId, at: now } });
    };

    // Fetch other user's last_read_at for seen receipt
    const userId = currentUserIdRef.current;
    if (userId) {
      void supabase
        .from("conversation_members")
        .select("last_read_at")
        .eq("conversation_id", selectedId)
        .neq("user_id", userId)
        .maybeSingle()
        .then(({ data }) => { if (data) setOtherLastRead(data.last_read_at); });
    }

    channelRef.current = supabase
      .channel(`conv-${selectedId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selectedId}` },
        (payload) => {
          const incoming = payload.new as Message & { is_mine?: boolean; user_id: string };
          if (incoming.user_id === currentUserIdRef.current) return;
          // Mark as read when receiving a new message (we're viewing the chat)
          void markRead();
          // Clear typing indicator for this user when their message arrives
          setTypingUsers((prev) => prev.filter((n) => n !== (incoming as { author_name?: string }).author_name));
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            // Enrich reply_to from existing messages in state
            const replyTo = incoming.reply_to_id
              ? prev.find((m) => m.id === incoming.reply_to_id) ?? null
              : null;
            const reply_to = replyTo
              ? { content: replyTo.content, author_name: replyTo.author?.name ?? "Trader" }
              : null;
            return [...prev, { ...incoming, is_mine: false, author: null, reactions: [], reply_to }];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${selectedId}` },
        (payload) => {
          const updated = payload.new as { id: string; content: string; edited_at: string | null; is_pinned: boolean | null };
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updated.id
                ? { ...m, content: updated.content, edited_at: updated.edited_at, is_pinned: updated.is_pinned ?? false }
                : m
            )
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reactions" },
        (payload) => {
          const { message_id, user_id, emoji } = payload.new as { message_id: string; user_id: string; emoji: string };
          if (user_id === currentUserIdRef.current) return; // own reaction already handled optimistically
          setMessages((prev) => prev.map((m) => {
            if (m.id !== message_id) return m;
            const reactions = m.reactions ?? [];
            const existing = reactions.find((r) => r.emoji === emoji);
            if (existing) return { ...m, reactions: reactions.map((r) => r.emoji === emoji ? { ...r, count: r.count + 1 } : r) };
            return { ...m, reactions: [...reactions, { emoji, count: 1, by_me: false }] };
          }));
        }
      )
      .on("broadcast", { event: "reaction-remove" }, (payload: { payload?: { msgId?: string; emoji?: string; bkey?: string } }) => {
        const { msgId, emoji, bkey } = payload.payload ?? {};
        if (!msgId || !emoji) return;
        if (bkey && myReactionKeys.current.has(bkey)) { myReactionKeys.current.delete(bkey); return; }
        setMessages((prev) => prev.map((m) => {
          if (m.id !== msgId) return m;
          const reactions = m.reactions ?? [];
          const existing = reactions.find((r) => r.emoji === emoji);
          if (!existing) return m;
          if (existing.count <= 1) return { ...m, reactions: reactions.filter((r) => r.emoji !== emoji) };
          return { ...m, reactions: reactions.map((r) => r.emoji === emoji ? { ...r, count: r.count - 1 } : r) };
        }));
      })
      .on("broadcast", { event: "read" }, (payload: { payload?: { userId?: string; at?: string } }) => {
        const { userId: readerId, at } = payload.payload ?? {};
        if (readerId && readerId !== currentUserIdRef.current && at) {
          setOtherLastRead(at);
        }
      })
      .on("broadcast", { event: "typing" }, (payload: { payload?: { name?: string; userId?: string } }) => {
        const { name, userId } = payload.payload ?? {};
        if (!name || userId === currentUserIdRef.current) return;
        setTypingUsers((prev) => prev.includes(name) ? prev : [...prev, name]);
        setTimeout(() => setTypingUsers((prev) => prev.filter((n) => n !== name)), 3000);
      })
      .subscribe((status) => {
        console.log("[realtime] channel status:", status);
        if (status === "SUBSCRIBED") { void markRead(); }
      });

    return () => { void channelRef.current?.unsubscribe(); };
  }, [selectedId]);

  // Poll otherLastRead every 4s so "Seen" updates even when sender isn't actively viewing
  useEffect(() => {
    if (!selectedId) return;
    const supabase = createClient();
    const interval = setInterval(async () => {
      const userId = currentUserIdRef.current;
      if (!userId) return;
      const { data } = await supabase
        .from("conversation_members")
        .select("last_read_at")
        .eq("conversation_id", selectedId)
        .neq("user_id", userId)
        .maybeSingle();
      if (data?.last_read_at) setOtherLastRead(data.last_read_at);
    }, 4000);
    return () => clearInterval(interval);
  }, [selectedId]);

  // Scroll to bottom when messages load or new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, selectedId]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || !selectedId || sending) return;
    setSending(true);
    setInput("");

    const replyRef = replyingTo;
    setReplyingTo(null);

    const tempId = `opt-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      user_id: "me",
      content: text,
      created_at: new Date().toISOString(),
      is_mine: true,
      author: null,
      reply_to_id: replyRef?.id ?? null,
      reply_to: replyRef ? { content: replyRef.content, author_name: replyRef.author_name } : null,
      reactions: [],
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await fetch(`/api/conversations/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, reply_to_id: replyRef?.id ?? null }),
      });
      if (res.ok) {
        const { message } = await res.json() as { message: Message };
        setMessages((prev) => {
          // If realtime already added the real message, just remove the optimistic one
          if (prev.some((m) => m.id === message.id)) return prev.filter((m) => m.id !== tempId);
          return prev.map((m) => m.id === tempId ? { ...message, reply_to: message.reply_to ?? optimistic.reply_to ?? null } : m);
        });
        // Update preview in conversation list
        setConversations((prev) => {
          const update = (list: Conversation[]) =>
            list.map((c) => c.id === selectedId ? { ...c, last_message_preview: text, last_message_at: new Date().toISOString() } : c);
          return { community: update(prev.community), dms: update(prev.dms), groups: update(prev.groups) };
        });
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
    }
  };

  const sendTickerCard = async (symbol: string) => {
    const ticker = symbol.trim().toUpperCase();
    if (!ticker || !selectedId) return;
    setTickerPickerOpen(false);
    setTickerInput("");
    const content = `${TICKER_PREFIX}${ticker}`;
    const tempId = `opt-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      user_id: "me",
      content,
      created_at: new Date().toISOString(),
      is_mine: true,
      author: null,
      reactions: [],
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const res = await fetch(`/api/conversations/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        const { message } = await res.json() as { message: Message };
        setMessages((prev) => {
          if (prev.some((m) => m.id === message.id)) return prev.filter((m) => m.id !== tempId);
          return prev.map((m) => m.id === tempId ? message : m);
        });
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    }
  };

  const saveEdit = async (msgId: string) => {
    const content = editContent.trim();
    if (!content || !selectedId) { setEditingMsgId(null); return; }
    setEditingMsgId(null);
    const res = await fetch(`/api/conversations/${selectedId}/messages/${msgId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      const { message } = await res.json() as { message: { id: string; content: string; edited_at: string } };
      setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: message.content, edited_at: message.edited_at } : m));
    }
  };

  const toggleReaction = async (msgId: string, emoji: string) => {
    if (!selectedId) return;
    // Optimistic update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m;
        const reactions = m.reactions ?? [];
        const existing = reactions.find((r) => r.emoji === emoji);
        let next: Reaction[];
        if (existing) {
          next = existing.by_me
            ? existing.count <= 1 ? reactions.filter((r) => r.emoji !== emoji) : reactions.map((r) => r.emoji === emoji ? { ...r, count: r.count - 1, by_me: false } : r)
            : reactions.map((r) => r.emoji === emoji ? { ...r, count: r.count + 1, by_me: true } : r);
        } else {
          next = [...reactions, { emoji, count: 1, by_me: true }];
        }
        return { ...m, reactions: next };
      })
    );
    const res = await fetch(`/api/conversations/${selectedId}/messages/${msgId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
    if (res.ok && channelRef.current) {
      const { action } = await res.json() as { action: string };
      if (action === "removed") {
        const bkey = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        myReactionKeys.current.add(bkey);
        setTimeout(() => myReactionKeys.current.delete(bkey), 10000);
        void channelRef.current.send({ type: "broadcast", event: "reaction-remove", payload: { msgId, emoji, bkey } });
      }
      // "added" is handled by postgres_changes on message_reactions INSERT
    }
  };

  const togglePin = async (msg: Message) => {
    if (!selectedId) return;
    const newPinned = !msg.is_pinned;
    setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, is_pinned: newPinned } : m));
    await fetch(`/api/conversations/${selectedId}/messages/${msg.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_pinned: newPinned }),
    });
  };

  const openConversation = (id: string) => { setSelectedId(id); };

  const startDmWithPerson = async (profile: SearchProfile) => {
    setStartingDm(profile.user_id);
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "dm", other_user_id: profile.user_id }),
    });
    const data = await res.json() as { id: string };
    setStartingDm(null);
    setSearch("");
    setPeopleResults([]);
    setActiveTab("direct");
    setSelectedId(data.id);
    void loadConversations();
  };

  const handleNewConvCreated = (id: string) => {
    setShowNewDm(false);
    setShowNewGroup(false);
    setActiveTab("direct");
    setSelectedId(id);
    void loadConversations();
  };

  const selectedConv = selectedId
    ? [...conversations.community, ...conversations.dms, ...conversations.groups].find((c) => c.id === selectedId) ?? null
    : null;

  const filteredList = (list: Conversation[]) => {
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter((c) =>
      convDisplayName(c).toLowerCase().includes(q) ||
      (c.other_user?.username?.toLowerCase().includes(q) ?? false)
    );
  };

  const directList = [...conversations.dms, ...conversations.groups].sort(
    (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
  );

  const tabList = activeTab === "community" ? filteredList(conversations.community) : filteredList(directList);

  return (
    <>
      {showNewDm && (
        <NewDmModal
          onClose={() => setShowNewDm(false)}
          onCreated={(id) => handleNewConvCreated(id)}
        />
      )}
      {showNewGroup && (
        <NewGroupModal
          onClose={() => setShowNewGroup(false)}
          onCreated={(id) => handleNewConvCreated(id)}
        />
      )}

      <div className="flex h-[calc(100vh-3.5rem)] bg-[#0A0E1A]">
        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <aside className={`flex w-full flex-col border-r border-white/10 bg-[#0F1520] md:w-[300px] ${selectedId ? "hidden md:flex" : ""}`}>
          {/* Search */}
          <div className="border-b border-white/10 p-3">
            <input
              type="search"
              placeholder="Search people or conversations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-[var(--accent-color)]/50"
            />
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/10 p-1">
            {(["direct", "community"] as ActiveTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex-1 rounded-md py-2 text-xs font-medium transition-colors ${
                  activeTab === tab ? "bg-[var(--accent-color)]/20 text-[var(--accent-color)]" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {tab === "community" ? "Community" : "Direct"}
              </button>
            ))}
          </div>

          {/* Browse communities button */}
          {activeTab === "community" && (
            <div className="border-b border-white/10 p-2">
              <Link
                href="/communities"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 py-2 text-xs font-medium text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200"
              >
Find a Community
              </Link>
            </div>
          )}

          {/* New DM / Group buttons */}
          {activeTab === "direct" && (
            <div className="flex gap-2 border-b border-white/10 p-2">
              <button
                type="button"
                onClick={() => setShowNewDm(true)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 py-2 text-xs font-medium text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200"
              >
                <span className="text-base leading-none">+</span> Message
              </button>
              <button
                type="button"
                onClick={() => setShowNewGroup(true)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 py-2 text-xs font-medium text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200"
              >
                <span className="text-base leading-none">+</span> Group
              </button>
            </div>
          )}

          {/* Conversation list */}
          <ul className="flex-1 overflow-y-auto p-2">
            {/* People search results */}
            {search.length >= 2 && (
              <>
                {peopleSearching && (
                  <li className="px-3 py-2 text-xs text-zinc-500">Searching…</li>
                )}
                {!peopleSearching && peopleResults.map((p) => (
                  <li key={`person-${p.user_id}`}>
                    <button
                      type="button"
                      disabled={startingDm === p.user_id}
                      onClick={() => void startDmWithPerson(p)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/5"
                    >
                      <span className="relative shrink-0">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-[var(--accent-color)]">
                          {getInitials(p.name)}
                        </span>
                        {onlineUserIds.has(p.user_id) && (
                          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#0F1520] bg-emerald-400" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium text-zinc-200">{p.name}</p>
                          {p.is_verified && <VerifiedBadge size={13} />}
                          {p.is_founder && <FounderBadge size={14} />}
                        </div>
                        <p className="truncate text-xs text-zinc-500">@{p.username?.toLowerCase()}</p>
                      </div>
                      <span className="shrink-0 text-xs text-zinc-600">Message</span>
                    </button>
                  </li>
                ))}
                {!peopleSearching && peopleResults.length > 0 && tabList.length > 0 && (
                  <li className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-600">Conversations</li>
                )}
              </>
            )}
            {loading && (
              <li className="space-y-2 p-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3 rounded-lg p-3">
                    <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-white/10" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="h-3 w-1/2 animate-pulse rounded bg-white/10" />
                      <div className="h-2.5 w-3/4 animate-pulse rounded bg-white/10" />
                    </div>
                  </div>
                ))}
              </li>
            )}
            {!loading && tabList.length === 0 && search.length < 2 && (
              <li className="px-3 py-8 text-center text-sm text-zinc-500">
                {activeTab === "direct" ? "No messages yet. Search for someone above." : "No community rooms found."}
              </li>
            )}
            {!loading && tabList.map((c) => {
              const isActive = selectedId === c.id;
              const name = convDisplayName(c);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => openConversation(c.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                      isActive ? "bg-[var(--accent-color)]/10 text-[var(--accent-color)]" : "hover:bg-white/5"
                    }`}
                  >
                    <span className="relative shrink-0">
                      <span className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold ${
                        isActive ? "bg-[var(--accent-color)]/20 text-[var(--accent-color)]" : "bg-white/10 text-zinc-400"
                      }`}>
                        {convAvatar(c)}
                      </span>
                      {c.type === "dm" && c.other_user && onlineUserIds.has(c.other_user.user_id) && (
                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#0F1520] bg-emerald-400" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-medium text-zinc-200">{name}</p>
                        {c.type === "dm" && c.other_user?.is_verified && <VerifiedBadge size={12} />}
                        {c.type === "dm" && c.other_user?.is_founder && <FounderBadge size={13} />}
                      </div>
                      <p className="truncate text-xs text-zinc-500">{c.last_message_preview ?? (c.type === "community" ? "Public room" : "No messages yet")}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] text-zinc-600">{fmtTime(c.last_message_at)}</p>
                      {c.unread > 0 && (
                        <span className="mt-1 flex justify-end">
                          <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--accent-color)] px-1 text-[9px] font-bold text-[#020308]">
                            {c.unread}
                          </span>
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* ── Chat area ───────────────────────────────────────────────── */}
        <main className={`flex flex-1 flex-col bg-[#0A0E1A] ${!selectedId ? "hidden md:flex" : ""}`}>
          {selectedConv ? (
            <>
              {/* Header */}
              <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="rounded p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-200 md:hidden"
                  aria-label="Back"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="relative shrink-0">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-[var(--accent-color)]">
                    {convAvatar(selectedConv)}
                  </span>
                  {selectedConv.type === "dm" && selectedConv.other_user && onlineUserIds.has(selectedConv.other_user.user_id) && (
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#0A0E1A] bg-emerald-400" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium text-zinc-100">{convDisplayName(selectedConv)}</p>
                    {selectedConv.type === "dm" && selectedConv.other_user?.is_verified && <VerifiedBadge size={14} />}
                    {selectedConv.type === "dm" && selectedConv.other_user?.is_founder && <FounderBadge size={15} />}
                  </div>
                  <p className="text-xs text-zinc-500">
                    {selectedConv.type === "dm"
                      ? `@${(selectedConv.other_user?.username ?? "").toLowerCase()}`
                      : selectedConv.type === "community"
                      ? "Community room · open to all"
                      : "Private group"}
                  </p>
                </div>
              </header>

              {/* Pinned message banner */}
              {(() => {
                const pinned = messages.filter((m) => m.is_pinned && !m.id.startsWith("opt-"));
                const lastPinned = pinned[pinned.length - 1];
                if (!lastPinned) return null;
                return (
                  <div className="flex items-center gap-2 border-b border-white/10 bg-[#0F1520]/80 px-4 py-2 text-xs text-zinc-400">
                    <svg className="h-3.5 w-3.5 shrink-0 text-[var(--accent-color)]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
                    </svg>
                    <span className="truncate text-zinc-300">{lastPinned.content}</span>
                    <button type="button" onClick={() => togglePin(lastPinned)} className="ml-auto shrink-0 text-zinc-600 hover:text-zinc-300">✕</button>
                  </div>
                );
              })()}

              {/* Messages */}
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-1" onClick={() => setEmojiPickerMsgId(null)}>
                {msgLoading && (
                  <div className="flex justify-center py-8">
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-[var(--accent-color)]" />
                  </div>
                )}
                {!msgLoading && (
                  <div className="mb-2 flex items-center gap-3 px-1 pt-2">
                    <div className="h-px flex-1 bg-white/5" />
                    <p className="text-[10px] text-zinc-600">
                      Created {new Date(selectedConv.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                    </p>
                    <div className="h-px flex-1 bg-white/5" />
                  </div>
                )}
                {!msgLoading && messages.length === 0 && (
                  <p className="py-6 text-center text-sm text-zinc-600">No messages yet. Say hello!</p>
                )}
                {!msgLoading && (() => {
                  const lastSentIdx = messages.reduce((acc, m, i) => m.is_mine && !m.id.startsWith("opt-") ? i : acc, -1);
                  return messages.map((msg, i) => {
                    const prevMsg = messages[i - 1];
                    const showAuthor = !msg.is_mine && selectedConv.type !== "dm" && msg.author && prevMsg?.user_id !== msg.user_id;
                    const isLastSent = msg.is_mine && i === lastSentIdx;
                    const isSeen = isLastSent && otherLastRead != null && otherLastRead >= msg.created_at;
                    const isDelivered = isLastSent && !isSeen && !msg.id.startsWith("opt-");
                    const isOptimistic = msg.id.startsWith("opt-");
                    const canEdit = msg.is_mine && !isOptimistic && (Date.now() - new Date(msg.created_at).getTime()) < 5 * 60 * 1000;
                    const isEditing = editingMsgId === msg.id;

                    return (
                      <div
                        key={msg.id}
                        className={`group relative flex flex-col py-0.5 ${msg.is_mine ? "items-end" : "items-start"}`}
                        onMouseEnter={() => setHoveredMsgId(msg.id)}
                        onMouseLeave={() => { setHoveredMsgId(null); }}
                      >
                        {/* Hover action toolbar */}
                        {hoveredMsgId === msg.id && !isOptimistic && !isEditing && (
                          <div className={`absolute -top-7 z-10 flex items-center gap-0.5 rounded-xl border border-white/10 bg-[#0F1520] p-1 shadow-lg ${msg.is_mine ? "right-0" : "left-0"}`}>
                            {/* Emoji trigger */}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setEmojiPickerMsgId(emojiPickerMsgId === msg.id ? null : msg.id); }}
                              className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 text-sm"
                              title="React"
                            >😊</button>
                            {/* Reply */}
                            <button
                              type="button"
                              onClick={() => { setReplyingTo({ id: msg.id, content: msg.content, author_name: msg.author?.name ?? (msg.is_mine ? (user?.name ?? "You") : "Trader") }); }}
                              className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                              title="Reply"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                              </svg>
                            </button>
                            {/* Edit (own messages only, within 5 min) */}
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => { setEditingMsgId(msg.id); setEditContent(msg.content); }}
                                className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                                title="Edit"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            )}
                            {/* Pin */}
                            <button
                              type="button"
                              onClick={() => void togglePin(msg)}
                              className={`rounded-lg p-1.5 hover:bg-white/10 ${msg.is_pinned ? "text-[var(--accent-color)]" : "text-zinc-400 hover:text-zinc-200"}`}
                              title={msg.is_pinned ? "Unpin" : "Pin"}
                            >
                              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
                              </svg>
                            </button>
                          </div>
                        )}

                        {/* Emoji picker popup */}
                        {emojiPickerMsgId === msg.id && (
                          <div
                            className={`absolute -top-16 z-20 flex gap-1 rounded-xl border border-white/10 bg-[#0F1520] p-2 shadow-xl ${msg.is_mine ? "right-0" : "left-0"}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {["👍","❤️","😂","😮","😢","🔥","💯","👏"].map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => { void toggleReaction(msg.id, emoji); setEmojiPickerMsgId(null); }}
                                className="rounded-lg p-1 text-lg hover:bg-white/10 transition-transform hover:scale-125"
                              >{emoji}</button>
                            ))}
                          </div>
                        )}

                        <div className={`flex max-w-[80%] flex-col ${msg.is_mine ? "items-end" : "items-start"}`}>
                          {showAuthor && (
                            <p className="mb-1 px-1 text-[10px] text-zinc-500">{msg.author?.name}</p>
                          )}

                          {/* Reply-to quote */}
                          {msg.reply_to && (
                            <div className={`mb-1 max-w-full rounded-lg border-l-2 border-[var(--accent-color)]/60 bg-white/5 px-3 py-1.5 ${msg.is_mine ? "items-end" : "items-start"}`}>
                              <p className="text-[10px] font-medium text-[var(--accent-color)]/80">{msg.reply_to.author_name}</p>
                              <p className="truncate text-[11px] text-zinc-500">
                                {msg.reply_to.content.startsWith(TICKER_PREFIX)
                                  ? `📈 ${msg.reply_to.content.slice(TICKER_PREFIX.length)}`
                                  : msg.reply_to.content}
                              </p>
                            </div>
                          )}

                          {/* Message bubble */}
                          {isEditing ? (
                            <div className="flex min-w-[200px] flex-col gap-1">
                              <input
                                autoFocus
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void saveEdit(msg.id); }
                                  if (e.key === "Escape") setEditingMsgId(null);
                                }}
                                className="rounded-xl border border-[var(--accent-color)]/50 bg-[#0F1520] px-3 py-2 text-sm text-zinc-100 outline-none"
                              />
                              <div className="flex gap-1.5 text-[10px]">
                                <button type="button" onClick={() => void saveEdit(msg.id)} className="text-[var(--accent-color)] hover:underline">Save</button>
                                <span className="text-zinc-600">·</span>
                                <button type="button" onClick={() => setEditingMsgId(null)} className="text-zinc-500 hover:underline">Cancel</button>
                                <span className="text-zinc-600">· Esc to cancel</span>
                              </div>
                            </div>
                          ) : msg.content.startsWith(TICKER_PREFIX) ? (
                            <div>
                              <TickerCardMsg
                                symbol={msg.content.slice(TICKER_PREFIX.length)}
                              />
                              <p className={`mt-1 px-1 text-[10px] ${msg.is_mine ? "text-[#020308]/60" : "text-zinc-600"}`}>
                                {fmtTime(msg.created_at)}
                              </p>
                            </div>
                          ) : (
                            <div className={`rounded-2xl px-4 py-2.5 ${
                              msg.is_mine
                                ? "bg-[var(--accent-color)] text-[#020308]"
                                : "border border-white/10 bg-[#0F1520] text-zinc-200"
                            }`}>
                              <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                              <p className={`mt-1 text-[10px] ${msg.is_mine ? "text-[#020308]/60" : "text-zinc-600"}`}>
                                {fmtTime(msg.created_at)}{msg.edited_at ? " · edited" : ""}
                              </p>
                            </div>
                          )}

                          {/* Reactions */}
                          {(msg.reactions ?? []).length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {(msg.reactions ?? []).map((r) => (
                                <button
                                  key={r.emoji}
                                  type="button"
                                  onClick={() => void toggleReaction(msg.id, r.emoji)}
                                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                                    r.by_me
                                      ? "border-[var(--accent-color)]/50 bg-[var(--accent-color)]/10 text-[var(--accent-color)]"
                                      : "border-white/10 bg-white/5 text-zinc-300 hover:border-white/20"
                                  }`}
                                >
                                  <span>{r.emoji}</span>
                                  <span>{r.count}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {(isSeen || isDelivered) && (
                          <p className="mt-0.5 text-[10px] text-zinc-500">
                            {isSeen ? "Seen" : "Delivered"}
                          </p>
                        )}
                      </div>
                    );
                  });
                })()}
                <div ref={messagesEndRef} />
              </div>

              {/* Typing indicator */}
              {typingUsers.length > 0 && (
                <div className="flex items-center gap-2 px-5 pb-1">
                  <span className="flex gap-0.5">
                    {[0,1,2].map((i) => (
                      <span key={i} className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {typingUsers.length === 1 ? `${typingUsers[0]} is typing…` : `${typingUsers.join(", ")} are typing…`}
                  </span>
                </div>
              )}

              {/* Input */}
              <div className="shrink-0 border-t border-white/10 p-4">
                {/* Reply-to bar */}
                {replyingTo && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg border-l-2 border-[var(--accent-color)]/60 bg-white/5 px-3 py-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-medium text-[var(--accent-color)]/80">Replying to {replyingTo.author_name}</p>
                      <p className="truncate text-[11px] text-zinc-500">
                        {replyingTo.content.startsWith(TICKER_PREFIX)
                          ? `📈 ${replyingTo.content.slice(TICKER_PREFIX.length)}`
                          : replyingTo.content}
                      </p>
                    </div>
                    <button type="button" onClick={() => setReplyingTo(null)} className="shrink-0 text-zinc-600 hover:text-zinc-300">✕</button>
                  </div>
                )}
                {/* Ticker picker */}
                {tickerPickerOpen && (
                  <div className="mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-[#0F1520] px-3 py-2">
                    <svg className="h-4 w-4 shrink-0 text-[var(--accent-color)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                    </svg>
                    <input
                      autoFocus
                      type="text"
                      value={tickerInput}
                      onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && tickerInput.trim()) { e.preventDefault(); void sendTickerCard(tickerInput); }
                        if (e.key === "Escape") { setTickerPickerOpen(false); setTickerInput(""); }
                      }}
                      placeholder="Enter ticker symbol (e.g. AAPL, BTC)…"
                      className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => { if (tickerInput.trim()) void sendTickerCard(tickerInput); }}
                      disabled={!tickerInput.trim()}
                      className="rounded-lg bg-[var(--accent-color)] px-3 py-1 text-xs font-medium text-[#020308] disabled:opacity-40"
                    >Share</button>
                    <button type="button" onClick={() => { setTickerPickerOpen(false); setTickerInput(""); }} className="text-zinc-600 hover:text-zinc-300">✕</button>
                  </div>
                )}
                <div className="flex gap-2">
                  {/* Ticker share button */}
                  <button
                    type="button"
                    onClick={() => { setTickerPickerOpen((o) => !o); setTickerInput(""); }}
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 transition hover:border-[var(--accent-color)]/40 hover:text-[var(--accent-color)] ${tickerPickerOpen ? "border-[var(--accent-color)]/40 text-[var(--accent-color)]" : "text-zinc-400"}`}
                    title="Share ticker card"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                    </svg>
                  </button>
                  <input
                    type="text"
                    value={input}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
                    placeholder={`Message ${convDisplayName(selectedConv)}…`}
                    className="flex-1 rounded-xl border border-white/10 bg-[#0F1520] px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-[var(--accent-color)]/50"
                    onChange={(e) => {
                      setInput(e.target.value);
                      if (!channelRef.current || !user) return;
                      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                      void channelRef.current.send({ type: "broadcast", event: "typing", payload: { name: user.name || user.username || "Someone", userId: user.id } });
                      typingTimeoutRef.current = setTimeout(() => {}, 2500);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void sendMessage()}
                    disabled={!input.trim() || sending}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-color)] text-[#020308] transition hover:opacity-90 disabled:opacity-40"
                    aria-label="Send"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="rounded-full bg-white/5 p-4">
                <svg className="h-8 w-8 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-sm text-zinc-500">Select a conversation or search for someone to message</p>
            </div>
          )}
        </main>
      </div>
    </>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#0A0E1A]">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-[var(--accent-color)]" />
      </div>
    }>
      <MessagesContent />
    </Suspense>
  );
}
