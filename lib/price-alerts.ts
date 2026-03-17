/**
 * Price alerts: localStorage schema and helpers.
 * Alerts only run while the app tab is open (60s polling).
 */

export const PRICE_ALERTS_KEY = "xchange-price-alerts";
export const MAX_ALERTS_FREE = 10;

export type PriceAlertCondition = "above" | "below";
export type PriceAlertStatus = "active" | "triggered" | "paused";

export type PriceAlert = {
  id: string;
  ticker: string;
  company: string;
  condition: PriceAlertCondition;
  targetPrice: number;
  currentPrice: number;
  name: string;
  createdAt: string;
  triggeredAt: string | null;
  status: PriceAlertStatus;
  repeat: boolean;
  notifyBrowser: boolean;
  notifyInApp: boolean;
};

export function getPriceAlerts(): PriceAlert[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PRICE_ALERTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isValidAlert) : [];
  } catch {
    return [];
  }
}

function isValidAlert(a: unknown): a is PriceAlert {
  if (!a || typeof a !== "object") return false;
  const o = a as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.ticker === "string" &&
    (o.condition === "above" || o.condition === "below") &&
    typeof o.targetPrice === "number" &&
    typeof o.createdAt === "string" &&
    (o.status === "active" || o.status === "triggered" || o.status === "paused")
  );
}

export function savePriceAlerts(alerts: PriceAlert[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PRICE_ALERTS_KEY, JSON.stringify(alerts.slice(0, MAX_ALERTS_FREE)));
  } catch {
    // ignore
  }
}

export function getAlertForTicker(ticker: string): PriceAlert | null {
  const t = ticker.toUpperCase().trim();
  return getPriceAlerts().find((a) => a.ticker.toUpperCase() === t && a.status === "active") ?? null;
}

export function getAlertsForTicker(ticker: string): PriceAlert[] {
  const t = ticker.toUpperCase().trim();
  return getPriceAlerts().filter((a) => a.ticker.toUpperCase() === t);
}

/** Distance to target as a percentage (positive = above current, negative = below). */
export function getDistancePercent(alert: PriceAlert, currentPrice: number): number {
  if (currentPrice <= 0) return 0;
  const pct = ((alert.targetPrice - currentPrice) / currentPrice) * 100;
  return alert.condition === "above" ? pct : -pct;
}

/** Whether this alert is within 2% of triggering. */
export function isNearTrigger(alert: PriceAlert, currentPrice: number): boolean {
  if (alert.status !== "active") return false;
  const dist = getDistancePercent(alert, currentPrice);
  if (alert.condition === "above") return dist <= 2 && dist > 0;
  return dist >= -2 && dist < 0;
}

export function isAlertTriggered(alert: PriceAlert, currentPrice: number): boolean {
  if (alert.condition === "above") return currentPrice >= alert.targetPrice;
  return currentPrice <= alert.targetPrice;
}

export function generateAlertId(): string {
  return "alert-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
}

/** In-app notification entries (for bell dropdown). */
const IN_APP_NOTIFICATIONS_KEY = "xchange-in-app-notifications";

export type InAppNotification = {
  id: string;
  type: "price_alert";
  ticker: string;
  message: string;
  price: number;
  targetPrice: number;
  link: string;
  time: string;
};

export function getInAppNotifications(): InAppNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(IN_APP_NOTIFICATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.slice(0, 50) : [];
  } catch {
    return [];
  }
}

export function addInAppNotification(n: Omit<InAppNotification, "id" | "time">): void {
  if (typeof window === "undefined") return;
  const entry: InAppNotification = {
    ...n,
    id: "notif-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9),
    time: new Date().toISOString(),
  };
  const list = getInAppNotifications();
  list.unshift(entry);
  localStorage.setItem(IN_APP_NOTIFICATIONS_KEY, JSON.stringify(list.slice(0, 50)));
  window.dispatchEvent(new Event("xchange-in-app-notifications-changed"));
}

export function clearInAppNotification(id: string): void {
  if (typeof window === "undefined") return;
  const list = getInAppNotifications().filter((n) => n.id !== id);
  localStorage.setItem(IN_APP_NOTIFICATIONS_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("xchange-in-app-notifications-changed"));
}
