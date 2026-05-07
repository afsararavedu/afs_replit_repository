import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { ApiError, api, setStoredCookie } from "@/lib/api";

export interface User {
  id: number;
  username: string;
  role: string;
  fullName?: string | null;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const u = await api<User>("/api/user");
      setUser(u);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    setError(null);
    try {
      const u = await api<User>("/api/login", {
        method: "POST",
        body: { username, password },
      });
      setUser(u);
    } catch (e) {
      // 429 lockouts are surfaced by the login screen itself with a
      // dedicated banner and a live countdown — we deliberately don't
      // mirror them into the generic `error` state, otherwise the
      // stale lockout message would briefly flash back into view after
      // the countdown ends and before the user types anything new.
      if (e instanceof ApiError && e.status === 429) {
        throw e;
      }
      const msg =
        e instanceof Error ? e.message : "Login failed. Please try again.";
      setError(msg);
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/api/logout", { method: "POST" });
    } catch {
      // ignore network errors on logout
    }
    await setStoredCookie(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, error, login, logout, refresh }),
    [user, loading, error, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
