"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import type { ProductRecord, ProjectRecord, RenderJobRecord } from "../lib/api";
import {
  cancelRenderJob,
  createRenderJob,
  createProject,
  deleteRenderJob,
  deleteProject,
  getRenderMediaUrl,
  listProducts,
  listProjects,
  listRenderJobs,
  retryRenderJob,
  updateProject
} from "../lib/api";
import { viRenderStep, viStatus } from "../lib/ui-vi";
import { useAuth } from "./auth-provider";
import { PageHeader } from "./page-header";
import { StatusBadge } from "./status-badge";

const emptyForm = {
  title: "",
  productId: "",
  templateId: "template_tiktok_ugc",
  brandKitId: "",
  status: "draft"
};

export function ProjectsManager() {
  const { token } = useAuth();
  const [items, setItems] = useState<ProjectRecord[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [renderJobs, setRenderJobs] = useState<RenderJobRecord[]>([]);
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

    const hasActiveRender = renderJobs.some((job) =>
      ["queued", "processing"].includes(job.status)
    );

    if (!hasActiveRender) {
      return;
    }

    const interval = window.setInterval(() => {
      void refresh({ silent: true });
    }, 2500);

    return () => window.clearInterval(interval);
  }, [renderJobs, token]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  );

  const latestRenderByProject = useMemo(() => {
    return renderJobs.reduce((map, job) => {
      if (!map.has(job.projectId)) {
        map.set(job.projectId, job);
      }
      return map;
    }, new Map<string, RenderJobRecord>());
  }, [renderJobs]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const product = products.find((candidate) => candidate.id === item.productId);
      const haystack = `${item.title} ${item.templateId} ${product?.sku ?? ""}`.toLowerCase();
      const matchesQuery = haystack.includes(query.trim().toLowerCase());
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [items, products, query, statusFilter]);

  const previewProject = selectedItem ?? filteredItems[0] ?? null;
  const previewRender = previewProject
    ? latestRenderByProject.get(previewProject.id) ?? null
    : null;

  useEffect(() => {
    if (!selectedItem) {
      setForm(emptyForm);
      return;
    }

    setForm({
      title: selectedItem.title,
      productId: selectedItem.productId,
      templateId: selectedItem.templateId,
      brandKitId: selectedItem.brandKitId ?? "",
      status: selectedItem.status
    });
  }, [selectedItem]);

  async function refresh(options?: { silent?: boolean }) {
    if (!token) {
      return;
    }

    if (!options?.silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const [nextProjects, nextProducts, nextRenderJobs] = await Promise.all([
        listProjects(token),
        listProducts(token),
        listRenderJobs(token)
      ]);
      setItems(nextProjects);
      setProducts(nextProducts);
      setRenderJobs(nextRenderJobs);
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
      title: form.title,
      productId: form.productId,
      templateId: form.templateId,
      brandKitId: form.brandKitId || undefined,
      status: form.status
    };

    try {
      if (selectedId) {
        await updateProject(token, selectedId, payload);
      } else {
        await createProject(token, payload);
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
      await deleteProject(token, id);
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

  async function handleQueueRender(projectId: string) {
    if (!token) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await createRenderJob(token, { projectId });
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Xếp hàng render thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRenderJob(id: string) {
    if (!token) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await deleteRenderJob(token, id);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Xóa job render thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function handleRetryRenderJob(id: string) {
    if (!token) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await retryRenderJob(token, id);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Thử lại job render thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelRenderJob(id: string) {
    if (!token) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await cancelRenderJob(token, id);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Hủy job render thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Dự án video"
        description="Quản lý dự án video thật, xếp hàng render, xem trước và tải tệp ngay trong trang quản trị."
      />
      {error ? <div className="error-banner">{error}</div> : null}
      <section className="grid two-columns wide-layout">
        <form className="panel stack" onSubmit={handleSubmit}>
          <h2>{selectedId ? "Cập nhật dự án" : "Tạo dự án"}</h2>
          <label className="field">
            <span>Tên dự án</span>
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
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
            <span>Mã mẫu (template)</span>
            <input
              value={form.templateId}
              onChange={(event) =>
                setForm({ ...form, templateId: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Mã bộ nhận diện</span>
            <input
              value={form.brandKitId}
              onChange={(event) =>
                setForm({ ...form, brandKitId: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Trạng thái</span>
            <select
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value })}
            >
              <option value="draft">{viStatus("draft")}</option>
              <option value="generating">{viStatus("generating")}</option>
              <option value="review">{viStatus("review")}</option>
              <option value="approved">{viStatus("approved")}</option>
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
            <h2>Danh sách dự án</h2>
            <div className="actions">
              <button className="secondary-button" onClick={() => void refresh()} type="button">
                Tải lại
              </button>
            </div>
          </div>
          <div className="toolbar">
            <label className="field">
              <span>Tìm nhanh</span>
              <input
                placeholder="Tìm theo tên, SKU, mẫu…"
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
                <option value="draft">{viStatus("draft")}</option>
                <option value="generating">{viStatus("generating")}</option>
                <option value="review">{viStatus("review")}</option>
                <option value="approved">{viStatus("approved")}</option>
                <option value="scheduled">{viStatus("scheduled")}</option>
                <option value="published">{viStatus("published")}</option>
                <option value="failed">{viStatus("failed")}</option>
              </select>
            </label>
          </div>
          {loading ? <div>Đang tải dự án…</div> : null}
          <table className="table">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Sản phẩm</th>
                <th>Mẫu</th>
                <th>Trạng thái</th>
                <th>Render gần nhất</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.title}</td>
                  <td>{products.find((product) => product.id === item.productId)?.sku ?? "-"}</td>
                  <td>{item.templateId}</td>
                  <td>
                    <StatusBadge value={item.status} />
                  </td>
                  <td>
                    {latestRenderByProject.get(item.id) ? (
                      <StatusBadge value={latestRenderByProject.get(item.id)?.status ?? "unknown"} />
                    ) : (
                      <span className="muted">Chưa có render</span>
                    )}
                  </td>
                  <td className="actions-cell">
                    <button
                      className="secondary-button small-button"
                      onClick={() => setSelectedId(item.id)}
                      type="button"
                    >
                      Sửa
                    </button>
                    <button
                      className="primary-button small-button"
                      onClick={() => void handleQueueRender(item.id)}
                      type="button"
                    >
                      Render
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
      {previewProject ? (
        <section className="grid two-columns wide-layout" style={{ marginTop: 24 }}>
          <div className="panel">
            <div className="section-header">
              <h2>Xem trước dự án</h2>
              <StatusBadge value={previewProject.status} />
            </div>
            <div className="preview-meta">
              <div>
                <strong>{previewProject.title}</strong>
              </div>
              <div className="muted">
                {products.find((item) => item.id === previewProject.productId)?.title ?? "-"}
              </div>
              <div className="muted">Mẫu: {previewProject.templateId}</div>
            </div>
            {previewRender ? (
              <div className="stack">
                <div className="actions">
                  <StatusBadge value={previewRender.status} />
                  <span className="muted">
                    {viRenderStep(previewRender.step)} — {previewRender.progress}%
                  </span>
                </div>
                {previewRender.outputThumbnailUrl ? (
                  <img
                    alt="Ảnh thu nhỏ render"
                    className="media-preview image-preview"
                    src={getRenderMediaUrl(previewRender.id, "thumbnail", token ?? "")}
                  />
                ) : null}
                {previewRender.outputVideoUrl ? (
                  <video
                    className="media-preview"
                    controls
                    src={getRenderMediaUrl(previewRender.id, "video", token ?? "")}
                  />
                ) : null}
                <div className="actions">
                  <a
                    className="primary-button"
                    href={getRenderMediaUrl(previewRender.id, "video", token ?? "")}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Mở video
                  </a>
                  <a
                    className="secondary-button"
                    href={getRenderMediaUrl(previewRender.id, "video", token ?? "", true)}
                  >
                    Tải video
                  </a>
                  <a
                    className="secondary-button"
                    href={getRenderMediaUrl(previewRender.id, "thumbnail", token ?? "", true)}
                  >
                    Tải ảnh thu nhỏ
                  </a>
                </div>
              </div>
            ) : (
              <div className="muted">Dự án này chưa có job render hoàn tất.</div>
            )}
          </div>
          <div className="panel">
            <div className="section-header">
              <h2>Dòng thời gian render</h2>
              <div className="muted">Theo dõi mọi job render của dự án</div>
            </div>
            <div className="stack">
              {renderJobs
                .filter((job) => job.projectId === previewProject.id)
                .map((job) => (
                  <div className="timeline-item" key={job.id}>
                    <div className="section-header compact-header">
                      <strong>{job.id}</strong>
                      <StatusBadge value={job.status} />
                    </div>
                    <div className="muted">
                      Bước: {viRenderStep(job.step)} — Tiến độ: {job.progress}%
                    </div>
                    {job.errorMessage ? (
                      <div className="error-inline">{job.errorMessage}</div>
                    ) : null}
                    <div className="actions">
                      {["failed", "canceled", "completed"].includes(job.status) ? (
                        <button
                          className="secondary-button small-button"
                          onClick={() => void handleRetryRenderJob(job.id)}
                          type="button"
                        >
                          Thử lại
                        </button>
                      ) : null}
                      {["queued", "processing"].includes(job.status) ? (
                        <button
                          className="secondary-button small-button"
                          onClick={() => void handleCancelRenderJob(job.id)}
                          type="button"
                        >
                          Hủy
                        </button>
                      ) : null}
                      <button
                        className="danger-button small-button"
                        onClick={() => void handleDeleteRenderJob(job.id)}
                        type="button"
                      >
                        Xóa job
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </section>
      ) : null}
      <section className="panel" style={{ marginTop: 24 }}>
        <div className="section-header">
          <h2>Job render</h2>
          <div className="muted">Xếp hàng render và theo dõi tiến trình worker</div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Dự án</th>
              <th>Trạng thái</th>
              <th>Bước</th>
              <th>Tiến độ</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {renderJobs.map((job) => (
              <tr key={job.id}>
                <td>{items.find((item) => item.id === job.projectId)?.title ?? job.projectId}</td>
                <td>
                  <StatusBadge value={job.status} />
                </td>
                <td>{viRenderStep(job.step)}</td>
                <td>{job.progress}%</td>
                <td className="actions-cell">
                  {job.status === "completed" && token ? (
                    <a
                      className="secondary-button small-button"
                      href={getRenderMediaUrl(job.id, "video", token)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Xem trước
                    </a>
                  ) : null}
                  {["failed", "canceled", "completed"].includes(job.status) ? (
                    <button
                      className="secondary-button small-button"
                      onClick={() => void handleRetryRenderJob(job.id)}
                      type="button"
                    >
                      Thử lại
                    </button>
                  ) : null}
                  {["queued", "processing"].includes(job.status) ? (
                    <button
                      className="secondary-button small-button"
                      onClick={() => void handleCancelRenderJob(job.id)}
                      type="button"
                    >
                      Hủy
                    </button>
                  ) : null}
                  <button
                    className="danger-button small-button"
                    onClick={() => void handleDeleteRenderJob(job.id)}
                    type="button"
                  >
                    Xóa job
                  </button>
                </td>
              </tr>
            ))}
            {items.map((item) => (
              <tr key={`queue-${item.id}`}>
                <td>{item.title}</td>
                <td colSpan={3} className="muted">
                  Tạo job render mới cho dự án này
                </td>
                <td className="actions-cell">
                  <button
                    className="primary-button small-button"
                    onClick={() => void handleQueueRender(item.id)}
                    type="button"
                  >
                    Xếp hàng render
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
