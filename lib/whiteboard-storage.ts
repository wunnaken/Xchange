/**
 * localStorage for Trading Whiteboard: saved boards (max 5), collaboration banner dismissed.
 */

const BOARDS_KEY = "xchange-whiteboard-boards";
const BANNER_KEY = "xchange-whiteboard-banner-dismissed";
export const MAX_BOARDS = 5;

export type SavedBoard = {
  id: string;
  name: string;
  /** Excalidraw scene: elements, appState, files (stored as serializable) */
  scene: {
    elements: unknown[];
    appState: Record<string, unknown>;
    files?: Record<string, unknown>;
  };
  updatedAt: number;
};

function toJsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (v instanceof Map) return Object.fromEntries(v.entries());
      if (v instanceof Set) return Array.from(v.values());
      if (typeof v === "function") return undefined;
      return v;
    })
  ) as T;
}

function getBoards(): SavedBoard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BOARDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SavedBoard[]).slice(0, MAX_BOARDS) : [];
  } catch {
    return [];
  }
}

export function getSavedBoards(): SavedBoard[] {
  return getBoards().sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

export function saveBoard(
  id: string,
  name: string,
  scene: SavedBoard["scene"]
): void {
  if (typeof window === "undefined") return;
  const list = getBoards().filter((b) => b.id !== id);
  const safeScene = toJsonSafe(scene);
  list.unshift({
    id,
    name,
    scene: safeScene,
    updatedAt: Date.now(),
  });
  window.localStorage.setItem(BOARDS_KEY, JSON.stringify(list.slice(0, MAX_BOARDS)));
}

export function deleteBoard(id: string): void {
  if (typeof window === "undefined") return;
  const list = getBoards().filter((b) => b.id !== id);
  window.localStorage.setItem(BOARDS_KEY, JSON.stringify(list));
}

export function getCollaborationBannerDismissed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(BANNER_KEY) === "1";
}

export function setCollaborationBannerDismissed(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BANNER_KEY, "1");
}
