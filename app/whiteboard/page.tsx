"use client";

import "@excalidraw/excalidraw/index.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
  startTransition,
} from "react";
import dynamic from "next/dynamic";
import { XchangeLogoImage } from "../../components/XchangeLogoImage";
import { useToast } from "../../components/ToastContext";
import {
  getSavedBoards,
  saveBoard,
  deleteBoard,
  MAX_BOARDS,
  getCollaborationBannerDismissed,
  setCollaborationBannerDismissed,
  type SavedBoard,
} from "../../lib/whiteboard-storage";

const TOP_BAR_BG = "#080B14";
const AI_SHARE_KEY = "xchange-ai-share";

const TEMPLATES: { id: string; label: string; icon: string; desc: string; getScene: () => { elements: unknown[]; appState: Record<string, unknown> } }[] = [
  {
    id: "trade-setup",
    label: "Trade Setup",
    icon: "📈",
    desc: "Entry Zone, Target, Stop Loss, Risk/Reward, Notes",
    getScene: () => ({ elements: [], appState: { viewBackgroundColor: "#1e1e2e" } }),
  },
  {
    id: "market-thesis",
    label: "Market Thesis",
    icon: "🧠",
    desc: "Macro Environment, Catalyst, Trade Idea, Risk Factors, Timeline",
    getScene: () => ({ elements: [], appState: { viewBackgroundColor: "#1e1e2e" } }),
  },
  {
    id: "earnings-preview",
    label: "Earnings Preview",
    icon: "📊",
    desc: "Expected EPS, Revenue, Key watch items, Trade plan, Post-earnings notes",
    getScene: () => ({ elements: [], appState: { viewBackgroundColor: "#1e1e2e" } }),
  },
  {
    id: "macro-map",
    label: "Macro Map Notes",
    icon: "🌍",
    desc: "Empty canvas for global market zones",
    getScene: () => ({ elements: [], appState: { viewBackgroundColor: "#1e1e2e" } }),
  },
];

const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((mod) => mod.Excalidraw),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center bg-[#0a0e1a] text-zinc-400">Loading whiteboard...</div> }
);

/** Inline-editable board name in My Boards; keeps typing out of parent to avoid heavy re-renders. */
function BoardListItem({
  board,
  isCurrent,
  onSelect,
  onDelete,
  onRename,
}: {
  board: SavedBoard;
  isCurrent: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (id: string, newName: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(board.name);

  useEffect(() => {
    setValue(board.name);
  }, [board.name]);

  const startEdit = () => {
    setValue(board.name);
    setIsEditing(true);
  };

  const commitRename = () => {
    const trimmed = value.trim() || board.name;
    if (trimmed !== board.name) onRename(board.id, trimmed);
    setValue(trimmed);
    setIsEditing(false);
  };

  return (
    <div
      className="group flex items-center gap-1 rounded py-1"
      role="button"
      tabIndex={0}
      onClick={() => {
        if (!isEditing && !isCurrent) onSelect();
      }}
      onKeyDown={(e) => {
        if (!isEditing && !isCurrent && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {isEditing ? (
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 rounded border border-white/20 bg-white/5 px-1.5 py-0.5 text-xs text-zinc-100 outline-none focus:border-[var(--accent-color)]"
          autoFocus
        />
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            startEdit();
          }}
          title="Click to rename"
          className={`min-w-0 flex-1 truncate text-left text-sm hover:text-white ${isCurrent ? "cursor-default font-medium text-[var(--accent-color)]" : "text-zinc-400"}`}
        >
          {board.name}
        </button>
      )}
      {!isEditing && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="shrink-0 rounded p-1 text-zinc-500 opacity-0 hover:bg-white/5 hover:text-red-400 group-hover:opacity-100"
          aria-label="Delete board"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      )}
    </div>
  );
}

export default function WhiteboardPage() {
  const router = useRouter();
  const toast = useToast();
  const [boardId, setBoardId] = useState<string>(() => `board-${Date.now()}`);
  const [boardName, setBoardName] = useState("My Trading Board");
  const [boards, setBoards] = useState<SavedBoard[]>([]);
  const newBoardInProgressRef = useRef(false);
  const [boardsPanelOpen, setBoardsPanelOpen] = useState(true);
  const [elements, setElements] = useState<unknown[]>([]);
  const [appState, setAppState] = useState<Record<string, unknown>>({});
  const [files, setFiles] = useState<Record<string, unknown> | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{
    summary?: string;
    tradeSetup?: string;
    strengths?: string[];
    concerns?: string[];
    suggestions?: string[];
    verdict?: string;
    verdictColor?: string;
  } | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareCaption, setShareCaption] = useState("");
  const [shareCommunity, setShareCommunity] = useState("");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [limitReachedModalOpen, setLimitReachedModalOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [mobileWarningDismissed, setMobileWarningDismissed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const excalidrawRef = useRef<{ updateScene: (opts: { elements?: unknown[]; appState?: Record<string, unknown> }) => void } | null>(null);
  const sceneRef = useRef({ elements, appState, files, boardId, boardName });
  const skipNextOnChangeRef = useRef(false);
  const onChangePendingRef = useRef<{ els: unknown[]; st: Record<string, unknown>; f: Record<string, unknown> | null } | null>(null);
  const onChangeRafRef = useRef<number | null>(null);
  sceneRef.current = { elements, appState, files, boardId, boardName };

  const currentScene = useMemo(
    () => ({ elements, appState, files: files ?? undefined }),
    [elements, appState, files]
  );

  const [initialDataForBoard, setInitialDataForBoard] = useState<{
    elements: unknown[];
    appState: Record<string, unknown>;
    files?: Record<string, unknown> | null;
  }>(() => ({
    elements: [],
    appState: { viewBackgroundColor: "#1e1e2e", collaborators: new Map() as unknown as Record<string, unknown> },
    files: null,
  }));

  useEffect(() => {
    setBoards(getSavedBoards());
    setBannerDismissed(getCollaborationBannerDismissed());
    setIsMobile(typeof window !== "undefined" && window.innerWidth < 768);
  }, []);

  useEffect(() => {
    return () => {
      if (onChangeRafRef.current != null) {
        cancelAnimationFrame(onChangeRafRef.current);
        onChangeRafRef.current = null;
      }
    };
  }, []);

  // Update Excalidraw scene when switching boards (avoids slow remount)
  useEffect(() => {
    skipNextOnChangeRef.current = true;
    excalidrawRef.current?.updateScene?.({
      elements: initialDataForBoard.elements,
      appState: initialDataForBoard.appState as never,
    });
  }, [boardId, initialDataForBoard]);

  const isAtLimit = boards.length >= MAX_BOARDS;
  const isCurrentBoardNew = !boards.some((b) => b.id === boardId);

  const persistBoard = useCallback(() => {
    saveBoard(boardId, boardName, {
      elements,
      appState,
      files: files ?? {},
    });
    setBoards(getSavedBoards());
  }, [boardId, boardName, elements, appState, files]);

  const replaceOldestAndSave = useCallback(() => {
    const list = getSavedBoards();
    const oldest = list[list.length - 1];
    if (oldest) deleteBoard(oldest.id);
    const { boardId: bid, boardName: name, elements: el, appState: st, files: f } = sceneRef.current;
    saveBoard(bid, name, { elements: el, appState: st, files: f ?? {} });
    setBoards(getSavedBoards());
    setLimitReachedModalOpen(false);
    toast.showToast("Saved (oldest board replaced)", "success");
  }, [toast]);

  const closeLimitModal = useCallback(() => setLimitReachedModalOpen(false), []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const list = getSavedBoards();
      const { boardId: bid, boardName: name, elements: el, appState: st, files: f } = sceneRef.current;
      if (list.length >= MAX_BOARDS && !list.some((b) => b.id === bid)) {
        setLimitReachedModalOpen(true);
        return;
      }
      saveBoard(bid, name, { elements: el, appState: st, files: f ?? {} });
      setBoards(getSavedBoards());
      toast.showToast("Saved", "success");
    }, 30000);
    return () => clearInterval(intervalId);
  }, [toast]);

  const handleSave = useCallback(() => {
    if (isAtLimit && isCurrentBoardNew) {
      setLimitReachedModalOpen(true);
      return;
    }
    persistBoard();
    toast.showToast("Saved", "success");
  }, [isAtLimit, isCurrentBoardNew, persistBoard, toast]);

  const handleExport = useCallback(async () => {
    try {
      const { exportToBlob } = await import("@excalidraw/excalidraw");
      const blob = await exportToBlob({
        elements: elements as never[],
        appState: appState as never,
        files: (files as never) ?? null,
        mimeType: "image/png",
        exportPadding: 10,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `xchange-${boardName.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.showToast("Exported as PNG", "success");
    } catch (e) {
      toast.showToast("Export failed", "warning");
    }
  }, [elements, appState, files, boardName, toast]);

  const handleShareLink = useCallback(() => {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/whiteboard?board=${encodeURIComponent(boardId)}`;
    navigator.clipboard.writeText(url).then(() => toast.showToast("Link copied to clipboard", "success"));
    setShareModalOpen(false);
  }, [boardId, toast]);

  const handleAiAnalyze = useCallback(async () => {
    setAiLoading(true);
    setAiPanelOpen(true);
    setAiResult(null);
    try {
      const { exportToBlob } = await import("@excalidraw/excalidraw");
      const blob = await exportToBlob({
        elements: elements as never[],
        appState: appState as never,
        files: (files as never) ?? null,
        mimeType: "image/png",
        exportPadding: 10,
      });
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64 = (reader.result as string) ?? "";
        const res = await fetch("/api/whiteboard-analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64 }),
        });
        const data = await res.json();
        if (res.ok) setAiResult(data as typeof aiResult);
        else setAiResult({ summary: data.error ?? "Analysis failed", verdict: "Needs More Work", verdictColor: "yellow" });
        setAiLoading(false);
      };
    } catch {
      setAiResult({ summary: "Could not export or analyze board.", verdict: "Needs More Work", verdictColor: "yellow" });
      setAiLoading(false);
    }
  }, [elements, appState, files]);

  const handleShareToFeed = useCallback(() => {
    if (!aiResult) return;
    const text = [
      "💡 Xchange Whiteboard AI Analysis",
      aiResult.summary ?? "",
      aiResult.tradeSetup ? `Trade setup: ${aiResult.tradeSetup}` : "",
      aiResult.verdict ? `Verdict: ${aiResult.verdict}` : "",
    ].filter(Boolean).join("\n\n");
    try {
      sessionStorage.setItem(AI_SHARE_KEY, JSON.stringify({ content: text }));
    } catch {}
    router.push("/feed");
    setAiPanelOpen(false);
  }, [aiResult, router]);

  const loadBoard = useCallback((board: SavedBoard) => {
    const saved = getSavedBoards();
    const currentId = sceneRef.current.boardId;
    if (!saved.some((b) => b.id === currentId)) {
      const { boardName: name, elements: el, appState: st, files: f } = sceneRef.current;
      saveBoard(currentId, name, { elements: el, appState: st, files: f ?? {} });
    }
    const scene = board.scene;
    const appStateNorm = { ...(scene.appState ?? {}), viewBackgroundColor: "#1e1e2e", collaborators: new Map() as unknown as Record<string, unknown> };
    setBoardId(board.id);
    setBoardName(board.name);
    setElements((scene.elements ?? []) as unknown[]);
    setAppState(appStateNorm);
    setFiles((scene.files as Record<string, unknown>) ?? null);
    setInitialDataForBoard({ elements: (scene.elements ?? []) as unknown[], appState: appStateNorm, files: (scene.files as Record<string, unknown>) ?? null });
    setBoards(getSavedBoards());
  }, []);

  const newBoard = useCallback(() => {
    if (newBoardInProgressRef.current) return;
    newBoardInProgressRef.current = true;
    const id = `board-${Date.now()}`;
    const emptyAppState = { viewBackgroundColor: "#1e1e2e", collaborators: new Map() as unknown as Record<string, unknown> };
    const emptyScene = { elements: [] as unknown[], appState: emptyAppState, files: null };
    startTransition(() => {
      setBoardId(id);
      setBoardName("My Trading Board");
      setElements([]);
      setAppState(emptyAppState);
      setFiles(null);
      setInitialDataForBoard(emptyScene);
      setBoards(getSavedBoards());
    });
    setTimeout(() => {
      newBoardInProgressRef.current = false;
    }, 400);
  }, []);

  const applyTemplate = useCallback((getScene: () => { elements: unknown[]; appState: Record<string, unknown> }) => {
    const { elements: el, appState: st } = getScene();
    const appStateNorm = { ...st, viewBackgroundColor: "#1e1e2e", collaborators: new Map() as unknown as Record<string, unknown> };
    setElements(el);
    setAppState(appStateNorm);
    setInitialDataForBoard((prev) => ({ ...prev, elements: el, appState: appStateNorm }));
    skipNextOnChangeRef.current = true;
    excalidrawRef.current?.updateScene?.({ elements: el, appState: appStateNorm });
    setTemplatesOpen(false);
  }, []);

  const handleRenameBoard = useCallback((id: string, newName: string) => {
    const b = boards.find((x) => x.id === id);
    if (b) {
      saveBoard(id, newName, b.scene);
      setBoards(getSavedBoards());
      if (id === boardId) setBoardName(newName);
    } else if (id === boardId) {
      setBoardName(newName);
    }
  }, [boards, boardId]);

  const listForDisplay = useMemo((): SavedBoard[] => {
    if (!isCurrentBoardNew) return boards;
    const currentAsBoard: SavedBoard = {
      id: boardId,
      name: boardName,
      scene: { elements: [], appState: {}, files: {} },
      updatedAt: 0,
    };
    return [currentAsBoard, ...boards];
  }, [boards, boardId, boardName, isCurrentBoardNew]);

  const communities = useMemo(() => [
    { id: "equities", name: "Global Equities Flow" },
    { id: "macro", name: "Global Macro & Rates" },
    { id: "crypto", name: "Crypto & High-Beta" },
  ], []);

  const verdictColorClass = aiResult?.verdictColor === "green" ? "bg-emerald-500/20 text-emerald-400" : aiResult?.verdictColor === "red" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400";

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-col overflow-hidden bg-[#0a0e1a]" style={{ backgroundColor: TOP_BAR_BG }}>
      {/* Collaboration banner */}
      {!bannerDismissed && (
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-[var(--accent-color)]/10 px-4 py-2 text-sm text-zinc-300">
          <span>🚀 Real-time collaboration coming soon — invite teammates to your board</span>
          <button
            type="button"
            onClick={() => { setCollaborationBannerDismissed(); setBannerDismissed(true); }}
            className="rounded p-1 hover:bg-white/10"
            aria-label="Dismiss"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Mobile warning */}
      {isMobile && !mobileWarningDismissed && (
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <span>Whiteboard works best on desktop</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setMobileWarningDismissed(true)} className="rounded bg-white/10 px-3 py-1 text-xs font-medium">Continue anyway</button>
          </div>
        </div>
      )}

      {/* Top bar */}
      <header
        className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-white/10 px-4"
        style={{ backgroundColor: TOP_BAR_BG }}
      >
        <div className="flex min-w-0 items-center gap-0 rounded-lg border border-white/10 bg-white/5 p-0.5">
          <span className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-zinc-100">Whiteboard</span>
          <Link
            href="/ai"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 transition hover:bg-white/5 hover:text-[var(--accent-color)]"
          >
            AI Chat
          </Link>
        </div>

        <div className="min-w-0 flex-1" />

        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => setTemplatesOpen(true)} className="rounded p-2 text-zinc-400 hover:bg-white/5 hover:text-white" title="Templates">📄</button>
          <button type="button" onClick={handleSave} className="rounded p-2 text-zinc-400 hover:bg-white/5 hover:text-white" title="Save">💾</button>
          <button type="button" onClick={handleExport} className="rounded p-2 text-zinc-400 hover:bg-white/5 hover:text-white" title="Export PNG">📤</button>
          <button type="button" onClick={() => setShareModalOpen(true)} className="rounded p-2 text-zinc-400 hover:bg-white/5 hover:text-white" title="Share">👥</button>
          <button type="button" onClick={handleAiAnalyze} className="rounded p-2 text-zinc-400 hover:bg-white/5 hover:text-white" title="AI Analyze">🤖</button>
          <button type="button" onClick={() => setShortcutsOpen(true)} className="rounded p-2 text-zinc-400 hover:bg-white/5 hover:text-white" title="Shortcuts">?</button>
          <Link href="/feed" className="rounded p-2 text-zinc-400 hover:bg-white/5 hover:text-white" title="Back to Xchange">← Back</Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* My Boards panel */}
        {/* Reopen My Boards when closed */}
        {!boardsPanelOpen && (
          <button
            type="button"
            onClick={() => setBoardsPanelOpen(true)}
            className="flex w-10 shrink-0 flex-col items-center justify-center gap-0.5 border-r border-white/10 bg-[#0A0E1A] py-4 text-zinc-500 transition hover:bg-white/5 hover:text-[var(--accent-color)]"
            title="Show My Boards"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            <span className="text-[9px] font-medium">Boards</span>
          </button>
        )}
        {boardsPanelOpen && (
          <aside className="flex w-52 shrink-0 flex-col border-r border-white/10 bg-[#0A0E1A]">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <div>
                <span className="text-xs font-medium text-zinc-400">My Boards</span>
                <p className="mt-0.5 text-[10px] text-zinc-500">{listForDisplay.length} of {MAX_BOARDS} boards</p>
              </div>
              <button type="button" onClick={() => setBoardsPanelOpen(false)} className="rounded p-1 text-zinc-500 hover:bg-white/5" title="Collapse" aria-label="Collapse My Boards">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {listForDisplay.map((b) => (
                <BoardListItem
                  key={b.id}
                  board={b}
                  isCurrent={b.id === boardId}
                  onSelect={() => loadBoard(b)}
                  onDelete={() => {
                    deleteBoard(b.id);
                    setBoards(getSavedBoards());
                    if (boardId === b.id) newBoard();
                  }}
                  onRename={handleRenameBoard}
                />
              ))}
            </div>
            <div className="border-t border-white/10 p-2">
              <button type="button" onClick={newBoard} className="w-full rounded border border-dashed border-white/20 py-2 text-xs font-medium text-zinc-400 hover:border-[var(--accent-color)] hover:text-[var(--accent-color)]">
                + New Board
              </button>
            </div>
          </aside>
        )}

        {/* Excalidraw area */}
        <main className="relative min-h-0 flex-1 whiteboard-excalidraw-wrap">
          <div className="h-full w-full">
            <Excalidraw
              key="whiteboard"
              initialData={initialDataForBoard as React.ComponentProps<typeof Excalidraw>["initialData"]}
              theme="dark"
              onChange={(els, st, f) => {
                if (skipNextOnChangeRef.current) {
                  skipNextOnChangeRef.current = false;
                  return;
                }
                const stNorm = st as unknown as Record<string, unknown>;
                const fNorm = f as unknown as Record<string, unknown> | null;
                onChangePendingRef.current = { els: [...els], st: stNorm, f: fNorm };
                if (onChangeRafRef.current == null) {
                  onChangeRafRef.current = requestAnimationFrame(() => {
                    onChangeRafRef.current = null;
                    const pending = onChangePendingRef.current;
                    if (pending) {
                      onChangePendingRef.current = null;
                      setElements(pending.els);
                      setAppState(pending.st);
                      setFiles(pending.f);
                    }
                  });
                }
              }}
              excalidrawAPI={(api) => { excalidrawRef.current = api as never; }}
            />
          </div>

          {/* AI panel slide-in */}
          {aiPanelOpen && (
            <div className="absolute right-0 top-0 z-30 flex h-full w-80 flex-col border-l border-white/10 bg-[#0F1520] shadow-xl animate-[fadeIn_0.2s_ease-out]">
              <div className="flex items-center justify-between border-b border-white/10 p-3">
                <span className="text-sm font-semibold text-zinc-200">AI Analysis</span>
                <button type="button" onClick={() => setAiPanelOpen(false)} className="rounded p-1 text-zinc-500 hover:bg-white/5">×</button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {aiLoading && <p className="text-sm text-zinc-500">Analyzing your board...</p>}
                {!aiLoading && aiResult && (
                  <>
                    {aiResult.verdict && (
                      <div className={`mb-3 rounded-lg px-3 py-2 text-sm font-medium ${verdictColorClass}`}>{aiResult.verdict}</div>
                    )}
                    {aiResult.summary && <p className="mb-3 text-sm text-zinc-300">{aiResult.summary}</p>}
                    {aiResult.tradeSetup && <p className="mb-3 text-sm text-zinc-400"><strong>Trade setup:</strong> {aiResult.tradeSetup}</p>}
                    {aiResult.strengths?.length ? (
                      <div className="mb-3">
                        <p className="mb-1 text-xs font-medium text-zinc-500">Strengths</p>
                        <ul className="list-none space-y-0.5 text-sm text-zinc-300">
                          {aiResult.strengths.map((s, i) => <li key={i} className="flex gap-2">✓ {s}</li>)}
                        </ul>
                      </div>
                    ) : null}
                    {aiResult.concerns?.length ? (
                      <div className="mb-3">
                        <p className="mb-1 text-xs font-medium text-zinc-500">Concerns</p>
                        <ul className="list-none space-y-0.5 text-sm text-amber-200/90">
                          {aiResult.concerns.map((c, i) => <li key={i} className="flex gap-2">⚠ {c}</li>)}
                        </ul>
                      </div>
                    ) : null}
                    {aiResult.suggestions?.length ? (
                      <div className="mb-3">
                        <p className="mb-1 text-xs font-medium text-zinc-500">Suggestions</p>
                        <ol className="list-decimal list-inside space-y-0.5 text-sm text-zinc-300">
                          {aiResult.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                        </ol>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
              <div className="border-t border-white/10 p-3 flex gap-2">
                <button type="button" onClick={() => setAiPanelOpen(false)} className="flex-1 rounded bg-white/10 py-2 text-sm font-medium text-zinc-300 hover:bg-white/15">Close Analysis</button>
                <button type="button" onClick={handleShareToFeed} className="flex-1 rounded py-2 text-sm font-medium text-white" style={{ backgroundColor: "var(--accent-color)" }}>Share to Feed</button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Templates modal */}
      {templatesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setTemplatesOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0F1520] p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-sm font-semibold text-zinc-200">Templates</h3>
            <div className="grid gap-2">
              {TEMPLATES.map((t) => (
                <button key={t.id} type="button" onClick={() => applyTemplate(t.getScene)} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-zinc-300 hover:border-[var(--accent-color)]/30 hover:bg-[var(--accent-color)]/10 hover:text-white">
                  <span className="text-lg">{t.icon}</span>
                  <div>
                    <div className="font-medium">{t.label}</div>
                    <div className="text-xs text-zinc-500">{t.desc}</div>
                  </div>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setTemplatesOpen(false)} className="mt-4 w-full rounded bg-white/10 py-2 text-sm text-zinc-400 hover:bg-white/15">Cancel</button>
          </div>
        </div>
      )}

      {/* Share modal */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShareModalOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0F1520] p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-sm font-semibold text-zinc-200">Share</h3>
            <p className="mb-2 text-xs text-zinc-500">Copy link to share this board (placeholder — real sharing coming soon):</p>
            <button type="button" onClick={handleShareLink} className="w-full rounded bg-[var(--accent-color)] py-2 text-sm font-medium text-[#020308]">Copy shareable link</button>
            <div className="mt-4 border-t border-white/10 pt-4">
              <p className="mb-2 text-xs text-zinc-500">Post to community</p>
              <select value={shareCommunity} onChange={(e) => setShareCommunity(e.target.value)} className="mb-2 w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100">
                <option value="">Select community</option>
                {communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input type="text" value={shareCaption} onChange={(e) => setShareCaption(e.target.value)} placeholder="Caption" className="mb-2 w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500" />
              <button type="button" onClick={() => { toast.showToast("Posted to community (mock)", "success"); setShareModalOpen(false); }} className="w-full rounded bg-white/10 py-2 text-sm text-zinc-300 hover:bg-white/15">Post to Community</button>
            </div>
            <button type="button" onClick={() => setShareModalOpen(false)} className="mt-3 w-full rounded py-1.5 text-sm text-zinc-500">Cancel</button>
          </div>
        </div>
      )}

      {/* Shortcuts modal */}
      {shortcutsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShortcutsOpen(false)}>
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#0F1520] p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-sm font-semibold text-zinc-200">Keyboard shortcuts</h3>
            <ul className="space-y-1.5 text-xs text-zinc-400">
              <li><kbd className="rounded bg-white/10 px-1.5 py-0.5">V</kbd> Select/Move</li>
              <li><kbd className="rounded bg-white/10 px-1.5 py-0.5">P</kbd> Pencil/Draw</li>
              <li><kbd className="rounded bg-white/10 px-1.5 py-0.5">R</kbd> Rectangle</li>
              <li><kbd className="rounded bg-white/10 px-1.5 py-0.5">E</kbd> Ellipse</li>
              <li><kbd className="rounded bg-white/10 px-1.5 py-0.5">A</kbd> Arrow</li>
              <li><kbd className="rounded bg-white/10 px-1.5 py-0.5">T</kbd> Text</li>
              <li><kbd className="rounded bg-white/10 px-1.5 py-0.5">E</kbd> Eraser</li>
              <li><kbd className="rounded bg-white/10 px-1.5 py-0.5">Ctrl+Z</kbd> Undo</li>
              <li><kbd className="rounded bg-white/10 px-1.5 py-0.5">Ctrl+S</kbd> Save</li>
              <li><kbd className="rounded bg-white/10 px-1.5 py-0.5">Ctrl+Shift+E</kbd> Export</li>
            </ul>
            <button type="button" onClick={() => setShortcutsOpen(false)} className="mt-4 w-full rounded bg-white/10 py-2 text-sm text-zinc-400">Close</button>
          </div>
        </div>
      )}

      {/* 5-board limit: confirm before replacing oldest */}
      {limitReachedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={closeLimitModal}>
          <div className="w-full max-w-sm rounded-xl border border-amber-500/30 bg-[#0F1520] p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-medium text-zinc-200">You&apos;ve reached the maximum of {MAX_BOARDS} boards.</p>
            <p className="mt-2 text-xs text-zinc-500">Save anyway and replace your oldest board?</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={replaceOldestAndSave}
                className="flex-1 rounded-lg bg-[var(--accent-color)] py-2 text-sm font-medium text-[#020308]"
              >
                Save & replace oldest
              </button>
              <button
                type="button"
                onClick={closeLimitModal}
                className="flex-1 rounded-lg bg-white/10 py-2 text-sm font-medium text-zinc-300 hover:bg-white/15"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
