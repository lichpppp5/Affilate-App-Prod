"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import type { ProductChannelMappingRecord, ProductRecord } from "../lib/api";
import {
  createProductChannelMapping,
  deleteProductChannelMapping,
  listProductChannelMappings,
  listProducts,
  updateProductChannelMapping
} from "../lib/api";
import { useAuth } from "./auth-provider";
import { PageHeader } from "./page-header";

const emptyForm = {
  productId: "",
  channel: "facebook",
  externalProductId: "",
  metadataJson: "{}"
};

export function ProductMappingsManager() {
  const { token } = useAuth();
  const [items, setItems] = useState<ProductChannelMappingRecord[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
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
      productId: selectedItem.productId,
      channel: selectedItem.channel,
      externalProductId: selectedItem.externalProductId,
      metadataJson: JSON.stringify(selectedItem.metadataJson ?? {}, null, 2)
    });
  }, [selectedItem]);

  async function refresh() {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [nextMappings, nextProducts] = await Promise.all([
        listProductChannelMappings(token),
        listProducts(token)
      ]);
      setItems(nextMappings);
      setProducts(nextProducts);
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

    let metadataJson: Record<string, unknown>;
    try {
      metadataJson = JSON.parse(form.metadataJson || "{}") as Record<string, unknown>;
    } catch {
      setError("metadataJson không hợp lệ");
      setSaving(false);
      return;
    }

    const payload = {
      productId: form.productId,
      channel: form.channel as ProductChannelMappingRecord["channel"],
      externalProductId: form.externalProductId.trim(),
      metadataJson
    };

    try {
      if (selectedId) {
        await updateProductChannelMapping(token, selectedId, payload);
      } else {
        await createProductChannelMapping(token, payload);
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
      await deleteProductChannelMapping(token, id);
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
        title="Mapping sản phẩm theo kênh"
        description="ID sản phẩm trên Facebook Catalog / TikTok Shop để BFF hoặc worker gửi kèm khi publish. Ưu tiên cấu hình Facebook, sau đó TikTok."
      />
      {error ? <div className="error-banner">{error}</div> : null}
      <section className="grid two-columns">
        <form className="panel stack" onSubmit={(e) => void handleSubmit(e)}>
          <h2>{selectedId ? "Cập nhật mapping" : "Thêm mapping"}</h2>
          <label className="field">
            <span>Sản phẩm</span>
            <select
              value={form.productId}
              onChange={(event) => setForm({ ...form, productId: event.target.value })}
            >
              <option value="">Chọn sản phẩm</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.title}
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
              <option value="facebook">Facebook</option>
              <option value="tiktok">TikTok</option>
              <option value="shopee">Shopee</option>
            </select>
          </label>
          <label className="field">
            <span>External product ID</span>
            <input
              value={form.externalProductId}
              onChange={(event) =>
                setForm({ ...form, externalProductId: event.target.value })
              }
              placeholder="fb_catalog_… / tt_product_…"
            />
          </label>
          <label className="field">
            <span>metadataJson</span>
            <textarea
              rows={4}
              value={form.metadataJson}
              onChange={(event) =>
                setForm({ ...form, metadataJson: event.target.value })
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
            <h2>Danh sách</h2>
            <button className="secondary-button" onClick={() => void refresh()} type="button">
              Tải lại
            </button>
          </div>
          {loading ? <div>Đang tải…</div> : null}
          <table className="table">
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th>Kênh</th>
                <th>External ID</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {products.find((p) => p.id === item.productId)?.sku ?? item.productId}
                  </td>
                  <td>{item.channel}</td>
                  <td>
                    <code>{item.externalProductId || "—"}</code>
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
