"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../components/AuthContext";
import { XchangeLogoImage } from "../../components/XchangeLogoImage";
import { XchangeLogoIcon } from "../../components/XchangeLogoIcon";
import { AiMarkdown } from "../../components/AiMarkdown";
import {
  getStoredConversations,
  deleteConversation,
  getPortfolioContext,
  setPortfolioContext,
  type StoredConversation,
} from "../../lib/ai-chat-storage";
import { setLastWorkspaceTab } from "../../lib/workspace-tab";

const QUICK_TOPICS: { label: string; message: string; badge: string }[] = [
  { label: "Markets Overview", message: "Give me a concise markets overview: key indices, sectors, and what’s driving price action lately.", badge: "📈" },
  { label: "Crypto Analysis", message: "What should I know about crypto right now—BTC, ETH, macro drivers, and key levels?", badge: "🪙" },
  { label: "Global Macro", message: "Summarize the main global macro themes affecting markets: rates, growth, and geopolitics.", badge: "🌍" },
  { label: "Technical Analysis", message: "Explain the main concepts of technical analysis and how I can use them in my trading.", badge: "📊" },
  { label: "Portfolio Strategy", message: "What are sound portfolio strategy principles for a retail investor?", badge: "💼" },
  { label: "Trading Psychology", message: "What are the biggest trading psychology pitfalls and how can I avoid them?", badge: "🧠" },
  { label: "News Impact", message: "How does news flow typically impact markets and how can I trade around it?", badge: "📰" },
  { label: "Learn Trading", message: "I’m new to trading. What are the first concepts I should learn and in what order?", badge: "🎓" },
];

const WELCOME_CHIPS = [
  "📈 Explain the current market conditions",
  "🔍 What is a P/E ratio?",
  "⚡ Best ETFs for a moderate investor",
  "🌍 How do interest rates affect stocks?",
  "📓 Review my trading style",
  "🚨 What are the biggest market risks now?",
];

const TOPIC_BADGES: Record<string, string> = {
  market: "📈 Discussing: Equities",
  crypto: "🪙 Discussing: Crypto",
  macro: "🌍 Discussing: Global Macro",
  technical: "📊 Discussing: Technical Analysis",
  portfolio: "💼 Discussing: Portfolio",
  psychology: "🧠 Discussing: Psychology",
  news: "📰 Discussing: News Impact",
  learn: "🎓 Discussing: Learn Trading",
};

type ChatMessage = { role: "user" | "assistant"; content: string; id: string };
const MAX_INPUT_LENGTH = 4000;

function getInitials(name: string | undefined, username: string | undefined, email: string | undefined) {
  const n = (name || username || email || "?").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

function detectTopic(lastContent: string): string | null {
  const lower = lastContent.toLowerCase();
  if (/\b(equit(y|ies)|stock|index|etf|s&p|nasdaq)\b/.test(lower)) return TOPIC_BADGES.market;
  if (/\b(crypto|bitcoin|btc|eth|token)\b/.test(lower)) return TOPIC_BADGES.crypto;
  if (/\b(macro|rates|fed|inflation|geopolitic)\b/.test(lower)) return TOPIC_BADGES.macro;
  if (/\b(technical|chart|support|resistance|rsi|macd)\b/.test(lower)) return TOPIC_BADGES.technical;
  if (/\b(portfolio|diversif|allocation)\b/.test(lower)) return TOPIC_BADGES.portfolio;
  if (/\b(psycholog|emotion|discipline)\b/.test(lower)) return TOPIC_BADGES.psychology;
  if (/\b(news|headline|earnings)\b/.test(lower)) return TOPIC_BADGES.news;
  if (/\b(learn|beginner|basics)\b/.test(lower)) return TOPIC_BADGES.learn;
  return null;
}

type ChatMessageForDb = { role: "user" | "assistant"; content: string };

function titleFromMessages(messages: ChatMessageForDb[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  const raw = (firstUser?.content ?? "").trim();
  if (!raw) return "New chat";
  const trimmed = raw.slice(0, 50);
  return raw.length > 50 ? `${trimmed}...` : trimmed;
}

function formatTimeAgo(input: string | number | null | undefined): string {
  const ms =
    typeof input === "number"
      ? input
      : input
        ? new Date(input).getTime()
        : NaN;
  if (!Number.isFinite(ms)) return "—";
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

const AI_SHARE_KEY = "xchange-ai-share";
const AI_PANEL_STATE_KEY = "xchange-ai-panel-state";
const AI_LOCAL_CONVERSATIONS_KEY = "xchange-ai-conversations";

export default function AIPage() {
  const router = useRouter();
  const { user } = useAuth();
  useEffect(() => { setLastWorkspaceTab("ai"); }, []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [topicBadge, setTopicBadge] = useState<string | null>(null);
  const [leftPanelOpen, setLeftPanelOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = window.localStorage.getItem(AI_PANEL_STATE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { leftOpen?: boolean; rightOpen?: boolean };
        return parsed.leftOpen ?? true;
      }
    } catch {
      // ignore
    }
    return true;
  });
  const [recentPanelOpen, setRecentPanelOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = window.localStorage.getItem(AI_PANEL_STATE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { leftOpen?: boolean; rightOpen?: boolean };
        return parsed.rightOpen ?? true;
      }
    } catch {
      // ignore
    }
    return true;
  });
  const [autoSaving, setAutoSaving] = useState(false);
  const [autoSaveFailed, setAutoSaveFailed] = useState(false);
  const [autoSaveRetryInSec, setAutoSaveRetryInSec] = useState<number | null>(null);
  const [portfolioModalOpen, setPortfolioModalOpen] = useState(false);
  const [portfolioContext, setPortfolioContextState] = useState("");
  const [followUps, setFollowUps] = useState<Record<string, string[]>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [recentChats, setRecentChats] = useState<StoredConversation[]>([]);
  const [loadedConversationId, setLoadedConversationId] = useState<string | null>(null);
  const [renamingConversationId, setRenamingConversationId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirmConv, setDeleteConfirmConv] = useState<StoredConversation | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const retryTimerRef = useRef<number | null>(null);
  const pendingPersistRef = useRef<{
    id?: string;
    title: string;
    messages: ChatMessageForDb[];
  } | null>(null);
  const persistInFlightRef = useRef(false);
  const loadedConversationIdRef = useRef<string | null>(null);
  loadedConversationIdRef.current = loadedConversationId;

  const scrollToBottom = useCallback(() => {
    const el = messagesScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    setPortfolioContextState(getPortfolioContext());
  }, []);

  useEffect(() => {
    let didMigrate = false;
    const init = async () => {
      const localConvs = getStoredConversations();

      // Try Supabase first
      try {
        const res = await fetch("/api/ai-conversations", { cache: "no-store" });
        if (!res.ok) throw new Error(`api ${res.status}`);
        const json = (await res.json()) as { conversations?: Array<any> };
        const rows = Array.isArray(json.conversations) ? json.conversations : [];

        const mapped: StoredConversation[] = rows
          .slice(0, 10)
          .map((r) => ({
          id: String(r.id),
          label: r.title ?? "New chat",
          messages: (r.messages ?? []) as Array<{ role: "user" | "assistant"; content: string }>,
          at: r.updated_at
            ? new Date(r.updated_at).getTime()
            : r.created_at
              ? new Date(r.created_at).getTime()
              : Date.now(),
        }));

        setRecentChats(mapped);

        // Migration: move localStorage conversations into Supabase once.
        if (localConvs.length > 0) {
          didMigrate = true;
          let allSaved = true;
          for (const conv of localConvs) {
            try {
              const saveRes = await fetch("/api/ai-conversations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: conv.label,
                  messages: conv.messages,
                }),
              });
              if (!saveRes.ok) throw new Error(`save ${saveRes.status}`);
              // eslint-disable-next-line no-await-in-loop
            } catch {
              allSaved = false;
            }
          }

          if (allSaved) {
            window.localStorage.removeItem(AI_LOCAL_CONVERSATIONS_KEY);
            const refetch = await fetch("/api/ai-conversations", { cache: "no-store" });
            if (refetch.ok) {
              const refetchJson = (await refetch.json()) as { conversations?: Array<any> };
              const refetchRows = Array.isArray(refetchJson.conversations) ? refetchJson.conversations : [];
              setRecentChats(
                refetchRows.slice(0, 10).map((r) => ({
                  id: String(r.id),
                  label: r.title ?? "New chat",
                  messages: (r.messages ?? []) as Array<{ role: "user" | "assistant"; content: string }>,
                  at: r.updated_at
                    ? new Date(r.updated_at).getTime()
                    : r.created_at
                      ? new Date(r.created_at).getTime()
                      : Date.now(),
                }))
              );
            }
          }
        }
      } catch {
        // Supabase unavailable: fall back to localStorage
        setRecentChats(localConvs);
      }
    };

    init();
    return () => {
      void didMigrate;
    };
  }, []);

  // Persist panel open/collapsed state
  useEffect(() => {
    try {
      window.localStorage.setItem(
        AI_PANEL_STATE_KEY,
        JSON.stringify({ leftOpen: leftPanelOpen, rightOpen: recentPanelOpen })
      );
    } catch {
      // ignore
    }

    // Best-effort: store in profiles.ui_preferences (if the column + endpoint exist)
    fetch("/api/profile/ui-preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aiPanels: { leftOpen: leftPanelOpen, rightOpen: recentPanelOpen },
      }),
    }).catch(() => {
      // ignore
    });
  }, [leftPanelOpen, recentPanelOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [inputValue]);

  const persistConversationAutosave = useCallback(
    async (opts: {
      id?: string | null;
      title: string;
      messages: ChatMessageForDb[];
    }) => {
      const shouldActivate = opts.id
        ? loadedConversationIdRef.current === opts.id
        : loadedConversationIdRef.current === null;

      const payload = {
        id: opts.id ?? undefined,
        title: opts.title,
        messages: opts.messages,
      };

      // Keep latest payload for retries.
      pendingPersistRef.current = payload;

      if (persistInFlightRef.current) return;
      persistInFlightRef.current = true;
      if (shouldActivate) {
        setAutoSaving(true);
        setAutoSaveFailed(false);
        setAutoSaveRetryInSec(null);
      }

      try {
        const res = await fetch("/api/ai-conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const json = (await res.json().catch(() => ({}))) as { conversation?: any; error?: string };
        if (!res.ok) throw new Error(json.error || `api ${res.status}`);

        const conv = json.conversation;
        if (!conv) throw new Error("Missing conversation in response");

        const mapped: StoredConversation = {
          id: String(conv.id),
          label: conv.title ?? opts.title,
          messages: (conv.messages ?? []) as Array<{ role: "user" | "assistant"; content: string }>,
          at: conv.updated_at
            ? new Date(conv.updated_at).getTime()
            : conv.created_at
              ? new Date(conv.created_at).getTime()
              : Date.now(),
        };

        if (shouldActivate) setLoadedConversationId(mapped.id);
        setRecentChats((prev) => {
          const next = prev.filter((c) => c.id !== mapped.id);
          next.unshift(mapped);
          return next.sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, 10);
        });
      } catch (e) {
        if (shouldActivate) {
          setAutoSaveFailed(true);
          setAutoSaveRetryInSec(30);

          // Retry after 30s
          if (!retryTimerRef.current) {
            retryTimerRef.current = window.setTimeout(async () => {
              retryTimerRef.current = null;
              const latest = pendingPersistRef.current;
              if (!latest) return;
              await persistConversationAutosave({
                id: latest.id ?? null,
                title: latest.title,
                messages: latest.messages,
              });
            }, 30000);
          }
        }
      } finally {
        if (shouldActivate) setAutoSaving(false);
        persistInFlightRef.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || loading) return;
      const userMsg: ChatMessage = {
        role: "user",
        content: trimmed,
        id: `u-${Date.now()}`,
      };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setInputValue("");
      setLoading(true);
      setFollowUps((f) => {
        const next = { ...f };
        Object.keys(next).forEach((id) => delete next[id]);
        return next;
      });

      try {
        const res = await fetch("/api/ai-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
            portfolioContext: getPortfolioContext() || undefined,
          }),
        });
        const data = (await res.json()) as { content?: string; followUps?: string[]; error?: string };
        if (!res.ok) {
          const err = data.error || "Something went wrong";
          const assistantContent = `Sorry, I couldn’t complete that. ${err}`;
          const finalDbMessages: ChatMessageForDb[] = [
            ...nextMessages.map((m) => ({ role: m.role, content: m.content })),
            { role: "assistant", content: assistantContent },
          ];

          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: assistantContent, id: `a-${Date.now()}` },
          ]);

          const title = titleFromMessages(finalDbMessages);
          await persistConversationAutosave({
            id: loadedConversationId,
            title,
            messages: finalDbMessages,
          });
          return;
        }
        const assistantId = `a-${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.content ?? "", id: assistantId },
        ]);
        if (Array.isArray(data.followUps) && data.followUps.length > 0) {
          setFollowUps((f) => ({ ...f, [assistantId]: data.followUps! }));
        }
        const lastContent = data.content ?? "";
        setTopicBadge(detectTopic(lastContent));
        const finalDbMessages: ChatMessageForDb[] = [
          ...nextMessages.map((m) => ({ role: m.role, content: m.content })),
          { role: "assistant", content: lastContent },
        ];

        const title = titleFromMessages(finalDbMessages);
        await persistConversationAutosave({
          id: loadedConversationId,
          title,
          messages: finalDbMessages,
        });
      } catch (e) {
        const assistantContent = "Sorry, I couldn’t reach the server. Please try again.";
        const finalDbMessages: ChatMessageForDb[] = [
          ...nextMessages.map((m) => ({ role: m.role, content: m.content })),
          { role: "assistant", content: assistantContent },
        ];
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: assistantContent,
            id: `a-${Date.now()}`,
          },
        ]);

        const title = titleFromMessages(finalDbMessages);
        await persistConversationAutosave({
          id: loadedConversationId,
          title,
          messages: finalDbMessages,
        });
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, loadedConversationId, persistConversationAutosave]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      sendMessage(inputValue);
    },
    [inputValue, sendMessage]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(inputValue);
      }
    },
    [inputValue, sendMessage]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setTopicBadge(null);
    setFollowUps({});
    setLoadedConversationId(null);
    setRenamingConversationId(null);
    setRenameValue("");
    setAutoSaveFailed(false);
    setAutoSaving(false);
    setAutoSaveRetryInSec(null);
    pendingPersistRef.current = null;
  }, []);

  const loadConversation = useCallback(async (conv: StoredConversation) => {
    const fallback = () => {
      setMessages(
        conv.messages.map((m, i) => ({
          role: m.role,
          content: m.content,
          id: `${m.role}-${conv.id}-${i}`,
        }))
      );
      const lastAi = conv.messages.filter((m) => m.role === "assistant").pop();
      setTopicBadge(lastAi ? detectTopic(lastAi.content) : null);
      setFollowUps({});
      setLoadedConversationId(conv.id);
    };

    // Requirement: load from Supabase when possible.
    try {
      const res = await fetch("/api/ai-conversations", { cache: "no-store" });
      if (!res.ok) throw new Error(`api ${res.status}`);
      const json = (await res.json()) as { conversations?: Array<any> };
      const rows = Array.isArray(json.conversations) ? json.conversations : [];
      const row = rows.find((r) => String(r.id) === String(conv.id));
      if (!row) return fallback();
      const msgs = (row.messages ?? []) as Array<{ role: "user" | "assistant"; content: string }>;
      setMessages(
        msgs.map((m, i) => ({
          role: m.role,
          content: m.content,
          id: `${m.role}-${row.id}-${i}`,
        }))
      );
      const lastAi = msgs.filter((m) => m.role === "assistant").pop();
      setTopicBadge(lastAi ? detectTopic(lastAi.content) : null);
      setFollowUps({});
      setLoadedConversationId(String(row.id));
    } catch {
      fallback();
    }
  }, []);

  const confirmDeleteConversation = useCallback((conv: StoredConversation) => {
    setDeleteConfirmConv(conv);
  }, []);

  const doDeleteConversation = useCallback(async () => {
    if (!deleteConfirmConv) return;
    const id = deleteConfirmConv.id;
    let deletedOk = false;
    try {
      const res = await fetch(
        `/api/ai-conversations?id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(`api ${res.status}`);
      deletedOk = true;
    } catch {
      // Local fallback: remove from localStorage.
      const local = getStoredConversations();
      const hasLocal = local.some((x) => x.id === id);
      if (hasLocal) {
        deleteConversation(id);
        deletedOk = true;
      }
    }

    if (deletedOk) {
      setRecentChats((prev) => prev.filter((x) => x.id !== id));
      if (loadedConversationId === id) {
        setMessages([]);
        setTopicBadge(null);
        setFollowUps({});
        setLoadedConversationId(null);
      }
    }
    setDeleteConfirmConv(null);
  }, [deleteConfirmConv, loadedConversationId]);

  const renameConversation = useCallback(
    async (conv: StoredConversation, nextTitleRaw: string) => {
      const nextTitle = nextTitleRaw.trim() || conv.label;
      try {
        const res = await fetch("/api/ai-conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: conv.id,
            title: nextTitle,
            messages: conv.messages,
          }),
        });
        if (!res.ok) throw new Error(`api ${res.status}`);
        const json = (await res.json().catch(() => ({}))) as { conversation?: any; error?: string };
        const saved = json.conversation;
        if (!saved) throw new Error("No conversation returned");

        const mapped: StoredConversation = {
          id: String(saved.id),
          label: saved.title ?? nextTitle,
          messages: (saved.messages ?? []) as Array<{ role: "user" | "assistant"; content: string }>,
          at: saved.updated_at
            ? new Date(saved.updated_at).getTime()
            : saved.created_at
              ? new Date(saved.created_at).getTime()
              : conv.at,
        };

        setRecentChats((prev) => {
          const next = prev.filter((c) => c.id !== mapped.id);
          next.unshift(mapped);
          return next.sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, 10);
        });
      } catch {
        // If rename fails, keep UI in rename mode so user can try again.
      } finally {
        setRenamingConversationId(null);
        setRenameValue("");
      }
    },
    []
  );

  const savePortfolioContext = useCallback((value: string) => {
    setPortfolioContext(value);
    setPortfolioContextState(value);
    setPortfolioModalOpen(false);
  }, []);

  const handleShare = useCallback((content: string) => {
    if (typeof window === "undefined") return;
    const text = `💡 Xchange AI insight:\n\n${content}`;
    try {
      sessionStorage.setItem(AI_SHARE_KEY, JSON.stringify({ content: text }));
    } catch {
      // ignore
    }
    router.push("/feed");
  }, [router]);

  const handleCopy = useCallback((id: string, text: string) => {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      },
      () => {}
    );
  }, []);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();
  const username = user?.name || user?.username || "there";

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 overflow-hidden app-page">
      {/* Left panels: Quick topics + Recent chats (hidden on mobile) */}
      <div
        className={`hidden min-h-0 flex-col border-r border-white/10 bg-[#0A0E1A] transition-all duration-200 lg:flex ${
          leftPanelOpen ? "lg:w-[200px]" : "lg:w-0 lg:overflow-hidden"
        }`}
      >
        <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-white/10 px-3">
          <span className="text-xs font-medium text-zinc-400">Quick topics</span>
          <button
            type="button"
            onClick={() => setLeftPanelOpen(false)}
            className="rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
            aria-label="Collapse panel"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {QUICK_TOPICS.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => sendMessage(t.message)}
              disabled={loading}
              className="w-full rounded-lg px-2 py-2 text-left text-xs text-zinc-300 transition hover:bg-white/5 hover:text-[var(--accent-color)] disabled:opacity-50"
            >
              <span className="mr-1">{t.badge}</span>
              {t.label}
            </button>
          ))}
        </div>
        <div className="border-t border-white/10 p-2">
          <button
            type="button"
            onClick={() => setPortfolioModalOpen(true)}
            className="w-full rounded-lg border border-[var(--accent-color)]/30 bg-[var(--accent-color)]/10 px-2 py-2 text-xs font-medium text-[var(--accent-color)] transition hover:bg-[var(--accent-color)]/20"
          >
            Add my context
          </button>
        </div>
      </div>
      {/* Recent chats panel */}
      <div
        className={`hidden min-h-0 flex-col border-r border-white/10 bg-[#0A0E1A]/80 transition-all duration-200 lg:flex ${
          recentPanelOpen ? "lg:w-[200px]" : "lg:w-0 lg:overflow-hidden"
        }`}
      >
        <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-white/10 px-3">
          <span className="text-xs font-medium text-zinc-400">Recent chats</span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => clearChat()}
              className="rounded px-2 py-1 text-[10px] font-medium text-[var(--accent-color)] hover:bg-white/5"
            >
              New Chat
            </button>
            <button
              type="button"
              onClick={() => setRecentPanelOpen(false)}
              className="rounded p-1 text-zinc-500 hover:bg-white/5"
              aria-label="Collapse"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-2">
          {recentChats.length === 0 ? (
            <p className="px-2 py-3 text-xs text-zinc-500">No previous chats yet</p>
          ) : (
            recentChats.map((c) => {
              const isActive = c.id === loadedConversationId;
              const isRenaming = c.id === renamingConversationId;
              return (
                <div
                  key={c.id}
                  onClick={() => loadConversation(c)}
                  className={`group flex items-center gap-0.5 rounded-lg px-1 hover:bg-white/5 ${
                    isActive ? "border border-[var(--accent-color)]/30 bg-white/5" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1 py-2 pl-2">
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => renameConversation(c, renameValue)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                          if (e.key === "Escape") {
                            setRenamingConversationId(null);
                            setRenameValue("");
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-[var(--accent-color)]"
                      />
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            loadConversation(c);
                          }}
                          className="min-w-0 flex-1 text-left"
                          title={c.label}
                        >
                          <div
                            className={`truncate text-xs ${
                              isActive ? "text-zinc-200" : "text-zinc-400"
                            } hover:text-zinc-200`}
                          >
                            {c.label}
                          </div>
                        </button>

                        <div
                          className="flex shrink-0 items-center rounded p-0.5 text-zinc-500 opacity-0 transition group-hover:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingConversationId(c.id);
                              setRenameValue(c.label);
                            }}
                            className="rounded p-1.5 transition hover:bg-white/5 hover:text-zinc-200"
                            aria-label={`Rename "${c.label}"`}
                            title="Rename"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmDeleteConversation(c);
                            }}
                            className="rounded p-1.5 transition hover:bg-white/5 hover:text-red-400"
                            aria-label={`Delete "${c.label.slice(0, 30)}..."`}
                            title="Delete conversation"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}

                    {!isRenaming && (
                      <div className="mt-0.5 text-[10px] text-zinc-500">
                        {formatTimeAgo(c.at)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          {deleteConfirmConv && (
            <div className="mt-2 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
              <span className="shrink-0 text-amber-400" aria-hidden>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
              <p className="text-[11px] text-amber-200/90">Are you sure you want to delete this chat?</p>
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  onClick={doDeleteConversation}
                  className="rounded bg-red-500/20 px-2 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/30"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmConv(null)}
                  className="rounded bg-white/10 px-2 py-1 text-[11px] font-medium text-zinc-400 hover:bg-white/15"
                >
                  Cancel
                </button>
              </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Main chat column */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--app-bg)]">
        {/* AI Assistant header + reopen panels strip just below it */}
        <div className="relative flex-shrink-0 border-b border-white/10">
          <header className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0 rounded-lg border border-white/10 bg-white/5 p-0.5">
                <span className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-zinc-100">AI Chat</span>
                <Link href="/dashboard" className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 transition hover:bg-white/5 hover:text-[var(--accent-color)]" title="Dashboard">Dashboard</Link>
                <Link
                  href="/whiteboard"
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 transition hover:bg-white/5 hover:text-[var(--accent-color)]"
                >
                  Whiteboard
                </Link>
              </div>
              {topicBadge && (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">
                  {topicBadge}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              Ask me anything about markets, trading, economics, or your portfolio
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-zinc-500">
              Powered by Claude
            </span>
            {autoSaving && (
              <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">
                saving...
              </span>
            )}
            {autoSaveFailed && !autoSaving && (
              <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-400">
                Auto-save failed{autoSaveRetryInSec ? `, retrying in ${autoSaveRetryInSec}s` : ""}
              </span>
            )}
          </div>
          </header>
          {/* Reopen panels: just under "AI Assistant" header (desktop only) */}
          {(!leftPanelOpen || !recentPanelOpen) && (
            <div
              className="absolute left-0 top-full z-20 hidden flex-col gap-0.5 rounded-br border-b border-r border-white/10 bg-[#0A0E1A] py-1.5 pl-1 pr-1.5 shadow-md lg:flex"
              aria-label="Open panels"
            >
              {!leftPanelOpen && (
                <button
                  type="button"
                  onClick={() => setLeftPanelOpen(true)}
                  className="flex items-center gap-1 rounded px-1.5 py-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-[var(--accent-color)]"
                  aria-label="Open Quick topics"
                  title="Quick topics"
                >
                  <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-[11px] font-medium">Topics</span>
                </button>
              )}
              {!recentPanelOpen && (
                <button
                  type="button"
                  onClick={() => setRecentPanelOpen(true)}
                  className="flex items-center gap-1 rounded px-1.5 py-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-[var(--accent-color)]"
                  aria-label="Open Recent chats"
                  title="Recent chats"
                >
                  <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-[11px] font-medium">Recent</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Messages area: only this scrolls, so layout doesn't shift */}
        <div
          ref={messagesScrollRef}
          className="ai-chat-grid-bg flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-4"
          style={{ backgroundColor: "var(--app-bg)" }}
        >
          {messages.length === 0 && !loading ? (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
              <div className="ai-welcome-logo-pulse mb-4">
                <XchangeLogoImage size={80} />
              </div>
              <p className="text-lg font-medium text-zinc-200">
                {greeting}, {username}
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                What would you like to know about the markets today?
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {WELCOME_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => sendMessage(chip)}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-300 transition hover:border-[var(--accent-color)]/30 hover:bg-[var(--accent-color)]/10 hover:text-[var(--accent-color)]"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex gap-3 animate-[fadeIn_0.25s_ease-out] ${
                    m.role === "user" ? "flex-row-reverse" : ""
                  }`}
                >
                  {m.role === "user" ? (
                    <>
                      <div
                        className="max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-white"
                        style={{ backgroundColor: "var(--accent-color)" }}
                      >
                        {m.content}
                      </div>
                      <div
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-[var(--accent-color)] ring-1 ring-white/20"
                        style={{ backgroundColor: "color-mix(in srgb, var(--accent-color) 25%, transparent)" }}
                      >
                        {user ? getInitials(user.name, user.username, user.email) : "?"}
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full"
                        style={{ backgroundColor: "#0F1520" }}
                      >
                        <XchangeLogoImage size={32} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div
                          className="rounded-2xl rounded-tl-sm bg-[#0F1520] px-4 py-3 text-sm text-zinc-100"
                        >
                          <AiMarkdown content={m.content} />
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopy(m.id, m.content)}
                            className="rounded px-2 py-0.5 text-[10px] text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                          >
                            {copiedId === m.id ? "Copied!" : "Copy"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleShare(m.content)}
                            className="rounded px-2 py-0.5 text-[10px] text-zinc-500 hover:bg-white/5 hover:text-[var(--accent-color)]"
                          >
                            Share
                          </button>
                        </div>
                        {followUps[m.id]?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {followUps[m.id].map((q, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => sendMessage(q)}
                                disabled={loading}
                                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-400 transition hover:border-[var(--accent-color)]/30 hover:text-[var(--accent-color)] disabled:opacity-50"
                              >
                                {q}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex gap-3 animate-[fadeIn_0.2s_ease-out]">
                  <div
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full"
                    style={{ backgroundColor: "#0F1520" }}
                  >
                    <XchangeLogoImage size={32} />
                  </div>
                  <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-[#0F1520] px-4 py-3">
                    <span className="ai-typing-dot h-2 w-2 rounded-full bg-zinc-500" />
                    <span className="ai-typing-dot h-2 w-2 rounded-full bg-zinc-500" />
                    <span className="ai-typing-dot h-2 w-2 rounded-full bg-zinc-500" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="flex-shrink-0 border-t border-white/10 bg-[var(--app-bg)] p-4">
          <form onSubmit={handleSubmit} className="mx-auto max-w-2xl">
            <div className="flex gap-2 rounded-xl border border-white/10 bg-[#0F1520] transition-[box-shadow] focus-within:border-[var(--accent-color)]/40 focus-within:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent-color)_20%,transparent)]">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value.slice(0, MAX_INPUT_LENGTH))}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about markets..."
                rows={1}
                disabled={loading}
                className="min-h-[44px] flex-1 resize-none bg-transparent px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none disabled:opacity-60"
                style={{ maxHeight: 160 }}
              />
              <button
                type="submit"
                disabled={loading || !inputValue.trim()}
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-white disabled:opacity-40"
                style={{ backgroundColor: "var(--accent-color)" }}
                aria-label="Send"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
            {inputValue.length >= MAX_INPUT_LENGTH * 0.9 && (
              <p className="mt-1 text-right text-[10px] text-zinc-500">
                {inputValue.length} / {MAX_INPUT_LENGTH}
              </p>
            )}
          </form>
        </div>
      </div>

      {/* Portfolio context modal */}
      {portfolioModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPortfolioModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-xl border border-white/10 bg-[#0F1520] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-zinc-200">Add my context</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Paste your portfolio summary or situation. This is added to the AI’s context for personalized advice (stored locally).
            </p>
            <textarea
              value={portfolioContext}
              onChange={(e) => setPortfolioContextState(e.target.value)}
              placeholder="e.g. I hold 60% stocks, 40% bonds. I’m 35 and saving for retirement..."
              rows={4}
              className="mt-3 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-[var(--accent-color)]/50"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPortfolioModalOpen(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => savePortfolioContext(portfolioContext)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
                style={{ backgroundColor: "var(--accent-color)" }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
