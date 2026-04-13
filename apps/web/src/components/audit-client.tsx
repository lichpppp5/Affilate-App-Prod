"use client";

import { useEffect, useState } from "react";

import { listAuditLogs } from "../lib/api";
import { useAuth } from "./auth-provider";
import { PageHeader } from "./page-header";

export function AuditClient() {
  const { token, session } = useAuth();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listAuditLogs>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !session?.permissions?.includes("audit:read")) {
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        setRows(await listAuditLogs(token, { limit: 100 }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Tải dữ liệu thất bại");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, session]);

  if (!session?.permissions?.includes("audit:read")) {
    return (
      <>
        <PageHeader
          title="Nhật ký kiểm tra"
          description="Chỉ org_admin xem được nhật ký kiểm tra."
        />
        <div className="panel error-banner">
          Bạn không có quyền xem nhật ký (audit:read).
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Nhật ký kiểm tra"
        description="Các thao tác nhạy cảm: đăng nhập, CRUD, xuất bản, kênh."
      />
      {error ? <div className="error-banner">{error}</div> : null}
      {loading ? <div className="panel">Đang tải…</div> : null}
      {!loading && !error ? (
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>Thời điểm</th>
                <th>Hành động</th>
                <th>Tài nguyên</th>
                <th>Người dùng</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="muted">{row.createdAt}</td>
                  <td>{row.action}</td>
                  <td>
                    {row.resourceType || "—"}
                    {row.resourceId ? ` / ${row.resourceId}` : ""}
                  </td>
                  <td className="muted">{row.userId ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
