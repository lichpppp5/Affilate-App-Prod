"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import type { TenantRecord } from "../lib/api";
import { createTenant, deleteTenant, listTenants, updateTenant } from "../lib/api";
import { useAuth } from "./auth-provider";
import { PageHeader } from "./page-header";

const emptyCreate = {
  id: "",
  name: "",
  timezone: "Asia/Ho_Chi_Minh",
  adminEmail: "",
  adminDisplayName: "",
  adminPassword: ""
};

export function TenantsManager() {
  const { token, session } = useAuth();
  const [items, setItems] = useState<TenantRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: "", timezone: "" });
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdInfo, setCreatedInfo] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      void refresh();
    }
  }, [token]);

  const selected = useMemo(
    () => items.find((t) => t.id === selectedId) ?? null,
    [items, selectedId]
  );

  useEffect(() => {
    if (!selected) {
      setEdit({ name: "", timezone: "" });
      return;
    }
    setEdit({ name: selected.name, timezone: selected.timezone });
  }, [selected]);

  async function refresh() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await listTenants(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tải dữ liệu thất bại");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    setSaving(true);
    setError(null);
    setCreatedInfo(null);

    try {
      const result = await createTenant(token, createForm);
      setCreatedInfo(
        `Tenant "${result.tenant.id}" đã tạo. Admin: ${result.admin.email} (role ${result.admin.roleName}).`
      );
      setCreateForm(emptyCreate);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tạo tenant thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedId) return;

    setSaving(true);
    setError(null);

    try {
      await updateTenant(token, selectedId, { name: edit.name, timezone: edit.timezone });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cập nhật tenant thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!token) return;

    setSaving(true);
    setError(null);

    try {
      await deleteTenant(token, id);
      if (selectedId === id) setSelectedId(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xóa tenant thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Tenants"
        description="Tạo và quản lý tenant. Khi tạo tenant mới, hệ thống sẽ tạo luôn 1 admin membership để đăng nhập."
      />
      {error ? <div className="error-banner">{error}</div> : null}
      {createdInfo ? <div className="panel">{createdInfo}</div> : null}

      <section className="grid two-columns wide-layout">
        <form className="panel stack" onSubmit={handleCreate}>
          <h2>Tạo tenant</h2>
          <label className="field">
            <span>Tenant ID</span>
            <input
              value={createForm.id}
              onChange={(e) => setCreateForm({ ...createForm, id: e.target.value })}
              placeholder="shopee1"
            />
          </label>
          <label className="field">
            <span>Tên tenant</span>
            <input
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Timezone</span>
            <input
              value={createForm.timezone}
              onChange={(e) => setCreateForm({ ...createForm, timezone: e.target.value })}
            />
          </label>
          <div className="section-header compact-header">
            <strong>Admin cho tenant mới</strong>
            <span className="muted">Sẽ được gán role org_admin</span>
          </div>
          <label className="field">
            <span>Email admin</span>
            <input
              value={createForm.adminEmail}
              onChange={(e) => setCreateForm({ ...createForm, adminEmail: e.target.value })}
              placeholder="admin@company.local"
            />
          </label>
          <label className="field">
            <span>Tên hiển thị admin</span>
            <input
              value={createForm.adminDisplayName}
              onChange={(e) =>
                setCreateForm({ ...createForm, adminDisplayName: e.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Mật khẩu admin</span>
            <input
              type="password"
              value={createForm.adminPassword}
              onChange={(e) =>
                setCreateForm({ ...createForm, adminPassword: e.target.value })
              }
            />
          </label>
          <div className="actions">
            <button className="primary-button" disabled={saving} type="submit">
              {saving ? "Đang tạo…" : "Tạo tenant"}
            </button>
          </div>
          <div className="muted">
            Tenant hiện tại của bạn: <code>{session?.tenantId}</code>
          </div>
        </form>

        <div className="panel">
          <div className="section-header">
            <h2>Danh sách tenant</h2>
            <button className="secondary-button" onClick={() => void refresh()} type="button">
              Tải lại
            </button>
          </div>
          {loading ? <div>Đang tải…</div> : null}
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Tên</th>
                <th>Timezone</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td>
                    <code>{t.id}</code>
                  </td>
                  <td>{t.name}</td>
                  <td>{t.timezone}</td>
                  <td className="actions-cell">
                    <button
                      className="secondary-button small-button"
                      onClick={() => setSelectedId(t.id)}
                      type="button"
                    >
                      Sửa
                    </button>
                    <button
                      className="danger-button small-button"
                      onClick={() => void handleDelete(t.id)}
                      type="button"
                      disabled={t.id === session?.tenantId}
                      title={t.id === session?.tenantId ? "Không thể xóa tenant hiện tại" : undefined}
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {selected ? (
            <form className="panel stack" style={{ marginTop: 16 }} onSubmit={handleUpdate}>
              <h2>Cập nhật tenant</h2>
              <div className="muted">
                ID: <code>{selected.id}</code>
              </div>
              <label className="field">
                <span>Tên</span>
                <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </label>
              <label className="field">
                <span>Timezone</span>
                <input
                  value={edit.timezone}
                  onChange={(e) => setEdit({ ...edit, timezone: e.target.value })}
                />
              </label>
              <div className="actions">
                <button className="primary-button" disabled={saving} type="submit">
                  {saving ? "Đang lưu…" : "Lưu"}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setSelectedId(null)}
                >
                  Bỏ chọn
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </section>
    </>
  );
}

