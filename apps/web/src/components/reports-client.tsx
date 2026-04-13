"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import { getReports } from "../lib/api";
import { viBadgeLabel, viStatus } from "../lib/ui-vi";
import { useAuth } from "./auth-provider";
import { PageHeader } from "./page-header";

export function ReportsClient() {
  const { token } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getReports>> | null>(
    null
  );

  useEffect(() => {
    if (token) {
      void refresh({});
    }
  }, [token]);

  async function refresh(filter: { from?: string; to?: string }) {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setStats(await getReports(token, filter));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Tải dữ liệu thất bại");
    } finally {
      setLoading(false);
    }
  }

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void refresh({
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined
    });
  }

  const metricCards = stats
    ? [
        { label: "Giá sản phẩm TB", value: stats.avgProductPrice.toFixed(0) },
        { label: "Job đã đăng", value: String(stats.publishedJobs) },
        { label: "Phê duyệt đạt", value: String(stats.approvedReviews) },
        {
          label: "Chi phí vận hành ước tính (USD)",
          value: stats.operations.estimatedTotalCostUsd.toFixed(2)
        },
        {
          label: "Render hoàn tất",
          value: String(stats.operations.completedRenders)
        },
        {
          label: "Lần xuất bản thành công",
          value: String(stats.operations.successfulPublishAttempts)
        }
      ]
    : [];

  const statusMax = useMemo(
    () => Math.max(...(stats?.projectStatuses.map((item) => item.count) ?? [1])),
    [stats]
  );
  const channelMax = useMemo(
    () => Math.max(...(stats?.channels.map((item) => item.count) ?? [1])),
    [stats]
  );

  return (
    <>
      <PageHeader
        title="Báo cáo & giám sát"
        description="Tổng hợp KPI, phân bổ kênh, ước tính chi phí vận hành (COST_RENDER_UNIT_USD / COST_PUBLISH_UNIT_USD trên API)."
      />
      <form className="panel filter-bar" onSubmit={handleFilterSubmit}>
        <label className="field">
          <span>Từ</span>
          <input
            type="datetime-local"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Đến</span>
          <input
            type="datetime-local"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <div className="actions align-end">
          <button className="primary-button" type="submit">
            Lọc dữ liệu
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              setFrom("");
              setTo("");
              void refresh({});
            }}
            type="button"
          >
            Đặt lại
          </button>
        </div>
      </form>
      {error ? <div className="error-banner">{error}</div> : null}
      {loading ? <div className="panel">Đang tải báo cáo…</div> : null}
      {stats ? (
        <>
          <section className="grid">
            {metricCards.map((card) => (
              <div className="card" key={card.label}>
                <div className="muted">{card.label}</div>
                <h2>{card.value}</h2>
              </div>
            ))}
          </section>
          <section className="grid two-columns" style={{ marginTop: 24 }}>
            <div className="panel">
              <h2>Trạng thái dự án</h2>
              <div className="chart-list">
                {stats.projectStatuses.map((item) => (
                  <div className="chart-row" key={item.status}>
                    <div className="chart-label">{viStatus(item.status)}</div>
                    <div className="chart-bar">
                      <div
                        className="chart-fill"
                        style={{ width: `${(item.count / statusMax) * 100}%` }}
                      />
                    </div>
                    <div className="chart-value">{item.count}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="panel">
              <h2>Phân bổ kênh</h2>
              <div className="chart-list">
                {stats.channels.map((item) => (
                  <div className="chart-row" key={item.channel}>
                    <div className="chart-label">{viBadgeLabel(item.channel)}</div>
                    <div className="chart-bar">
                      <div
                        className="chart-fill alt-fill"
                        style={{ width: `${(item.count / channelMax) * 100}%` }}
                      />
                    </div>
                    <div className="chart-value">{item.count}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
