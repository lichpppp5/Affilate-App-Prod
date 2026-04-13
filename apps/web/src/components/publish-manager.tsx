"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import type {
  ChannelAccountRecord,
  ProductRecord,
  ProjectRecord,
  PublishAttemptRecord,
  PublishJobRecord,
  PublishWebhookRecord
} from "../lib/api";
import {
  cancelPublishJob,
  createPublishJob,
  deletePublishJob,
  listChannelAccounts,
  listProducts,
  listProjects,
  listPublishAttempts,
  listPublishJobs,
  listPublishWebhooks,
  retryPublishJob,
  simulatePublishWebhook,
  updatePublishJob
} from "../lib/api";
import { viPublishStage, viStatus } from "../lib/ui-vi";
import { useAuth } from "./auth-provider";
import { PageHeader } from "./page-header";
import { StatusBadge } from "./status-badge";

const emptyForm = {
  projectId: "",
  productId: "",
  channel: "tiktok",
  accountId: "",
  caption: "",
  hashtags: "#ad,#promo",
  disclosureText: "#ad",
  affiliateLink: "",
  scheduledAt: "",
  status: "queued"
};

export function PublishManager() {
  const { token } = useAuth();
  const [items, setItems] = useState<PublishJobRecord[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [channelAccounts, setChannelAccounts] = useState<ChannelAccountRecord[]>([]);
  const [attempts, setAttempts] = useState<PublishAttemptRecord[]>([]);
  const [webhooks, setWebhooks] = useState<PublishWebhookRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      void refresh();
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const hasActiveJobs = items.some((item) =>
      ["queued", "processing", "scheduled"].includes(item.status)
    );

    if (!hasActiveJobs) {
      return;
    }

    const interval = window.setInterval(() => {
      void refresh({ silent: true });
    }, 2500);

    return () => window.clearInterval(interval);
  }, [items, token]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const project = projects.find((candidate) => candidate.id === item.projectId);
      const product = products.find((candidate) => candidate.id === item.productId);
      const haystack =
        `${item.channel} ${item.caption} ${project?.title ?? ""} ${product?.sku ?? ""}`.toLowerCase();
      const matchesQuery = haystack.includes(query.trim().toLowerCase());
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [items, products, projects, query, statusFilter]);

  const availableAccounts = useMemo(() => {
    return channelAccounts.filter((item) => item.channel === form.channel);
  }, [channelAccounts, form.channel]);

  useEffect(() => {
    if (!selectedItem) {
      setForm(emptyForm);
      return;
    }

    setForm({
      projectId: selectedItem.projectId,
      productId: selectedItem.productId,
      channel: selectedItem.channel,
      accountId: selectedItem.accountId,
      caption: selectedItem.caption,
      hashtags: selectedItem.hashtags.join(","),
      disclosureText: selectedItem.disclosureText,
      affiliateLink: selectedItem.affiliateLink,
      scheduledAt: selectedItem.scheduledAt?.slice(0, 16) ?? "",
      status: selectedItem.status
    });
  }, [selectedItem]);

  useEffect(() => {
    if (form.accountId && !availableAccounts.some((item) => item.id === form.accountId)) {
      setForm((current) => ({ ...current, accountId: "" }));
    }
  }, [availableAccounts, form.accountId]);

  useEffect(() => {
    if (selectedId || !form.productId) {
      return;
    }

    const product = products.find((item) => item.id === form.productId);
    const url = product?.affiliateSourceUrl?.trim();
    if (!url) {
      return;
    }

    setForm((current) => {
      if (current.affiliateLink.trim()) {
        return current;
      }
      return { ...current, affiliateLink: url };
    });
  }, [form.productId, products, selectedId]);

  async function refresh(options?: { silent?: boolean }) {
    if (!token) {
      return;
    }

    if (!options?.silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const [nextJobs, nextProducts, nextProjects, nextAttempts, nextWebhooks, nextAccounts] =
        await Promise.all([
        listPublishJobs(token),
        listProducts(token),
        listProjects(token),
        listPublishAttempts(token),
        listPublishWebhooks(token),
        listChannelAccounts(token)
      ]);
      setItems(nextJobs);
      setProducts(nextProducts);
      setProjects(nextProjects);
      setAttempts(nextAttempts);
      setWebhooks(nextWebhooks);
      setChannelAccounts(nextAccounts);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Tải dữ liệu thất bại");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
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
      projectId: form.projectId,
      productId: form.productId,
      channel: form.channel,
      accountId: form.accountId,
      caption: form.caption,
      hashtags: form.hashtags
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      disclosureText: form.disclosureText,
      affiliateLink: form.affiliateLink,
      scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
      status: form.status
    };

    try {
      if (selectedId) {
        await updatePublishJob(token, selectedId, payload);
      } else {
        await createPublishJob(token, payload);
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
      await deletePublishJob(token, id);
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

  async function handleSimulateWebhook(publishJobId: string, eventType: string) {
    if (!token) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await simulatePublishWebhook(token, {
        publishJobId,
        eventType,
        payload: {
          source: "admin_ui",
          publishJobId,
          eventType
        }
      });
      await refresh();
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Mô phỏng webhook thất bại"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRetry(id: string) {
    if (!token) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await retryPublishJob(token, id);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Thử lại job xuất bản thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(id: string) {
    if (!token) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await cancelPublishJob(token, id);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Hủy job xuất bản thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Trung tâm xuất bản"
        description="Đăng lên TikTok, Shopee, Facebook: chú thích, hashtag, công bố quảng cáo (#ad), liên kết affiliate (bắt buộc với mock Facebook)."
      />
      {error ? <div className="error-banner">{error}</div> : null}
      <section className="grid two-columns wide-layout">
        <form className="panel stack" onSubmit={handleSubmit}>
          <h2>{selectedId ? "Cập nhật job xuất bản" : "Tạo job xuất bản"}</h2>
          <label className="field">
            <span>Dự án</span>
            <select
              value={form.projectId}
              onChange={(event) => setForm({ ...form, projectId: event.target.value })}
            >
              <option value="">Chọn dự án</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Sản phẩm</span>
            <select
              value={form.productId}
              onChange={(event) => setForm({ ...form, productId: event.target.value })}
            >
              <option value="">Chọn sản phẩm</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.sku} - {product.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Kênh</span>
            <select
              value={form.channel}
              onChange={(event) => setForm({ ...form, channel: event.target.value })}
            >
              <option value="tiktok">TikTok</option>
              <option value="shopee">Shopee</option>
              <option value="facebook">Facebook</option>
            </select>
          </label>
          <label className="field">
            <span>Tài khoản kênh</span>
            <select
              value={form.accountId}
              onChange={(event) => setForm({ ...form, accountId: event.target.value })}
            >
              <option value="">Chọn tài khoản</option>
              {availableAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.accountName} - {account.accountRef}
                </option>
              ))}
            </select>
          </label>
          {availableAccounts.length === 0 ? (
            <div className="muted">
              Chưa có tài khoản cho kênh này. Vào trang Kênh bán để kết nối.
            </div>
          ) : null}
          <label className="field">
            <span>Chú thích (caption)</span>
            <textarea
              value={form.caption}
              onChange={(event) => setForm({ ...form, caption: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Hashtag</span>
            <input
              value={form.hashtags}
              onChange={(event) => setForm({ ...form, hashtags: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Công bố quảng cáo</span>
            <input
              value={form.disclosureText}
              onChange={(event) =>
                setForm({ ...form, disclosureText: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Liên kết affiliate</span>
            <input
              value={form.affiliateLink}
              onChange={(event) =>
                setForm({ ...form, affiliateLink: event.target.value })
              }
              placeholder="Từ sản phẩm hoặc dán tay — cần cho Facebook"
            />
          </label>
          <label className="field">
            <span>Lên lịch lúc</span>
            <input
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(event) =>
                setForm({ ...form, scheduledAt: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Trạng thái</span>
            <select
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value })}
            >
              <option value="queued">{viStatus("queued")}</option>
              <option value="draft_uploaded">{viStatus("draft_uploaded")}</option>
              <option value="scheduled">{viStatus("scheduled")}</option>
              <option value="published">{viStatus("published")}</option>
              <option value="failed">{viStatus("failed")}</option>
            </select>
          </label>
          <div className="actions">
            <button className="primary-button" disabled={saving} type="submit">
              {saving ? "Đang lưu…" : selectedId ? "Cập nhật" : "Tạo mới"}
            </button>
            {selectedId ? (
              <button
                className="secondary-button"
                onClick={() => {
                  setSelectedId(null);
                  setForm(emptyForm);
                }}
                type="button"
              >
                Bỏ chọn
              </button>
            ) : null}
          </div>
        </form>

        <div className="panel">
          <div className="section-header">
            <h2>Danh sách job xuất bản</h2>
            <button className="secondary-button" onClick={() => void refresh()} type="button">
              Tải lại
            </button>
          </div>
          <div className="toolbar">
            <label className="field">
              <span>Tìm nhanh</span>
              <input
                placeholder="Tìm theo caption, kênh, dự án, SKU…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Lọc trạng thái</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">Tất cả</option>
                <option value="queued">{viStatus("queued")}</option>
                <option value="processing">{viStatus("processing")}</option>
                <option value="draft_uploaded">{viStatus("draft_uploaded")}</option>
                <option value="scheduled">{viStatus("scheduled")}</option>
                <option value="published">{viStatus("published")}</option>
                <option value="failed">{viStatus("failed")}</option>
              </select>
            </label>
          </div>
          {loading ? <div>Đang tải job xuất bản…</div> : null}
          <table className="table">
            <thead>
              <tr>
                <th>Kênh</th>
                <th>Dự án</th>
                <th>Trạng thái</th>
                <th>Lịch đăng</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <StatusBadge value={item.channel} />
                  </td>
                  <td>{projects.find((project) => project.id === item.projectId)?.title ?? "-"}</td>
                  <td>
                    <StatusBadge value={item.status} />
                  </td>
                  <td>{item.scheduledAt ? new Date(item.scheduledAt).toLocaleString() : "-"}</td>
                  <td className="actions-cell">
                    <button
                      className="secondary-button small-button"
                      onClick={() => setSelectedId(item.id)}
                      type="button"
                    >
                      Sửa
                    </button>
                    {["failed", "canceled", "draft_uploaded", "published"].includes(
                      item.status
                    ) ? (
                      <button
                        className="primary-button small-button"
                        onClick={() => void handleRetry(item.id)}
                        type="button"
                      >
                        Thử lại
                      </button>
                    ) : null}
                    {["queued", "processing", "scheduled", "draft_uploaded"].includes(
                      item.status
                    ) ? (
                      <button
                        className="secondary-button small-button"
                        onClick={() => void handleCancel(item.id)}
                        type="button"
                      >
                        Hủy
                      </button>
                    ) : null}
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
      <section className="grid two-columns wide-layout" style={{ marginTop: 24 }}>
        <div className="panel">
          <div className="section-header">
            <h2>Lần thử xuất bản</h2>
            <div className="muted">Nhật ký mỗi lần gửi lên nhà cung cấp</div>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Giai đoạn</th>
                <th>Trạng thái</th>
                <th>Lỗi</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((attempt) => (
                <tr key={attempt.id}>
                  <td>{attempt.publishJobId}</td>
                  <td>{viPublishStage(attempt.stage)}</td>
                  <td>
                    <StatusBadge value={attempt.status} />
                  </td>
                  <td>{attempt.errorMessage || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <div className="section-header">
            <h2>Mô phỏng webhook</h2>
            <div className="muted">Giả lập callback trạng thái xuất bản</div>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={`webhook-${item.id}`}>
                  <td>{item.id}</td>
                  <td>
                    <StatusBadge value={item.status} />
                  </td>
                  <td className="actions-cell">
                    <button
                      className="secondary-button small-button"
                      onClick={() => void handleSimulateWebhook(item.id, "draft_uploaded")}
                      type="button"
                    >
                      Bản nháp
                    </button>
                    <button
                      className="primary-button small-button"
                      onClick={() => void handleSimulateWebhook(item.id, "published")}
                      type="button"
                    >
                      Đã đăng
                    </button>
                    <button
                      className="danger-button small-button"
                      onClick={() => void handleSimulateWebhook(item.id, "failed")}
                      type="button"
                    >
                      Thất bại
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="section-header" style={{ marginTop: 20 }}>
            <h2>Sự kiện webhook</h2>
            <div className="muted">Nhật ký sự kiện đã xử lý</div>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Sự kiện</th>
                <th>Job</th>
                <th>Xử lý</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map((event) => (
                <tr key={event.id}>
                  <td>{viStatus(event.eventType)}</td>
                  <td>{event.publishJobId}</td>
                  <td>
                    <StatusBadge value={event.processedStatus} />
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
