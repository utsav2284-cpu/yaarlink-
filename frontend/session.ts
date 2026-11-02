"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiResponseError, fetchJsonObject } from "@/frontend/api-json";
import { clearLocalFormDrafts } from "@/frontend/form-drafts";
import { availableUserRoles, normalizeUserRole, primaryUserRole, type UserRole } from "@/shared/user-roles";

export { clearLocalFormDrafts };

export interface SessionUserSummary {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  primaryRole: UserRole;
  availableRoles: UserRole[];
}

export type SessionLoadStatus = "loading" | "ready" | "error";

function parseSessionUser(value: unknown): SessionUserSummary | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiResponseError(502, "load_failed");
  }

  const user = value as Record<string, unknown>;
  const primaryRole = primaryUserRole(user.primaryRole ?? user.role);
  const listedRoles = Array.isArray(user.availableRoles)
    ? user.availableRoles.map(normalizeUserRole).filter((role): role is UserRole => role !== null)
    : [];

  if (
    typeof user.id !== "string" ||
    !user.id ||
    typeof user.name !== "string" ||
    !user.name ||
    typeof user.email !== "string" ||
    !user.email
  ) {
    throw new ApiResponseError(502, "load_failed");
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: primaryRole,
    primaryRole,
    availableRoles: listedRoles.length ? [...new Set(listedRoles)] : availableUserRoles(),
  };
}

export async function fetchSessionUser(signal?: AbortSignal): Promise<SessionUserSummary | null> {
  const data = await fetchJsonObject("/api/auth/me", { cache: "no-store", signal });
  if (!("user" in data)) throw new ApiResponseError(502, "load_failed");
  return parseSessionUser(data.user);
}

/**
 * Only report success when the server confirms logout or a follow-up session
 * check proves this browser no longer has a session. A network/server failure
 * therefore leaves callers displaying the still-authenticated state.
 */
export async function requestLogout(): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
    const data = (await response.json().catch(() => null)) as { ok?: unknown } | null;
    if (response.ok && data?.ok === true) {
      clearLocalFormDrafts();
      return true;
    }
  } catch {
    // Fall through to reconciliation: the request may have reached the
    // server even though its response did not reach this browser.
  }

  try {
    const loggedOut = (await fetchSessionUser()) === null;
    if (loggedOut) clearLocalFormDrafts();
    return loggedOut;
  } catch {
    return false;
  }
}

export function useSessionUser() {
  const [user, setUser] = useState<SessionUserSummary | null>(null);
  const [status, setStatus] = useState<SessionLoadStatus>("loading");
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setStatus("loading");
    setRefreshKey((key) => key + 1);
  }, []);

  const markLoggedOut = useCallback(() => {
    setUser(null);
    setStatus("ready");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetchSessionUser(controller.signal)
      .then((nextUser) => {
        if (!active) return;
        setUser(nextUser);
        setStatus("ready");
      })
      .catch((error) => {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setStatus("error");
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshKey]);

  return { user, status, refresh, markLoggedOut };
}
