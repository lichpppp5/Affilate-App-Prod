"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import type { AssetRecord, ProductRecord } from "../lib/api";
import {
  completePresignedAssetUpload,
  createPresignedAssetUpload,
  deleteAsset,
  getAssetContentUrl,
  listAssets,
  listProducts,
  getStorageConfig as loadStorageConfig,
  type StorageConfig,
  uploadAsset,
  updateAsset
} from "../lib/api";
import { viAssetKind } from "../lib/ui-vi";
import { useAuth } from "./auth-provider";
import { PageHeader } from "./page-header";

const emptyForm = {
  title: "",
  productId: "",
  kind: "image" as AssetRecord["kind"]
};

export function AssetsManager() {
  const { token } = useAuth();
  const [items, setItems] = useState<AssetRecord[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [storageConfig, setStorageConfig] = useState<StorageConfig | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
      title: selectedItem.title,
      productId: selectedItem.productId ?? "",
      kind: selectedItem.kind
    });
  }, [selectedItem]);

  async function refresh() {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [nextAssets, nextProducts, nextStorageConfig] = await Promise.all([
        listAssets(token),
        listProducts(token),
        loadStorageConfig(token)
      ]);
      setItems(nextAssets);
      setProducts(nextProducts);
      setStorageConfig(nextStorageConfig);
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
        await updateAsset(token, selectedId, {
          title: form.title,
          productId: form.productId || undefined
        });
      } else {
        if (!selectedFile) {
          throw new Error("Hãy chọn tệp trước khi tải lên");
        }

        if (storageConfig?.directUploadEnabled) {
          await uploadWithPresign(selectedFile);
        } else {
          await uploadAsset(token, {
            file: selectedFile,
            title: form.title,
            productId: form.productId || undefined,
            kind: form.kind
          });
        }
      }

      setSelectedId(null);
      setForm(emptyForm);
      setSelectedFile(null);
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
      await deleteAsset(token, id);
      if (selectedId === id) {
        setSelectedId(null);
        setForm(emptyForm);
        setSelectedFile(null);
      }
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Xóa thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function uploadWithPresign(file: File) {
    if (!token) {
      return;
    }

    const signed = await createPresignedAssetUpload(token, {
      fileName: file.name,
      mimeType: file.type || "application/octet-stream"
    });

    const uploadResponse = await fetch(signed.uploadUrl, {
      method: signed.method,
      headers: {
        "content-type": file.type || "application/octet-stream"
      },
      body: file
    });

    if (!uploadResponse.ok) {
      throw new Error("Tải lên kho đối tượng thất bại");
    }

    await completePresignedAssetUpload(token, {
      assetId: signed.assetId,
      productId: form.productId || undefined,
      kind: form.kind,
      storageKey: signed.storageKey,
      mimeType: file.type || "application/octet-stream",
      checksum: await sha256(file),
      title: form.title,
      originalFilename: file.name,
      sizeBytes: file.size
    });
  }

  return (
    <>
      <PageHeader
        title="Thư viện tài nguyên"
        description="Tải tệp lên kho lưu trữ, xem trước và gắn sản phẩm cho quy trình render / xuất bản."
      />
      {error ? <div className="error-banner">{error}</div> : null}
      <section className="grid two-columns">
        <form className="panel stack" onSubmit={handleSubmit}>
          <h2>{selectedId ? "Cập nhật tài nguyên" : "Tải lên tài nguyên"}</h2>
          <label className="field">
            <span>Tên hiển thị</span>
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
              <option value="">Không gắn sản phẩm</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.sku} - {product.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Loại</span>
            <select
              value={form.kind}
              onChange={(event) =>
                setForm({
                  ...form,
                  kind: event.target.value as AssetRecord["kind"]
                })
              }
            >
              <option value="image">Ảnh</option>
              <option value="audio">Âm thanh</option>
              <option value="video">Video</option>
            </select>
          </label>
          {!selectedId ? (
            <label className="field">
              <span>Tệp</span>
              <input
                type="file"
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              />
            </label>
          ) : null}
          {!selectedId ? (
            <div className="muted">
              Chế độ tải lên:{" "}
              {storageConfig?.directUploadEnabled ? "Trực tiếp S3" : "Qua API"}
            </div>
          ) : null}
          {selectedItem ? (
            <div className="stack">
              <div className="muted">Kho: {selectedItem.storageProvider}</div>
              <div className="muted">Khóa: {selectedItem.storageKey}</div>
              <div className="muted">
                Tệp: {selectedItem.originalFilename || "—"} ({selectedItem.sizeBytes} byte)
              </div>
              <div className="muted">Checksum: {selectedItem.checksum}</div>
            </div>
          ) : null}
          <div className="actions">
            <button className="primary-button" disabled={saving} type="submit">
              {saving ? "Đang lưu…" : selectedId ? "Cập nhật" : "Tải lên"}
            </button>
            {selectedId ? (
              <button
                className="secondary-button"
                onClick={() => {
                  setSelectedId(null);
                  setForm(emptyForm);
                  setSelectedFile(null);
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
            <h2>Danh sách tài nguyên</h2>
            <button className="secondary-button" onClick={() => void refresh()} type="button">
              Tải lại
            </button>
          </div>
          {loading ? <div>Đang tải tài nguyên…</div> : null}
          <table className="table">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Loại</th>
                <th>Sản phẩm</th>
                <th>Lưu trữ</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.title}</td>
                  <td>{viAssetKind(item.kind)}</td>
                  <td>{products.find((product) => product.id === item.productId)?.sku ?? "-"}</td>
                  <td>
                    <div>{item.storageProvider}</div>
                    <div className="muted">{item.originalFilename || item.storageKey}</div>
                  </td>
                  <td className="actions-cell">
                    {token ? (
                      <a
                        className="primary-button small-button"
                        href={getAssetContentUrl(item.id, token)}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Mở
                      </a>
                    ) : null}
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

async function sha256(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
