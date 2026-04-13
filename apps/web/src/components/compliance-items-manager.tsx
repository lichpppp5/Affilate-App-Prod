"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import type { ComplianceItemRecord } from "../lib/api";
import {
  createComplianceItem,
  deleteComplianceItem,
  listComplianceItems,
  updateComplianceItem
} from "../lib/api";
import { useAuth } from "./auth-provider";
import { PageHeader } from "./page-header";

const emptyForm = {
  channel: "tiktok",
  code: "",
  label: "",
  required: true,
  sortOrder: "0"
};

export function ComplianceItemsManager() {
  const { token } = useAuth();
  const [items, setItems] = useState<ComplianceItemRecord[]>([]);
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
      channel: selectedItem.channel,
      code: selectedItem.code,
      label: selectedItem.label,
      required: selectedItem.required,
      sortOrder: String(selectedItem.sortOrder)
    });
  }, [selectedItem]);

  async function refresh() {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setItems(await listComplianceItems(token));
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
      code: form.code,
      label: form.label,
      required: form.required,
      sortOrder: Number(form.sortOrder)
    };

    try {
      if (selectedId) {
        await updateComplianceItem(token, selectedId, payload);
      } else {
        await createComplianceItem(token, payload);
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
      await deleteComplianceItem(token, id);
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
        title="Checklist tuân thủ theo kênh"
        description="Mỗi mục có mã (code) cố định; khi tạo job xuất bản, người vận hành phải tick đủ các mục bắt buộc."
      />
      {error ? <div className="error-banner">{error}</div> : null}
      <section className="grid two-columns">
        <form className="panel stack" onSubmit={handleSubmit}>
          <h2>{selectedId ? "Cập nhật mục" : "Thêm mục"}</h2>
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
            <span>Mã (code)</span>
            <input
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
              placeholder="ad_disclosure_in_caption"
            />
          </label>
          <label className="field">
            <span>Nhãn hiển thị</span>
            <textarea
              value={form.label}
              onChange={(event) => setForm({ ...form, label: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Bắt buộc khi xuất bản</span>
            <input
              type="checkbox"
              checked={form.required}
              onChange={(event) =>
                setForm({ ...form, required: event.target.checked })
              }
            />
          </label>
          <label className="field">
            <span>Thứ tự</span>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(event) =>
                setForm({ ...form, sortOrder: event.target.value })
              }
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
            <h2>Danh sách mục</h2>
            <button className="secondary-button" onClick={() => void refresh()} type="button">
              Tải lại
            </button>
          </div>
          {loading ? <div>Đang tải…</div> : null}
          <table className="table">
            <thead>
              <tr>
                <th>Kênh</th>
                <th>Mã</th>
                <th>Nhãn</th>
                <th>Bắt buộc</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.channel}</td>
                  <td>
                    <code>{item.code}</code>
                  </td>
                  <td>{item.label}</td>
                  <td>{item.required ? "Có" : "Không"}</td>
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
