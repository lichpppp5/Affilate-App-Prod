"use client";

import { useEffect, useState } from "react";

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from "../lib/api";
import { viSeverity } from "../lib/ui-vi";
import { useAuth } from "./auth-provider";
import { PageHeader } from "./page-header";

export function NotificationsClient() {
  const { token, session } = useAuth();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listNotifications>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);

  async function refresh() {
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRows(await listNotifications(token, { unreadOnly, limit: 80 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tải dữ liệu thất bại");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token || !session?.permissions?.includes("notifications:read")) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [token, session, unreadOnly]);

  async function onMarkOne(id: string) {
    if (!token) {
      return;
    }
    await markNotificationRead(token, id);
    await refresh();
  }

  async function onMarkAll() {
    if (!token) {
      return;
    }
    await markAllNotificationsRead(token);
    await refresh();
  }

  if (!session?.permissions?.includes("notifications:read")) {
    return (
      <>
        <PageHeader
          title="Thông báo"
          description="Cảnh báo vận hành từ worker và hệ thống."
        />
        <div className="panel error-banner">
          Bạn không có quyền xem thông báo (notifications:read).
        </div>
      </>
    );
  }

  const canWrite = session.permissions.includes("notifications:write");

  return (
    <>
      <PageHeader
        title="Thông báo"
        description="Lỗi render/xuất bản được worker ghi vào đây (leo thang cơ bản)."
      />
      <div className="panel filter-bar">
        <label className="field">
          <input
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            type="checkbox"
          />
          <span>Chỉ chưa đọc</span>
        </label>
        {canWrite ? (
          <button className="secondary-button" onClick={() => void onMarkAll()} type="button">
            Đánh dấu đã đọc tất cả
          </button>
        ) : null}
        <button className="primary-button" onClick={() => void refresh()} type="button">
          Tải lại
        </button>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      {loading ? <div className="panel">Đang tải…</div> : null}
      {!loading && !error ? (
        <div className="grid">
          {rows.length === 0 ? <div className="panel muted">Không có thông báo.</div> : null}
          {rows.map((n) => (
            <div className="panel" key={n.id}>
              <div>
                <strong>{n.title}</strong>
                <span className="muted"> · {viSeverity(n.severity)}</span>
                {n.readAt ? <span className="muted"> · Đã đọc</span> : null}
              </div>
              <div className="muted">{n.createdAt}</div>
              {n.body ? <p>{n.body}</p> : null}
              {n.refType ? (
                <div className="muted">
                  {n.refType}: {n.refId}
                </div>
              ) : null}
              {canWrite && !n.readAt ? (
                <button
                  className="secondary-button"
                  onClick={() => void onMarkOne(n.id)}
                  type="button"
                >
                  Đã đọc
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
