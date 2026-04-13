"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import type { ChannelCapabilityRecord } from "../lib/api";
import { listChannelCapabilities, upsertChannelCapability } from "../lib/api";
import { useAuth } from "./auth-provider";
import { PageHeader } from "./page-header";

const channelLabel: Record<string, string> = {
  facebook: "Facebook (ưu tiên)",
  tiktok: "TikTok",
  shopee: "Shopee"
};

export function ChannelCapabilitiesManager() {
  const { token } = useAuth();
  const [rows, setRows] = useState<ChannelCapabilityRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { caps: string; tracking: string }>>({});
  const [loading, setLoading] = useState(true);
  const [savingChannel, setSavingChannel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      void refresh();
    }
  }, [token]);

  const orderedRows = useMemo(() => {
    const order = ["facebook", "tiktok", "shopee"];
    return [...rows].sort(
      (a, b) => order.indexOf(a.channel) - order.indexOf(b.channel)
    );
  }, [rows]);

  useEffect(() => {
    const next: Record<string, { caps: string; tracking: string }> = {};
    for (const row of rows) {
      next[row.channel] = {
        caps: JSON.stringify(row.capabilitiesJson ?? {}, null, 2),
        tracking: JSON.stringify(row.defaultTrackingParams ?? {}, null, 2)
      };
    }
    setDrafts(next);
  }, [rows]);

  async function refresh() {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setRows(await listChannelCapabilities(token));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Tải dữ liệu thất bại");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>, channel: string) {
    event.preventDefault();

    if (!token) {
      return;
    }

    const draft = drafts[channel];
    if (!draft) {
      return;
    }

    setSavingChannel(channel);
    setError(null);

    let capabilitiesJson: Record<string, unknown>;
    let defaultTrackingParamsJson: Record<string, unknown>;

    try {
      capabilitiesJson = JSON.parse(draft.caps || "{}") as Record<string, unknown>;
    } catch {
      setError(`JSON năng lực (${channel}) không hợp lệ`);
      setSavingChannel(null);
      return;
    }

    try {
      defaultTrackingParamsJson = JSON.parse(draft.tracking || "{}") as Record<
        string,
        unknown
      >;
    } catch {
      setError(`JSON tracking mặc định (${channel}) không hợp lệ`);
      setSavingChannel(null);
      return;
    }

    try {
      await upsertChannelCapability(token, channel, {
        capabilitiesJson,
        defaultTrackingParamsJson
      });
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Lưu thất bại");
    } finally {
      setSavingChannel(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Năng lực kênh & tracking mặc định"
        description="Cấu hình theo từng kênh: bắt buộc affiliate/disclosure, giới hạn caption, mapping sản phẩm; tham số UTM mặc định gộp vào link khi worker xuất bản (Facebook trước, TikTok sau)."
      />
      {error ? <div className="error-banner">{error}</div> : null}
      {loading ? <div>Đang tải…</div> : null}
      <div className="stack" style={{ marginTop: 16 }}>
        {orderedRows.map((row) => (
          <form
            key={row.channel}
            className="panel stack"
            onSubmit={(e) => void handleSave(e, row.channel)}
          >
            <div className="section-header">
              <h2>{channelLabel[row.channel] ?? row.channel}</h2>
              <span className="muted">
                {row.configured ? "Đã cấu hình DB" : "Đang dùng mặc định hệ thống"}
              </span>
            </div>
            <div className="muted">
              Hiệu lực: affiliate bắt buộc = {row.effective.affiliateLinkRequired ? "có" : "không"}
              ; disclosure bắt buộc = {row.effective.disclosureRequired ? "có" : "không"}
              ; max caption ={" "}
              {row.effective.maxCaptionLength == null ? "—" : row.effective.maxCaptionLength}
              ; bắt buộc mapping = {row.effective.requireProductMapping ? "có" : "không"}
            </div>
            <label className="field">
              <span>capabilitiesJson (ghi đè mặc định)</span>
              <textarea
                rows={8}
                value={drafts[row.channel]?.caps ?? "{}"}
                onChange={(event) =>
                  setDrafts((d) => ({
                    ...d,
                    [row.channel]: {
                      caps: event.target.value,
                      tracking: d[row.channel]?.tracking ?? "{}"
                    }
                  }))
                }
              />
            </label>
            <label className="field">
              <span>defaultTrackingParams (UTM / query gộp vào affiliate link)</span>
              <textarea
                rows={5}
                value={drafts[row.channel]?.tracking ?? "{}"}
                onChange={(event) =>
                  setDrafts((d) => ({
                    ...d,
                    [row.channel]: {
                      caps: d[row.channel]?.caps ?? "{}",
                      tracking: event.target.value
                    }
                  }))
                }
              />
            </label>
            <div className="actions">
              <button
                className="primary-button"
                disabled={savingChannel === row.channel}
                type="submit"
              >
                {savingChannel === row.channel ? "Đang lưu…" : "Lưu kênh này"}
              </button>
            </div>
          </form>
        ))}
      </div>
      <div className="actions" style={{ marginTop: 16 }}>
        <button className="secondary-button" onClick={() => void refresh()} type="button">
          Tải lại
        </button>
      </div>
    </>
  );
}
