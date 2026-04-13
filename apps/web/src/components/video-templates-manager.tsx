"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import type { VideoTemplateRecord } from "../lib/api";
import {
  createVideoTemplate,
  deleteVideoTemplate,
  listVideoTemplates,
  updateVideoTemplate
} from "../lib/api";
import { useAuth } from "./auth-provider";
import { PageHeader } from "./page-header";

const emptyForm = {
  name: "",
  channel: "tiktok",
  aspectRatio: "9:16",
  durationSeconds: "30"
};

export function VideoTemplatesManager() {
  const { token } = useAuth();
  const [items, setItems] = useState<VideoTemplateRecord[]>([]);
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
      name: selectedItem.name,
      channel: selectedItem.channel,
      aspectRatio: selectedItem.aspectRatio,
      durationSeconds: String(selectedItem.durationSeconds)
    });
  }, [selectedItem]);

  async function refresh() {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setItems(await listVideoTemplates(token));
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
      name: form.name,
      channel: form.channel,
      aspectRatio: form.aspectRatio,
      durationSeconds: Number(form.durationSeconds)
    };

    try {
      if (selectedId) {
        await updateVideoTemplate(token, selectedId, payload);
      } else {
        await createVideoTemplate(token, payload);
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
      await deleteVideoTemplate(token, id);
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
        title="Mẫu video"
        description="Định nghĩa mẫu theo kênh (tỉ lệ khung hình, độ dài) để gắn vào dự án video."
      />
      {error ? <div className="error-banner">{error}</div> : null}
      <section className="grid two-columns">
        <form className="panel stack" onSubmit={handleSubmit}>
          <h2>{selectedId ? "Cập nhật mẫu" : "Tạo mẫu"}</h2>
          <label className="field">
            <span>Tên</span>
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
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
            <span>Tỉ lệ khung hình</span>
            <input
              value={form.aspectRatio}
              onChange={(event) =>
                setForm({ ...form, aspectRatio: event.target.value })
              }
              placeholder="9:16"
            />
          </label>
          <label className="field">
            <span>Độ dài (giây)</span>
            <input
              type="number"
              min={1}
              value={form.durationSeconds}
              onChange={(event) =>
                setForm({ ...form, durationSeconds: event.target.value })
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
            <h2>Danh sách mẫu</h2>
            <button className="secondary-button" onClick={() => void refresh()} type="button">
              Tải lại
            </button>
          </div>
          {loading ? <div>Đang tải…</div> : null}
          <table className="table">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Kênh</th>
                <th>Tỉ lệ</th>
                <th>Giây</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.channel}</td>
                  <td>{item.aspectRatio}</td>
                  <td>{item.durationSeconds}</td>
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
