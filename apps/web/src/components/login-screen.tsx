"use client";

import type { FormEvent } from "react";
import { useState } from "react";

import { useAuth } from "./auth-provider";

export function LoginScreen() {
  const { loginWithPassword, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      await loginWithPassword({
        email,
        password,
        tenantId
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Đăng nhập thất bại");
    }
  }

  return (
    <div className="login-shell">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>AppAffilate — Quản trị</h1>
        <p className="muted">
          Đăng nhập để quản lý sản phẩm, tài nguyên, dự án và vận hành xuất bản theo tenant.
        </p>
        <label className="field">
          <span>Email</span>
          <input value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="field">
          <span>Mật khẩu</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Mã tenant</span>
          <input
            value={tenantId}
            onChange={(event) => setTenantId(event.target.value)}
          />
        </label>
        {error ? <div className="error-banner">{error}</div> : null}
        <button className="primary-button" disabled={loading} type="submit">
          {loading ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
    </div>
  );
}
