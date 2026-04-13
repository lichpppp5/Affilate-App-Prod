"use client";

import { useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import type { ChannelAccountRecord } from "../lib/api";
import {
  createChannelAccount,
  deleteChannelAccount,
  getOAuthStartUrl,
  listChannelAccounts,
  refreshChannelAccount,
  updateChannelAccount
} from "../lib/api";
import { viStatus } from "../lib/ui-vi";
import { useAuth } from "./auth-provider";
import { PageHeader } from "./page-header";
import { StatusBadge } from "./status-badge";

const emptyForm = {
  channel: "tiktok" as ChannelAccountRecord["channel"],
  accountName: "",
  accountRef: "",
  authType: "oauth" as ChannelAccountRecord["authType"],
  status: "connected" as ChannelAccountRecord["status"],
  clientId: "",
  clientSecret: "",
  accessToken: "",
  refreshToken: "",
  tokenExpiresAt: "",
  metadataJson: "{}"
};

export function ChannelAccountsManager() {
  const { token } = useAuth();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<ChannelAccountRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      void refresh();
    }
  }, [token]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  );
  const oauthState = searchParams.get("oauth");
  const oauthProvider = searchParams.get("provider");

  useEffect(() => {
    if (!selectedItem) {
      setForm(emptyForm);
      return;
    }

    setForm({
      channel: selectedItem.channel,
      accountName: selectedItem.accountName,
      accountRef: selectedItem.accountRef,
      authType: selectedItem.authType,
      status: selectedItem.status,
      clientId: selectedItem.clientId,
      clientSecret: selectedItem.clientSecret,
      accessToken: selectedItem.accessToken,
      refreshToken: selectedItem.refreshToken,
      tokenExpiresAt: selectedItem.tokenExpiresAt?.slice(0, 16) ?? "",
      metadataJson: selectedItem.metadataJson
    });
  }, [selectedItem]);

  async function refresh() {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setItems(await listChannelAccounts(token));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Tải dữ liệu thất bại");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      channel: form.channel,
      accountName: form.accountName,
      accountRef: form.accountRef,
      authType: form.authType,
      status: form.status,
      clientId: form.clientId,
      clientSecret: form.clientSecret,
      accessToken: form.accessToken,
      refreshToken: form.refreshToken,
      tokenExpiresAt: form.tokenExpiresAt
        ? new Date(form.tokenExpiresAt).toISOString()
        : undefined,
      metadataJson: form.metadataJson
    };

    try {
      if (selectedId) {
        await updateChannelAccount(token, selectedId, payload);
      } else {
        await createChannelAccount(token, payload);
      }

      setSelectedId(null);
      setForm(emptyForm);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!token) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await deleteChannelAccount(token, id);
      if (selectedId === id) {
        setSelectedId(null);
        setForm(emptyForm);
      }
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Xóa thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function handleRefreshToken(id: string) {
    if (!token) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await refreshChannelAccount(token, id);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Làm mới token thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Tài khoản kênh"
        description="Kết nối Shopee/TikTok/Facebook, lưu token hoặc tài khoản dịch vụ và làm mới token cho xuất bản thử nghiệm."
      />
      {oauthState ? (
        <div className={oauthState === "success" ? "success-banner" : "error-banner"}>
          OAuth {oauthProvider ?? "nhà cung cấp"}:{" "}
          {oauthState === "success" ? "thành công" : oauthState === "error" ? "lỗi" : oauthState}
        </div>
      ) : null}
      {error ? <div className="error-banner">{error}</div> : null}
      <section className="grid two-columns wide-layout">
        <form className="panel stack" onSubmit={handleSubmit}>
          <h2>{selectedId ? "Cập nhật tài khoản" : "Thêm tài khoản kênh"}</h2>
          <label className="field">
            <span>Kênh</span>
            <select
              value={form.channel}
              onChange={(event) =>
                setForm({
                  ...form,
                  channel: event.target.value as ChannelAccountRecord["channel"]
                })
              }
            >
              <option value="tiktok">TikTok</option>
              <option value="shopee">Shopee</option>
              <option value="facebook">Facebook</option>
            </select>
          </label>
          <label className="field">
            <span>Tên hiển thị</span>
            <input
              value={form.accountName}
              onChange={(event) => setForm({ ...form, accountName: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Mã tham chiếu</span>
            <input
              value={form.accountRef}
              onChange={(event) => setForm({ ...form, accountRef: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Kiểu xác thực</span>
            <select
              value={form.authType}
              onChange={(event) =>
                setForm({
                  ...form,
                  authType: event.target.value as ChannelAccountRecord["authType"]
                })
              }
            >
              <option value="oauth">OAuth</option>
              <option value="service_account">Tài khoản dịch vụ</option>
              <option value="manual">Thủ công</option>
            </select>
          </label>
          <label className="field">
            <span>Trạng thái</span>
            <select
              value={form.status}
              onChange={(event) =>
                setForm({
                  ...form,
                  status: event.target.value as ChannelAccountRecord["status"]
                })
              }
            >
              <option value="connected">{viStatus("connected")}</option>
              <option value="expired">{viStatus("expired")}</option>
              <option value="error">{viStatus("error")}</option>
              <option value="disconnected">{viStatus("disconnected")}</option>
            </select>
          </label>
          <label className="field">
            <span>Mã client</span>
            <input
              value={form.clientId}
              onChange={(event) => setForm({ ...form, clientId: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Bí mật client</span>
            <input
              value={form.clientSecret}
              onChange={(event) => setForm({ ...form, clientSecret: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Access token</span>
            <textarea
              value={form.accessToken}
              onChange={(event) => setForm({ ...form, accessToken: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Refresh token</span>
            <textarea
              value={form.refreshToken}
              onChange={(event) => setForm({ ...form, refreshToken: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Token hết hạn lúc</span>
            <input
              type="datetime-local"
              value={form.tokenExpiresAt}
              onChange={(event) => setForm({ ...form, tokenExpiresAt: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Metadata (JSON)</span>
            <textarea
              value={form.metadataJson}
              onChange={(event) => setForm({ ...form, metadataJson: event.target.value })}
            />
          </label>
          <div className="actions">
            <button className="primary-button" disabled={saving} type="submit">
              {saving ? "Đang lưu…" : selectedId ? "Cập nhật" : "Lưu"}
            </button>
            {selectedId ? (
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setSelectedId(null);
                  setForm(emptyForm);
                }}
              >
                Bỏ chọn
              </button>
            ) : null}
          </div>
        </form>

        <div className="panel">
          <div className="section-header">
            <h2>Danh sách tài khoản</h2>
            <button className="secondary-button" onClick={() => void refresh()} type="button">
              Tải lại
            </button>
          </div>
          {loading ? <div>Đang tải tài khoản kênh…</div> : null}
          <table className="table">
            <thead>
              <tr>
                <th>Kênh</th>
                <th>Tài khoản</th>
                <th>Trạng thái</th>
                <th>Hết hạn</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <StatusBadge value={item.channel} />
                  </td>
                  <td>
                    <div>{item.accountName}</div>
                    <div className="muted">{item.accountRef}</div>
                  </td>
                  <td>
                    <StatusBadge value={item.status} />
                  </td>
                  <td>
                    {item.tokenExpiresAt ? new Date(item.tokenExpiresAt).toLocaleString() : "-"}
                  </td>
                  <td className="actions-cell">
                    <button
                      className="secondary-button small-button"
                      onClick={() => setSelectedId(item.id)}
                      type="button"
                    >
                      Sửa
                    </button>
                    {token && item.authType === "oauth" ? (
                      <a
                        className="secondary-button small-button"
                        href={getOAuthStartUrl(item.channel, item.id, token)}
                      >
                        OAuth
                      </a>
                    ) : null}
                    <button
                      className="primary-button small-button"
                      onClick={() => void handleRefreshToken(item.id)}
                      type="button"
                    >
                      Làm mới
                    </button>
                    <button
                      className="danger-button small-button"
                      onClick={() => void handleDelete(item.id)}
                      type="button"
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
