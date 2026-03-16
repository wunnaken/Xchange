/**
 * Verified Trader status — localStorage for development.
 * Backend will persist verified status later.
 * Only the account with this email is auto-verified (no localStorage needed).
 */

export const VERIFIED_KEY = "xchange-verified";

/** Email that is always treated as verified (dev / your account). */
const VERIFIED_DEV_EMAIL = "zack.mutz01@gmail.com";

/**
 * @param currentUserEmail — Optional. If provided and matches the whitelisted email, returns true.
 */
export function isVerified(currentUserEmail?: string | null): boolean {
  if (typeof window === "undefined") return false;
  try {
    const email = (currentUserEmail ?? "").trim().toLowerCase();
    if (email === VERIFIED_DEV_EMAIL) return true;
    const stored = window.localStorage.getItem(VERIFIED_KEY);
    if (stored === "true") return true;
    if (stored === "false") return false;
    return false;
  } catch {
    return false;
  }
}

export function setVerified(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(VERIFIED_KEY, "true");
    else window.localStorage.removeItem(VERIFIED_KEY);
  } catch {
    // ignore
  }
}
