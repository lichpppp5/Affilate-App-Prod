"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import type { ProductRecord } from "../lib/api";
import {
  createProduct,
  deleteProduct,
  listProducts,
  updateProduct
} from "../lib/api";
import { useAuth } from "./auth-provider";
import { PageHeader } from "./page-header";

const emptyForm = {
  sku: "",
  title: "",
  description: "",
  price: "0",
  channels: "shopee,tiktok,facebook",
  affiliateSourceUrl: "",
  affiliateProgram: ""
};

export function ProductsManager() {
  const { token } = useAuth();
  const [items, setItems] = useState<ProductRecord[]>([]);
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
      sku: selectedItem.sku,
      title: selectedItem.title,
      description: selectedItem.description,
      price: String(selectedItem.price),
      channels: selectedItem.channels.join(","),
      affiliateSourceUrl: selectedItem.affiliateSourceUrl ?? "",
      affiliateProgram: selectedItem.affiliateProgram ?? ""
    });
  }, [selectedItem]);

  async function refresh() {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setItems(await listProducts(token));
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
      sku: form.sku,
      title: form.title,
      description: form.description,
      price: Number(form.price),
      channels: form.channels
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      affiliateSourceUrl: form.affiliateSourceUrl.trim(),
      affiliateProgram: form.affiliateProgram.trim()
    };

    try {
      if (selectedId) {
        await updateProduct(token, selectedId, payload);
      } else {
        await createProduct(token, payload);
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
      await deleteProduct(token, id);
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
        title="Sản phẩm"
        description="Quản lý SKU, giá, kênh bán và liên kết affiliate từ chương trình nhà bán để dùng khi xuất bản lên TikTok/Facebook."
      />
      {error ? <div className="error-banner">{error}</div> : null}
      <section className="grid two-columns">
        <form className="panel stack" onSubmit={handleSubmit}>
          <h2>{selectedId ? "Cập nhật sản phẩm" : "Tạo sản phẩm"}</h2>
          <label className="field">
            <span>Mã SKU</span>
            <input
              value={form.sku}
              onChange={(event) => setForm({ ...form, sku: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Tên hiển thị</span>
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Mô tả</span>
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Giá</span>
            <input
              type="number"
              value={form.price}
              onChange={(event) => setForm({ ...form, price: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Kênh bán</span>
            <input
              value={form.channels}
              onChange={(event) =>
                setForm({ ...form, channels: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Liên kết affiliate (sản phẩm)</span>
            <input
              value={form.affiliateSourceUrl}
              onChange={(event) =>
                setForm({ ...form, affiliateSourceUrl: event.target.value })
              }
              placeholder="https://..."
            />
          </label>
          <label className="field">
            <span>Chương trình affiliate</span>
            <input
              value={form.affiliateProgram}
              onChange={(event) =>
                setForm({ ...form, affiliateProgram: event.target.value })
              }
              placeholder="Ví dụ: Shopee Affiliate, TikTok Shop…"
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
            <h2>Danh sách sản phẩm</h2>
            <button className="secondary-button" onClick={() => void refresh()} type="button">
              Tải lại
            </button>
          </div>
          {loading ? <div>Đang tải sản phẩm…</div> : null}
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Tên</th>
                <th>Giá</th>
                <th>Kênh</th>
                <th>Affiliate</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.sku}</td>
                  <td>{item.title}</td>
                  <td>{item.price}</td>
                  <td>{item.channels.join(", ")}</td>
                  <td className="muted" style={{ maxWidth: "12rem", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.affiliateProgram || "—"}
                    {item.affiliateSourceUrl ? (
                      <div title={item.affiliateSourceUrl}>có liên kết</div>
                    ) : null}
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
