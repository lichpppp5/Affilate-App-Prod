"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import type { UserRecord } from "../lib/api";
import { createUser, deleteUser, listUsers, resetUserPassword, updateUser } from "../lib/api";
import { useAuth } from "./auth-provider";
import { PageHeader } from "./page-header";

const emptyForm = {
  email: "",
  displayName: "",
  roleName: "operator",
  password: ""
};

const roleLabels: Record<string, string> = {
  org_admin: "Admin (full quyền)",
  content_manager: "Content Manager",
  reviewer: "Reviewer",
  operator: "Operator",
  analyst: "Analyst"
};

export function UsersManager() {
  const { token, session } = useAuth();
  const [items, setItems] = useState<UserRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

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
      email: selectedItem.email,
      displayName: selectedItem.displayName,
      roleName: selectedItem.roleName,
      password: ""
    });
  }, [selectedItem]);

  async function refresh() {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);
    setSecret(null);

    try {
      setItems(await listUsers(token));
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
    setSecret(null);

    try {
      if (selectedId) {
        await updateUser(token, selectedId, {
          displayName: form.displayName,
          roleName: form.roleName
        });
      } else {
        const created = await createUser(token, {
          email: form.email,
          displayName: form.displayName,
          roleName: form.roleName,
          password: form.password.trim() || undefined
        });
        if (created.generatedPassword) {
          setSecret(created.generatedPassword);
        }
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
    setSecret(null);

    try {
      await deleteUser(token, id);
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

  async function handleResetPassword(id: string) {
    if (!token) {
      return;
    }

    setSaving(true);
    setError(null);
    setSecret(null);

    try {
      const result = await resetUserPassword(token, id);
      setSecret(result.password);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Reset mật khẩu thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Người dùng"
        description="Chỉ admin có quyền quản lý user trong tenant: tạo mới, đổi role, reset mật khẩu."
      />
      {error ? <div className="error-banner">{error}</div> : null}
      {secret ? (
        <div className="panel" style={{ marginBottom: 16 }}>
          <strong>Mật khẩu mới (hiển thị 1 lần):</strong>{" "}
          <code style={{ userSelect: "all" }}>{secret}</code>
          <div className="muted" style={{ marginTop: 6 }}>
            Hãy copy và gửi cho user qua kênh an toàn. Sau khi reload trang, bạn sẽ không thấy lại.
          </div>
        </div>
      ) : null}
      <section className="grid two-columns wide-layout">
        <form className="panel stack" onSubmit={handleSubmit}>
          <h2>{selectedId ? "Cập nhật user" : "Tạo user"}</h2>
          <label className="field">
            <span>Email</span>
            <input
              value={form.email}
              disabled={Boolean(selectedId)}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="user@company.local"
            />
          </label>
          <label className="field">
            <span>Tên hiển thị</span>
            <input
              value={form.displayName}
              onChange={(event) => setForm({ ...form, displayName: event.target.value })}
              placeholder="Nguyễn Văn A"
            />
          </label>
          <label className="field">
            <span>Vai trò</span>
            <select
              value={form.roleName}
              onChange={(event) => setForm({ ...form, roleName: event.target.value })}
            >
              {Object.keys(roleLabels).map((key) => (
                <option key={key} value={key}>
                  {roleLabels[key]}
                </option>
              ))}
            </select>
          </label>
          {!selectedId ? (
            <label className="field">
              <span>Mật khẩu (để trống = auto generate)</span>
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
            </label>
          ) : null}
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
          <div className="muted">
            Bạn đang đăng nhập: <code>{session?.email}</code>
          </div>
        </form>

        <div className="panel">
          <div className="section-header">
            <h2>Danh sách user</h2>
            <button className="secondary-button" onClick={() => void refresh()} type="button">
              Tải lại
            </button>
          </div>
          {loading ? <div>Đang tải…</div> : null}
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Tên</th>
                <th>Role</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{u.displayName}</td>
                  <td>{roleLabels[u.roleName] ?? u.roleName}</td>
                  <td className="actions-cell">
                    <button
                      className="secondary-button small-button"
                      onClick={() => setSelectedId(u.id)}
                      type="button"
                    >
                      Sửa
                    </button>
                    <button
                      className="secondary-button small-button"
                      onClick={() => void handleResetPassword(u.id)}
                      type="button"
                    >
                      Reset pass
                    </button>
                    <button
                      className="danger-button small-button"
                      onClick={() => void handleDelete(u.id)}
                      type="button"
                      disabled={u.id === session?.userId}
                      title={u.id === session?.userId ? "Không thể xóa chính mình" : undefined}
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

