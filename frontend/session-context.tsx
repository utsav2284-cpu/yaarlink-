"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  fetchSessionUser,
  type SessionLoadStatus,
  type SessionUserSummary,
} from "@/frontend/session";

export type SessionIdentity = Pick<SessionUserSummary, "id">;
export type SessionStateUser = SessionUserSummary | SessionIdentity;

export interface SessionContextValue {
  user: SessionStateUser | null;
  status: SessionLoadStatus;
  /** Fire-and-forget refresh for retry buttons. */
  refresh: () => void;
  /** Awaitable refresh for flows that must branch on the confirmed identity. */
  refreshUser: () => Promise<SessionStateUser | null>;
  markLoggedOut: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * The root layout already resolves the session on the server for the first
 * HTML response. Seed one shared client context from that result instead of
 * having the Navbar and each form independently call /api/auth/me after
 * hydration. A network check now happens only for an explicit retry/refresh.
 */
export function SessionProvider({
  initialUser,
  initialStatus,
  children,
}: {
  initialUser: SessionIdentity | null;
  initialStatus: "ready" | "error";
  children: ReactNode;
}) {
  const [user, setUser] = useState<SessionStateUser | null>(initialUser);
  const [status, setStatus] = useState<SessionLoadStatus>(initialStatus);
  const requestSeqRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);

  const initialKey = initialUser?.id ?? (initialStatus === "error" ? "error" : "guest");
  const [lastInitialKey, setLastInitialKey] = useState(initialKey);

  // Login/logout flows call router.refresh(). When the server layout sends a
  // different authoritative identity, adopt it during render (the pattern the
  // Navbar already used) rather than waiting for another auth request.
  if (lastInitialKey !== initialKey) {
    setLastInitialKey(initialKey);
    setUser(initialUser);
    setStatus(initialStatus);
  }

  const refreshUser = useCallback(async (): Promise<SessionStateUser | null> => {
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    requestControllerRef.current?.abort();

    const controller = new AbortController();
    requestControllerRef.current = controller;
    setStatus("loading");

    try {
      const nextUser = await fetchSessionUser(controller.signal);
      if (requestSeqRef.current === requestSeq) {
        setUser(nextUser);
        setStatus("ready");
      }
      return nextUser;
    } catch (error) {
      if (
        requestSeqRef.current === requestSeq &&
        !(error instanceof DOMException && error.name === "AbortError")
      ) {
        // Keep any already-known identity: an outage is unknown state, not
        // proof that the visitor has logged out.
        setStatus("error");
      }
      throw error;
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
    }
  }, []);

  const refresh = useCallback(() => {
    void refreshUser().catch(() => {});
  }, [refreshUser]);

  const markLoggedOut = useCallback(() => {
    requestSeqRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setUser(null);
    setStatus("ready");
  }, []);

  useEffect(
    () => () => {
      requestSeqRef.current += 1;
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
    },
    [],
  );

  const value = useMemo<SessionContextValue>(
    () => ({ user, status, refresh, refreshUser, markLoggedOut }),
    [markLoggedOut, refresh, refreshUser, status, user],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside SessionProvider");
  return context;
}
