"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import type { BrandKitRecord } from "../lib/api";
import {
  createBrandKit,
  deleteBrandKit,
  listBrandKits,
  updateBrandKit
} from "../lib/api";
import { useAuth } from "./auth-provider";
import { PageHeader } from "./page-header";

const emptyForm = {
  name: "",
  primaryColor: "#1d4ed8",
  fontFamily: "Inter",
  logoAssetId: ""
};

export function BrandKitsManager() {
  const { token } = useAuth();
  const [items, setItems] = useState<BrandKitRecord[]>([]);
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
      primaryColor: selectedItem.primaryColor,
      fontFamily: selectedItem.fontFamily,
      logoAssetId: selectedItem.logoAssetId ?? ""
    });
  }, [selectedItem]);

  async function refresh() {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setItems(await listBrandKits(token));
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
      primaryColor: form.primaryColor,
      fontFamily: form.fontFamily,
      logoAssetId: form.logoAssetId.trim() || undefined
    };

    try {
      if (selectedId) {
        await updateBrandKit(token, selectedId, payload);
      } else {
        await createBrandKit(token, payload);
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
      await deleteBrandKit(token, id);
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
        title="Bộ nhận diện"
        description="Màu chủ đạo, font và logo (mã tài sản) dùng khi dựng video theo thương hiệu."
      />
      {error ? <div className="error-banner">{error}</div> : null}
      <section className="grid two-columns">
        <form className="panel stack" onSubmit={handleSubmit}>
          <h2>{selectedId ? "Cập nhật bộ nhận diện" : "Tạo bộ nhận diện"}</h2>
          <label className="field">
            <span>Tên</span>
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Màu chủ đạo</span>
            <input
              type="color"
              value={form.primaryColor}
              onChange={(event) =>
                setForm({ ...form, primaryColor: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Font</span>
            <input
              value={form.fontFamily}
              onChange={(event) =>
                setForm({ ...form, fontFamily: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Mã tài sản logo (tuỳ chọn)</span>
            <input
              value={form.logoAssetId}
              onChange={(event) =>
                setForm({ ...form, logoAssetId: event.target.value })
              }
              placeholder="asset_…"
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
            <h2>Danh sách</h2>
            <button className="secondary-button" onClick={() => void refresh()} type="button">
              Tải lại
            </button>
          </div>
          {loading ? <div>Đang tải…</div> : null}
          <table className="table">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Màu</th>
                <th>Font</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>
                    <span
                      style={{
                        display: "inline-block",
                        width: 20,
                        height: 20,
                        background: item.primaryColor,
                        verticalAlign: "middle",
                        marginRight: 8,
                        borderRadius: 4
                      }}
                    />
                    {item.primaryColor}
                  </td>
                  <td>{item.fontFamily}</td>
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
