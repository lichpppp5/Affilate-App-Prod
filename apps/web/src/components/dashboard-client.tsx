"use client";

import { useEffect, useState } from "react";

import { useAuth } from "./auth-provider";
import { PageHeader } from "./page-header";
import { getDashboard } from "../lib/api";
import { viAlertLabel, viProviderMode, viStatus } from "../lib/ui-vi";

export function DashboardClient() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getDashboard>> | null>(
    null
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    void loadDashboard();
  }, [token]);

  async function loadDashboard() {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setStats(await getDashboard(token));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Tải dữ liệu thất bại");
    } finally {
      setLoading(false);
    }
  }

  const cards = stats
    ? [
        { label: "Sản phẩm", value: String(stats.productCount) },
        { label: "Tài nguyên", value: String(stats.assetCount) },
        { label: "Dự án", value: String(stats.projectCount) },
        { label: "Phê duyệt", value: String(stats.approvalCount) },
        { label: "Việc xuất bản", value: String(stats.publishJobCount) },
        { label: "Cảnh báo hoạt động", value: String(stats.alerts.length) }
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Vận hành video & affiliate"
        description="Tổng quan nối API thật: số liệu sản phẩm, tài nguyên, dự án và trạng thái quy trình."
      />
      {error ? <div className="error-banner">{error}</div> : null}
      {loading ? <div className="panel">Đang tải tổng quan…</div> : null}
      {stats ? (
        <>
          <section className="grid">
            {cards.map((card) => (
              <div className="card" key={card.label}>
                <div className="muted">{card.label}</div>
                <h2>{card.value}</h2>
              </div>
            ))}
          </section>

          <section className="grid two-columns" style={{ marginTop: 24 }}>
            <div className="panel">
              <h2>Trạng thái quy trình</h2>
              <table className="table">
                <tbody>
                  {Object.entries(stats.workflowStates).map(([status, count]) => (
                    <tr key={status}>
                      <td>{viStatus(status)}</td>
                      <td>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel">
              <h2>Ảnh chụp cảnh báo</h2>
              <table className="table">
                <tbody>
                  {stats.alerts.map((alert) => (
                    <tr key={alert.label}>
                      <td>{viAlertLabel(alert.label)}</td>
                      <td>{alert.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="grid two-columns" style={{ marginTop: 24 }}>
            <div className="panel">
              <h2>Sức khỏe OAuth / token</h2>
              <table className="table">
                <tbody>
                  <tr>
                    <td>{viStatus("connected")}</td>
                    <td>{stats.oauthHealth.connectedCount}</td>
                  </tr>
                  <tr>
                    <td>{viStatus("expired")}</td>
                    <td>{stats.oauthHealth.expiredCount}</td>
                  </tr>
                  <tr>
                    <td>Sắp hết hạn</td>
                    <td>{stats.oauthHealth.expiringSoonCount}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="panel">
              <h2>Sẵn sàng nhà cung cấp</h2>
              <table className="table">
                <tbody>
                  {stats.providerHealth.map((provider) => (
                    <tr key={provider.provider}>
                      <td>{viStatus(provider.provider)}</td>
                      <td>{viProviderMode(provider.mode)}</td>
                      <td>{provider.configured ? "Đã cấu hình endpoint" : "Mặc định (mock)"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
