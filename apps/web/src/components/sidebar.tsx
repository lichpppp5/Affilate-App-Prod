"use client";

import Link from "next/link";

import { sessionCan } from "../lib/api";
import { useAuth } from "./auth-provider";

const items: { href: string; label: string; permission: string }[] = [
  { href: "/", label: "Tổng quan", permission: "dashboard:read" },
  { href: "/products", label: "Sản phẩm", permission: "products:read" },
  { href: "/assets", label: "Tài nguyên", permission: "assets:read" },
  { href: "/channels", label: "Kênh bán", permission: "channels:read" },
  {
    href: "/channel-capabilities",
    label: "Năng lực kênh",
    permission: "channels:read"
  },
  { href: "/ai-providers", label: "AI Providers", permission: "channels:read" },
  { href: "/product-mappings", label: "Mapping sản phẩm", permission: "publish:read" },
  { href: "/users", label: "Người dùng", permission: "users:read" },
  { href: "/tenants", label: "Tenants", permission: "tenants:read" },
  { href: "/projects", label: "Dự án video", permission: "projects:read" },
  { href: "/video-templates", label: "Mẫu video", permission: "projects:read" },
  { href: "/brand-kits", label: "Bộ nhận diện", permission: "projects:read" },
  { href: "/compliance", label: "Tuân thủ kênh", permission: "projects:read" },
  { href: "/approvals", label: "Phê duyệt", permission: "approvals:read" },
  { href: "/publish", label: "Xuất bản", permission: "publish:read" },
  { href: "/reports", label: "Báo cáo", permission: "reports:read" },
  { href: "/notifications", label: "Thông báo", permission: "notifications:read" },
  { href: "/audit", label: "Nhật ký kiểm tra", permission: "audit:read" }
];

export function Sidebar() {
  const { logout, session } = useAuth();
  const visible = items.filter((item) => sessionCan(session, item.permission));

  return (
    <aside className="sidebar">
      <div>
        <strong>AppAffilate</strong>
        <div className="muted">Bảng điều khiển vận hành</div>
        <div className="sidebar-user">
          <div>{session?.displayName}</div>
          <div className="muted">{session?.tenantId}</div>
          <div className="muted">{session?.roleName}</div>
        </div>
      </div>
      <nav>
        {visible.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
      <button className="secondary-button sidebar-button" onClick={logout} type="button">
        Đăng xuất
      </button>
    </aside>
  );
}
