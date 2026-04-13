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

type RenderProvider = NonNullable<VideoTemplateRecord["renderProvider"]>;

const defaultVeoRenderConfig = {
  promptTemplate: `{{projectTitle}}. Affiliate product showcase for "{{productTitle}}".
Product details: {{productDescription}}

Brand voice: {{brandName}}. Typography should feel like font family "{{fontFamily}}" with accent color {{primaryColor}}.
Cinematic product video, stable camera, soft studio lighting, clean background, professional motion, no custom watermark.`,
  referenceImages: {
    enabled: true,
    max: 3,
    includeBrandLogo: true,
    brandLogoFirst: true,
    productImageOrder: "oldest" as const
  },
  veo: {
    personGeneration: "allow_adult",
    resolution: "720p"
  }
};

const defaultVeoRenderConfigText = JSON.stringify(defaultVeoRenderConfig, null, 2);

type TemplateFormState = {
  name: string;
  channel: string;
  renderProvider: RenderProvider;
  aspectRatio: string;
  durationSeconds: string;
  renderConfigJson: string;
};

const emptyForm: TemplateFormState = {
  name: "",
  channel: "tiktok",
  renderProvider: "ffmpeg",
  aspectRatio: "9:16",
  durationSeconds: "30",
  renderConfigJson: "{}"
};

export function VideoTemplatesManager() {
  const { token } = useAuth();
  const [items, setItems] = useState<VideoTemplateRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateFormState>(emptyForm);
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

    const rp = selectedItem.renderProvider ?? "ffmpeg";
    const stored = selectedItem.renderConfigJson;
    const hasConfig = stored && Object.keys(stored).length > 0;
    const configObj =
      rp === "veo3" && !hasConfig ? defaultVeoRenderConfig : (stored ?? {});

    setForm({
      name: selectedItem.name,
      channel: selectedItem.channel,
      renderProvider: rp,
      aspectRatio: selectedItem.aspectRatio,
      durationSeconds: String(selectedItem.durationSeconds),
      renderConfigJson: JSON.stringify(configObj, null, 2)
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

    let renderConfigJson: Record<string, unknown> = {};
    if (form.renderProvider === "veo3") {
      try {
        const parsed: unknown = JSON.parse(form.renderConfigJson || "{}");
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          setError("Cấu hình render (JSON) phải là một object.");
          setSaving(false);
          return;
        }
        renderConfigJson = parsed as Record<string, unknown>;
      } catch {
        setError("Cấu hình render (JSON) không hợp lệ.");
        setSaving(false);
        return;
      }
    }

    const payload = {
      name: form.name,
      channel: form.channel,
      renderProvider: form.renderProvider,
      aspectRatio: form.aspectRatio,
      durationSeconds: Number(form.durationSeconds),
      renderConfigJson: form.renderProvider === "veo3" ? renderConfigJson : {}
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
            <span>Render provider</span>
            <select
              value={form.renderProvider}
              onChange={(event) => {
                const next = event.target.value as RenderProvider;
                setForm((prev) => ({
                  ...prev,
                  renderProvider: next,
                  renderConfigJson:
                    next === "veo3" && (prev.renderConfigJson.trim() === "" || prev.renderConfigJson.trim() === "{}")
                      ? defaultVeoRenderConfigText
                      : next === "ffmpeg"
                        ? "{}"
                        : prev.renderConfigJson
                }));
              }}
            >
              <option value="ffmpeg">FFmpeg (slideshow)</option>
              <option value="veo3">Veo3 (AI)</option>
            </select>
          </label>
          {form.renderProvider === "veo3" ? (
            <label className="field">
              <span>render_config_json (Veo 3.1)</span>
              <textarea
                className="mono-textarea"
                rows={16}
                spellCheck={false}
                value={form.renderConfigJson}
                onChange={(event) => setForm({ ...form, renderConfigJson: event.target.value })}
              />
              <span className="muted small-hint">
                Placeholder prompt:{" "}
                <code>
                  {`{{projectTitle}} {{productTitle}} {{productDescription}} {{productSku}} {{brandName}} {{primaryColor}} {{fontFamily}}`}
                </code>
                . Reference images: tối đa 3 (ảnh sản phẩm + logo brand kit). Đặt{" "}
                <code>referenceImages.require: true</code> nếu bắt buộc phải có ảnh.
              </span>
            </label>
          ) : null}
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
