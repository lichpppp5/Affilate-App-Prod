"use client";

import type { ReactNode } from "react";

import { AuthProvider, useAuth } from "./auth-provider";
import { LoginScreen } from "./login-screen";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </AuthProvider>
  );
}

function AuthenticatedShell({ children }: { children: ReactNode }) {
  const { loading, session } = useAuth();

  if (loading) {
    return <div className="login-shell">Đang tải phiên đăng nhập…</div>;
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <div className="shell">
      <Sidebar />
      <main className="content">{children}</main>
    </div>
  );
}
