"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { getInitials } from "../../lib/suggested-people";
import { SAMPLE_DMS, SAMPLE_GROUPS, type Message } from "../../lib/messages-data";

const CARD_BG = "#0F1520";

function formatMessageTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 60000;
  if (diff < 1) return "Now";
  if (diff < 60) return `${Math.floor(diff)}m`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const TYPING_REPLY_MSG: Record<string, string> = {
  sarah_macro: "Yeah could see that. I'll add if we break.",
  torres_flow: "Makes sense. Good luck with the week.",
  alex_fx: "Agreed, data dependency is key.",
  lee_crypto: "Watching that level too.",
  priya_etf: "Thanks, will take a look!",
};

function MessagesContent() {
  const searchParams = useSearchParams();
  const withHandle = searchParams.get("with");
  const [activeTab, setActiveTab] = useState<"dms" | "groups">("dms");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIsGroup, setSelectedIsGroup] = useState(false);
  const [dmMessages, setDmMessages] = useState<Record<string, Message[]>>(() =>
    Object.fromEntries(SAMPLE_DMS.map((c) => [c.id, [...c.messages]]))
  );
  const [groupMessages, setGroupMessages] = useState<Record<string, Message[]>>(() =>
    Object.fromEntries(SAMPLE_GROUPS.map((c) => [c.id, [...c.messages]]))
  );
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageIdRef = useRef(0);

  useEffect(() => {
    if (!withHandle) return;
    const dm = SAMPLE_DMS.find((d) => d.handle === withHandle);
    if (!dm) return;
    queueMicrotask(() => {
      setSelectedId(dm.id);
      setSelectedIsGroup(false);
      setActiveTab("dms");
    });
  }, [withHandle]);
  const hasAnyConversations = SAMPLE_DMS.length > 0 || SAMPLE_GROUPS.length > 0;

  const scrollToBottom = useCallback(() => {
    queueMicrotask(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }));
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [dmMessages, groupMessages, typing, scrollToBottom]);

  const currentDm = selectedId && !selectedIsGroup ? SAMPLE_DMS.find((d) => d.id === selectedId) : null;
  const currentGroup = selectedId && selectedIsGroup ? SAMPLE_GROUPS.find((g) => g.id === selectedId) : null;
  const displayName = currentDm?.name ?? currentGroup?.name ?? "";
  const displayHandle = currentDm?.handle ?? "";
  const isOnline = currentDm?.online ?? false;

  const messages = selectedId
    ? selectedIsGroup
      ? groupMessages[selectedId] ?? []
      : dmMessages[selectedId] ?? []
    : [];

  const sendMessage = () => {
    const text = input.trim();
    if (!text || !selectedId) return;
    messageIdRef.current += 1;
    const at = new Date().toISOString();
    const newMsg: Message = { id: `new-${messageIdRef.current}`, from: "me", text, at };
    if (selectedIsGroup) {
      setGroupMessages((prev) => ({
        ...prev,
        [selectedId]: [...(prev[selectedId] ?? []), newMsg],
      }));
    } else {
      setDmMessages((prev) => ({
        ...prev,
        [selectedId]: [...(prev[selectedId] ?? []), newMsg],
      }));
    }
    setInput("");
    setTyping(true);
    const replyText = selectedIsGroup ? "Thanks for sharing." : (TYPING_REPLY_MSG[selectedId] ?? "Got it.");
    setTimeout(() => {
      messageIdRef.current += 1;
      const reply: Message = {
        id: `reply-${messageIdRef.current}`,
        from: selectedIsGroup ? (currentGroup?.messages?.[0]?.from ?? "member") : selectedId,
        text: replyText ?? "Got it.",
        at: new Date().toISOString(),
      };
      if (selectedIsGroup) {
        setGroupMessages((prev) => ({
          ...prev,
          [selectedId]: [...(prev[selectedId] ?? []), reply],
        }));
      } else {
        setDmMessages((prev) => ({
          ...prev,
          [selectedId]: [...(prev[selectedId] ?? []), reply],
        }));
      }
      setTyping(false);
    }, 1000);
  };


  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-[#0A0E1A]">
      {/* Left: conversation list */}
      <aside
        className={`flex w-full flex-col border-r border-white/10 md:w-[300px] ${selectedId ? "hidden md:flex" : ""}`}
        style={{ backgroundColor: CARD_BG }}
      >
        <div className="border-b border-white/10 p-3">
          <input
            type="search"
            placeholder="Search messages..."
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-[var(--accent-color)]/50"
          />
        </div>
        <div className="flex border-b border-white/10 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("dms")}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              activeTab === "dms" ? "bg-[var(--accent-color)]/20 text-[var(--accent-color)]" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            DMs
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("groups")}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              activeTab === "groups" ? "bg-[var(--accent-color)]/20 text-[var(--accent-color)]" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Groups
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto p-2">
          {!hasAnyConversations && (
            <li className="px-3 py-6 text-center text-sm text-zinc-500">
              No conversations yet.
              <Link href="/people" className="mt-2 block text-[var(--accent-color)] hover:underline">
                Find people to start a chat
              </Link>
            </li>
          )}
          {activeTab === "dms" &&
            SAMPLE_DMS.map((c) => {
              const msgs = dmMessages[c.id] ?? c.messages;
              const last = msgs[msgs.length - 1];
              const isActive = selectedId === c.id && !selectedIsGroup;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(c.id);
                      setSelectedIsGroup(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      isActive ? "bg-[var(--accent-color)]/10 text-[var(--accent-color)]" : "hover:bg-white/5"
                    }`}
                  >
                    <div className="relative shrink-0">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-[var(--accent-color)]">
                        {getInitials(c.name)}
                      </span>
                      {c.online && (
                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#0F1520] bg-[var(--accent-color)]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-200">{c.name}</p>
                      <p className="truncate text-xs text-zinc-500">{last?.text ?? c.lastMessage}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-zinc-500">{formatMessageTime(last?.at ?? c.lastAt)}</p>
                      {c.unread > 0 && (
                        <span className="mt-1 flex justify-end">
                          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--accent-color)] px-1.5 text-[10px] font-bold text-[#020308]">
                            {c.unread}
                          </span>
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          {activeTab === "groups" &&
            SAMPLE_GROUPS.map((g) => {
              const msgs = groupMessages[g.id] ?? g.messages;
              const last = msgs[msgs.length - 1];
              const isActive = selectedId === g.id && selectedIsGroup;
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(g.id);
                      setSelectedIsGroup(true);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      isActive ? "bg-[var(--accent-color)]/10 text-[var(--accent-color)]" : "hover:bg-white/5"
                    }`}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-zinc-400">
                      {g.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-200">{g.name}</p>
                      <p className="truncate text-xs text-zinc-500">{last?.text ?? g.lastMessage}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-zinc-500">{formatMessageTime(last?.at ?? g.lastAt)}</p>
                      {g.unread > 0 && (
                        <span className="mt-1 flex justify-end">
                          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--accent-color)] px-1.5 text-[10px] font-bold text-[#020308]">
                            {g.unread}
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

      {/* Right: active conversation */}
      <main
        className={`flex flex-1 flex-col bg-[#0A0E1A] ${!selectedId ? "hidden md:flex" : ""}`}
      >
        {selectedId ? (
          <>
            <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="rounded p-2 text-zinc-400 hover:bg-white/5 hover:text-zinc-200 md:hidden"
                aria-label="Back to list"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-[var(--accent-color)]">
                {currentGroup ? displayName.slice(0, 2).toUpperCase() : getInitials(displayName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-zinc-100">{displayName}</p>
                <p className="text-xs text-zinc-500">
                  {currentGroup ? `${currentGroup.memberCount} members` : `@${displayHandle}`}
                  {!currentGroup && (
                    <span className={isOnline ? "text-[var(--accent-color)]" : "text-zinc-500"}>
                      {" "}
                      · {isOnline ? "Online" : "Offline"}
                    </span>
                  )}
                </p>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.from === "me" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                      msg.from === "me"
                        ? "bg-[var(--accent-color)] text-[#020308]"
                        : "bg-[#0F1520] text-zinc-200 border border-white/10"
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-sm">{msg.text}</p>
                    <p className={`mt-1 text-[10px] ${msg.from === "me" ? "text-[#020308]/70" : "text-zinc-500"}`}>
                      {formatMessageTime(msg.at)}
                    </p>
                  </div>
                </div>
              ))}
              {typing && (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-white/10 bg-[#0F1520] px-4 py-3">
                    <span className="flex gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:0ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:150ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:300ms]" />
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="shrink-0 border-t border-white/10 p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  placeholder={currentGroup ? `Message ${displayName}...` : `Message @${displayHandle}...`}
                  className="flex-1 rounded-xl border border-white/10 bg-[#0F1520] px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-[var(--accent-color)]/50"
                />
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={!input.trim()}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-color)] text-[#020308] transition-opacity hover:opacity-90 disabled:opacity-50"
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
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <p className="text-zinc-500">Select a conversation or start a new message.</p>
            <Link href="/people" className="mt-2 block text-sm text-[var(--accent-color)] hover:underline">
              Find people to message
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#0A0E1A]"><div className="h-8 w-8 animate-pulse rounded-full bg-white/10" /></div>}>
      <MessagesContent />
    </Suspense>
  );
}
