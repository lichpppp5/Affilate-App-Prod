"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import type { ApprovalRecord, ProjectRecord } from "../lib/api";
import {
  createApproval,
  deleteApproval,
  listApprovals,
  listProjects,
  updateApproval
} from "../lib/api";
import { viStatus } from "../lib/ui-vi";
import { useAuth } from "./auth-provider";
import { PageHeader } from "./page-header";

const emptyForm = {
  projectId: "",
  decision: "approved",
  comment: ""
};

export function ApprovalsManager() {
  const { token } = useAuth();
  const [items, setItems] = useState<ApprovalRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
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

  useEffect(() => {
    if (!selectedItem) {
      setForm(emptyForm);
      return;
    }

    setForm({
      projectId: selectedItem.projectId,
      decision: selectedItem.decision,
      comment: selectedItem.comment
    });
  }, [selectedItem]);

  async function refresh() {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [nextItems, nextProjects] = await Promise.all([
        listApprovals(token),
        listProjects(token)
      ]);
      setItems(nextItems);
      setProjects(nextProjects);
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

    try {
      if (selectedId) {
        await updateApproval(token, selectedId, form);
      } else {
        await createApproval(token, form);
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
      await deleteApproval(token, id);
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

  return (
    <>
      <PageHeader
        title="Phê duyệt"
        description="Duyệt dự án thật, lưu quyết định và ghi chú, đồng bộ trạng thái quy trình trên dự án."
      />
      {error ? <div className="error-banner">{error}</div> : null}
      <section className="grid two-columns">
        <form className="panel stack" onSubmit={handleSubmit}>
          <h2>{selectedId ? "Cập nhật phê duyệt" : "Tạo phê duyệt"}</h2>
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
            <span>Quyết định</span>
            <select
              value={form.decision}
              onChange={(event) => setForm({ ...form, decision: event.target.value })}
            >
              <option value="approved">{viStatus("approved")}</option>
              <option value="changes_requested">{viStatus("changes_requested")}</option>
              <option value="rejected">{viStatus("rejected")}</option>
            </select>
          </label>
          <label className="field">
            <span>Ghi chú</span>
            <textarea
              value={form.comment}
              onChange={(event) => setForm({ ...form, comment: event.target.value })}
            />
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
            <h2>Danh sách phê duyệt</h2>
            <button className="secondary-button" onClick={() => void refresh()} type="button">
              Tải lại
            </button>
          </div>
          {loading ? <div>Đang tải phê duyệt…</div> : null}
          <table className="table">
            <thead>
              <tr>
                <th>Dự án</th>
                <th>Quyết định</th>
                <th>Người duyệt</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{projects.find((project) => project.id === item.projectId)?.title ?? "-"}</td>
                  <td>{viStatus(item.decision)}</td>
                  <td>{item.reviewerName}</td>
                  <td className="actions-cell">
                    <button
                      className="secondary-button small-button"
                      onClick={() => setSelectedId(item.id)}
                      type="button"
                    >
                      Sửa
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
