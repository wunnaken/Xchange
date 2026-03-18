"use client";

import "@excalidraw/excalidraw/index.css";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "../../components/ToastContext";
import { getSavedBoards, saveBoard, deleteBoard } from "../../lib/whiteboard-storage";
import { setLastWorkspaceTab } from "../../lib/workspace-tab";

const TOP_BAR_BG = "#080B14";
const DEFAULT_APP_STATE = { viewBackgroundColor: "#1e1e2e" };

const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((m) => m.Excalidraw),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-[#0a0e1a] text-zinc-400">
        Loading whiteboard...
      </div>
    ),
  }
);

type Board = {
  id: string;
  name: string;
  scene: {
    elements: unknown[];
    appState: Record<string, unknown>;
    files?: Record<string, unknown> | null;
  };
  updated_at?: string;
};

/** Excalidraw expects appState.collaborators to be a Map; JSON/storage gives plain objects. */
function sanitizeAppState(appState: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const base = appState && typeof appState === "object" ? { ...appState } : {};
  return {
    ...base,
    collaborators: new Map(),
  };
}

function emptyScene() {
  return {
    elements: [] as unknown[],
    appState: sanitizeAppState({ ...DEFAULT_APP_STATE }),
    files: {} as Record<string, unknown>,
  };
}

/** Build initialData for Excalidraw: always use sanitized appState so collaborators is a Map. */
function toInitialData(scene: Board["scene"]) {
  return {
    elements: scene.elements ?? [],
    appState: sanitizeAppState(scene.appState ?? { ...DEFAULT_APP_STATE }),
    files: (scene.files as Record<string, unknown>) ?? {},
  };
}

function serializeScene(scene: Board["scene"]) {
  return {
    elements: JSON.parse(JSON.stringify(scene.elements)),
    appState: JSON.parse(
      JSON.stringify(scene.appState, (_k, v) => {
        if (v instanceof Map) return Object.fromEntries(v.entries());
        if (v instanceof Set) return Array.from(v.values());
        if (typeof v === "function") return undefined;
        return v;
      })
    ),
    files: scene.files ? JSON.parse(JSON.stringify(scene.files)) : {},
  };
}

async function fetchBoardsFromApi(): Promise<Board[]> {
  try {
    const res = await fetch("/api/whiteboard", { cache: "no-store" });
    if (!res.ok) throw new Error("api");
    const data = (await res.json()) as { boards?: Board[] };
    const boards = Array.isArray(data.boards) ? data.boards : [];
    return boards.map((b) => ({
      ...b,
      id: String((b as any).id),
    }));
  } catch {
    return getSavedBoards().map((b) => ({
      id: b.id.startsWith("board-") ? b.id.slice("board-".length) : b.id,
      name: b.name,
      scene: b.scene,
      updated_at: String(b.updatedAt),
    }));
  }
}

export default function WhiteboardPage() {
  const toast = useToast();
  const [boards, setBoards] = useState<Board[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<string>("");
  const [boardName, setBoardName] = useState("My Trading Board");
  const [editingBoardNameId, setEditingBoardNameId] = useState<string | null>(null);

  const excalidrawAPIRef = useRef<{
    getSceneElements: () => unknown[];
    getAppState: () => Record<string, unknown>;
    getFiles: () => Record<string, unknown>;
  } | null>(null);

  // Set once per board in event handlers or initial load — never from render.
  const initialDataRef = useRef(emptyScene());

  // Load boards once on mount. No state in dependency array.
  useEffect(() => {
    setLastWorkspaceTab("whiteboard");
    let cancelled = false;
    fetchBoardsFromApi().then((list) => {
      if (cancelled) return;
      setBoards(list);
      if (list.length > 0) {
        const first = list[0];
        initialDataRef.current = toInitialData(first.scene);
        setActiveId(String(first.id));
        setBoardName(first.name);
        setLastSavedAt(
          first.updated_at ? new Date(first.updated_at).getTime() : null
        );
      } else {
        // Table `whiteboard_boards.id` is bigint, so keep our client IDs numeric-only.
        const id = String(Date.now());
        const newBoard: Board = { id, name: "My Trading Board", scene: emptyScene() };
        initialDataRef.current = emptyScene();
        setBoards([newBoard]);
        setActiveId(id);
        setBoardName("My Trading Board");
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const switchBoard = useCallback((b: Board) => {
    initialDataRef.current = toInitialData(b.scene);
    setActiveId(b.id);
    setBoardName(b.name);
    setEditingBoardNameId(null);
    setLastSavedAt(
      b.updated_at ? new Date(b.updated_at).getTime() : null
    );
  }, []);

  const createNewBoard = useCallback(() => {
    const id = String(Date.now());
    const newBoard: Board = {
      id,
      name: "My Trading Board",
      scene: emptyScene(),
    };
    initialDataRef.current = emptyScene();
    setBoards((prev) => [newBoard, ...prev]);
    setActiveId(id);
    setBoardName("My Trading Board");
    setEditingBoardNameId(null);
    setLastSavedAt(null);
  }, []);

  const saveCurrent = useCallback(async () => {
    const api = excalidrawAPIRef.current;
    if (!api) {
      toast.showToast("Whiteboard not ready", "warning");
      return;
    }
    setSaving(true);

    const effectiveName = boardName.trim() || "My Trading Board";
    const scene = {
      elements: api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles() ?? {},
    };
    const payload = serializeScene(scene);

    try {
      console.log("[whiteboard] Attempting API save");
      const res = await fetch("/api/whiteboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId: activeId,
          name: effectiveName,
          scene: payload,
        }),
      });

      const response = {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
      };

      // Read server body text to explain why we might fall back.
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch {
        bodyText = "";
      }

      console.log("[whiteboard] API response:", { ...response, bodyText });

      if (!res.ok) {
        const reason = bodyText || `HTTP ${res.status}`;
        console.log("[whiteboard] Falling back to localStorage because:", reason);
        throw new Error(reason);
      }

      setLastSavedAt(Date.now());
      const updated: Board = { id: activeId, name: effectiveName, scene: payload, updated_at: new Date().toISOString() };
      setBoards((prev) => {
        const idx = prev.findIndex((b) => b.id === activeId);
        if (idx >= 0) return prev.map((b) => (b.id === activeId ? updated : b));
        return [updated, ...prev];
      });
      toast.showToast("Whiteboard saved", "success");
    } catch (err) {
      saveBoard(activeId, effectiveName, payload);
      setLastSavedAt(Date.now());
      const updated: Board = { id: activeId, name: effectiveName, scene: payload, updated_at: new Date().toISOString() };
      setBoards((prev) => {
        const idx = prev.findIndex((b) => b.id === activeId);
        if (idx >= 0) return prev.map((b) => (b.id === activeId ? updated : b));
        return [updated, ...prev];
      });
      toast.showToast("Saved locally", "warning");
      console.log("[whiteboard] Falling back to localStorage because:", err);
    } finally {
      setSaving(false);
    }
  }, [activeId, boardName, toast]);

  const renameActive = useCallback((name: string) => {
    // Allow empty string while editing; we'll apply default on blur/save.
    setBoardName(name);
  }, []);

  const persistBoardNameToStore = useCallback(
    async (nextNameRaw: string) => {
      const nextName = nextNameRaw.trim() || "My Trading Board";
      setBoardName(nextName);
      setEditingBoardNameId(null);

      // Update sidebar immediately (optimistic UI). Scene persists alongside name.
      setBoards((prev) =>
        prev.map((b) => (b.id === activeId ? { ...b, name: nextName } : b))
      );

      const api = excalidrawAPIRef.current;
      if (!api) return;

      const scene = {
        elements: api.getSceneElements(),
        appState: api.getAppState(),
        files: api.getFiles() ?? {},
      };
      const payload = serializeScene(scene);

      try {
        console.log("[whiteboard] Attempting API rename");
        const res = await fetch("/api/whiteboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            boardId: activeId,
            name: nextName,
            scene: payload,
          }),
        });

        let bodyText = "";
        try {
          bodyText = await res.text();
        } catch {
          bodyText = "";
        }

        console.log("[whiteboard] Rename API response:", {
          ok: res.ok,
          status: res.status,
          bodyText,
        });

        if (!res.ok) throw new Error(bodyText || `HTTP ${res.status}`);

        setLastSavedAt(Date.now());
      } catch (err) {
        console.log("[whiteboard] Rename fallback to localStorage because:", err);
        saveBoard(activeId, nextName, payload);
        setLastSavedAt(Date.now());
        toast.showToast("Saved locally (rename)", "warning");
      }
    },
    [activeId, toast]
  );

  const deleteActive = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/whiteboard?boardId=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
      } catch {
        deleteBoard(id);
      }
      setBoards((prev) => prev.filter((b) => b.id !== id));
      if (activeId === id) {
        const rest = boards.filter((b) => b.id !== id);
        if (rest.length > 0) switchBoard(rest[0]);
        else createNewBoard();
      }
    },
    [activeId, boards, switchBoard, createNewBoard]
  );

  // Stable ref so we never pass a new function each render
  const handleExcalidrawAPI = useCallback(
    (api: { getSceneElements: () => unknown[]; getAppState: () => Record<string, unknown>; getFiles: () => Record<string, unknown> } | null) => {
      excalidrawAPIRef.current = api;
    },
    []
  );

  if (!loaded) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center bg-[#0a0e1a] text-zinc-400">
        Loading boards...
      </div>
    );
  }

  // Don't render Excalidraw until we have an activeId (set after load)
  if (!activeId) {
    return null;
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-col overflow-hidden bg-[#0a0e1a]">
      <header
        className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-white/10 px-4"
        style={{ backgroundColor: TOP_BAR_BG }}
      >
        <div className="flex min-w-0 items-center gap-0 rounded-lg border border-white/10 bg-white/5 p-0.5">
          <Link
            href="/ai"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 transition hover:bg-white/5 hover:text-[var(--accent-color)]"
          >
            AI Chat
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 transition hover:bg-white/5 hover:text-[var(--accent-color)]"
          >
            Dashboard
          </Link>
          <span className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-zinc-100">
            Whiteboard
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={saveCurrent}
            disabled={saving}
            className="rounded bg-white/10 px-3 py-1.5 text-sm text-zinc-200 hover:bg-white/15 disabled:opacity-70"
          >
            {saving ? "Saving..." : "Save Whiteboard"}
          </button>
          <span className="text-[10px] text-zinc-500">
            {lastSavedAt == null
              ? "Not saved yet"
              : `Last saved ${Math.floor((Date.now() - lastSavedAt) / 60000)}m ago`}
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-56 shrink-0 flex-col border-r border-white/10 bg-[#0A0E1A]">
          <div className="border-b border-white/10 px-3 py-2">
            <p className="text-xs font-medium text-zinc-400">My Boards</p>
            <p className="mt-0.5 text-[10px] text-zinc-500">
              Save to store in Supabase
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {boards.length === 0 ? (
              <p className="px-2 py-3 text-xs text-zinc-500">
                No boards yet. Save to create one.
              </p>
            ) : (
              boards.map((b) => (
                <div
                  key={b.id}
                  className={`mb-1 rounded border px-2 py-2 ${
                    b.id === activeId
                      ? "border-[var(--accent-color)]/40 bg-white/10"
                      : "border-white/10 bg-white/5"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      // Only "switch" when not already on this board.
                      // For the active board, clicking the name area enters rename mode.
                      if (b.id === activeId) setEditingBoardNameId(b.id);
                      else switchBoard(b);
                    }}
                    className="w-full text-left"
                  >
                    <span className="truncate text-sm text-zinc-200">
                      {b.id === activeId ? boardName : b.name}
                    </span>
                  </button>
                  <div className="mt-2 flex gap-1">
                    {b.id === activeId && editingBoardNameId === b.id ? (
                      <input
                        autoFocus
                        value={boardName}
                        onChange={(e) => renameActive(e.target.value)}
                        onBlur={() => persistBoardNameToStore(boardName)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                          if (e.key === "Escape") setEditingBoardNameId(null);
                        }}
                        className="min-w-0 flex-1 rounded border border-white/10 bg-black/20 px-2 py-1 text-xs text-zinc-300 outline-none"
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => deleteActive(b.id)}
                      className="rounded border border-white/10 px-2 py-1 text-[10px] text-zinc-400 hover:bg-white/10"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="border-t border-white/10 p-2">
            <button
              type="button"
              onClick={createNewBoard}
              className="w-full rounded border border-dashed border-white/20 py-2 text-xs font-medium text-zinc-400 hover:border-[var(--accent-color)] hover:text-[var(--accent-color)]"
            >
              + New Board
            </button>
          </div>
        </aside>

        <main className="relative min-h-0 flex-1">
          <div className="absolute bottom-4 left-1/2 z-10 w-[90%] -translate-x-1/2 rounded border border-white/10 bg-[#0F1520]/90 px-3 py-2 text-xs text-zinc-400 shadow-lg">
            <p className="font-medium text-zinc-200">Save Whiteboard</p>
            <p className="mt-1 max-w-sm">
              Click Save to persist to Supabase. No auto-save.
            </p>
          </div>
          <Excalidraw
            key={activeId}
            initialData={initialDataRef.current}
            excalidrawAPI={handleExcalidrawAPI}
            theme="dark"
          />
        </main>
      </div>
    </div>
  );
}
