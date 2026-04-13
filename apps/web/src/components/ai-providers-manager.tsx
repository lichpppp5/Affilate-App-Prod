"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import type { AiProviderRecord } from "../lib/api";
import { listAiProviders, testAiProvider, upsertAiProvider } from "../lib/api";
import { useAuth } from "./auth-provider";
import { PageHeader } from "./page-header";

export function AiProvidersManager() {
  const { token } = useAuth();
  const [items, setItems] = useState<AiProviderRecord[]>([]);
  const veo3 = useMemo(() => items.find((x) => x.provider === "veo3") ?? null, [items]);
  const [edit, setEdit] = useState({ apiKey: "", baseUrl: "", model: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (token) void refresh();
  }, [token]);

  useEffect(() => {
    if (!veo3) return;
    setEdit({
      apiKey: "",
      baseUrl: veo3.baseUrl,
      model: veo3.model
    });
  }, [veo3]);

  async function refresh() {
    if (!token) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      setItems(await listAiProviders(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tải dữ liệu thất bại");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      await upsertAiProvider(token, "veo3", {
        apiKey: edit.apiKey ? edit.apiKey : undefined,
        baseUrl: edit.baseUrl,
        model: edit.model
      });
      setEdit((s) => ({ ...s, apiKey: "" }));
      setInfo("Đã lưu cấu hình Veo3.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!token) return;
    setTesting(true);
    setError(null);
    setInfo(null);
    try {
      const res = await testAiProvider(token, "veo3");
      if (!res.ok) {
        setError(res.message ?? "Check kết nối thất bại");
        return;
      }
      setInfo(`Kết nối OK. Model: ${res.model ?? "unknown"}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check kết nối thất bại");
    } finally {
      setTesting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="AI Providers"
        description="Quản lý key API và kiểm tra kết nối"
      />

      {loading ? <div className="muted">Đang tải...</div> : null}
      {error ? <div className="error">{error}</div> : null}
      {info ? <div className="success">{info}</div> : null}

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Veo3 (Gemini API)</div>
          <div className="muted">
            Trạng thái: <strong>{veo3?.configured ? "Đã cấu hình" : "Chưa cấu hình"}</strong>
            {veo3?.apiKeyFingerprint ? (
              <>
                {" "}
                (fingerprint: <code>{veo3.apiKeyFingerprint}</code>)
              </>
            ) : null}
          </div>

          <form onSubmit={handleSave} className="form">
            <label>
              Base URL
              <input
                value={edit.baseUrl}
                onChange={(e) => setEdit((s) => ({ ...s, baseUrl: e.target.value }))}
                placeholder="https://generativelanguage.googleapis.com/v1beta"
              />
            </label>

            <label>
              Model
              <input
                value={edit.model}
                onChange={(e) => setEdit((s) => ({ ...s, model: e.target.value }))}
                placeholder="veo-3.1-generate-preview"
              />
            </label>

            <label>
              API Key (x-goog-api-key)
              <input
                type="password"
                value={edit.apiKey}
                onChange={(e) => setEdit((s) => ({ ...s, apiKey: e.target.value }))}
                placeholder="Nhập key mới (để trống nếu không đổi)"
                autoComplete="off"
              />
            </label>

            <div className="row gap">
              <button className="primary-button" disabled={saving} type="submit">
                {saving ? "Đang lưu..." : "Lưu"}
              </button>
              <button
                className="secondary-button"
                disabled={testing || !veo3?.configured}
                type="button"
                onClick={handleTest}
              >
                {testing ? "Đang check..." : "Check kết nối"}
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <div className="card-title">Ghi chú</div>
          <div className="muted">
            - Hệ thống sẽ dùng Veo3 khi bạn chọn provider <code>veo3</code> cho template/video render.
            <br />- Check kết nối chỉ gọi endpoint metadata của model (không tạo video).
          </div>
        </div>
      </div>
    </>
  );
}

