"use client";

const FORM_DRAFT_TTL_MS = 24 * 60 * 60_000;
const FORM_DRAFT_MAX_FUTURE_SKEW_MS = 5 * 60_000;

/**
 * Read a same-browser form draft. Local storage (rather than tab-scoped
 * session storage) is deliberate: email verification commonly opens in a new
 * tab in the same browser, and the user should not lose the long form they
 * were completing. Drafts expire after 24 hours and are cleared on confirmed
 * logout/account deletion.
 */
export function readFormDraft(key: string): Record<string, unknown> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      window.localStorage.removeItem(key);
      return null;
    }
    const draft = parsed as Record<string, unknown>;
    const savedAt = draft.savedAt;
    if (
      typeof savedAt !== "number" ||
      !Number.isFinite(savedAt) ||
      savedAt > Date.now() + FORM_DRAFT_MAX_FUTURE_SKEW_MS ||
      Date.now() - savedAt > FORM_DRAFT_TTL_MS
    ) {
      window.localStorage.removeItem(key);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function writeFormDraft(key: string, draft: Record<string, unknown>) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // Draft storage is a best-effort convenience; forms remain usable when
    // storage is unavailable or full.
  }
}

export function removeFormDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore unavailable storage during cleanup.
  }
}

export function clearLocalFormDrafts() {
  if (typeof window === "undefined") return;
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      const draftKeys: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith("yaarlink:") && key.includes("-draft")) draftKeys.push(key);
      }
      for (const key of draftKeys) storage.removeItem(key);
    } catch {
      // Continue with the other storage area if one is unavailable.
    }
  }
}
