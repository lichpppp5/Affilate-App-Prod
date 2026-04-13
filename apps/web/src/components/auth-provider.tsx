"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import type { LoginInput, Session } from "../lib/api";
import { getCurrentSession, login } from "../lib/api";

interface AuthContextValue {
  token: string | null;
  session: Session | null;
  loading: boolean;
  loginWithPassword: (input: LoginInput) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = "appaffilate.auth.token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const savedToken = raw?.trim() ?? "";

    if (!savedToken) {
      setLoading(false);
      return;
    }

    void hydrateSession(savedToken);
  }, []);

  async function hydrateSession(nextToken: string) {
    try {
      const nextSession = await getCurrentSession(nextToken);
      setToken(nextToken);
      setSession(nextSession);
      window.localStorage.setItem(STORAGE_KEY, nextToken);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      setToken(null);
      setSession(null);
    } finally {
      setLoading(false);
    }
  }

  async function loginWithPassword(input: LoginInput) {
    setLoading(true);
    try {
      const result = await login(input);
      await hydrateSession(result.token);
    } finally {
      // hydrateSession() already clears loading on success/failure, but if login()
      // fails before we reach hydrateSession, we must clear loading here.
      setLoading(false);
    }
  }

  function logout() {
    window.localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setSession(null);
  }

  const value = useMemo(
    () => ({
      token,
      session,
      loading,
      loginWithPassword,
      logout
    }),
    [loading, session, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return value;
}
