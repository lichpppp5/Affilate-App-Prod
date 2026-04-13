# Setup on‑prem (LAN) trên Ubuntu Server 24.04

Tài liệu này hướng dẫn cài và chạy dự án **AppAffilate** trong mạng nội bộ (LAN), không cần domain/SSL.

Bạn sẽ có:
- **Web admin**: cổng `3000`
- **API**: cổng `4000`
- **Postgres + Redis + MinIO**: chạy bằng Docker Compose (`infra/docker-compose.yml`)
- **Auto-start** khi reboot: dùng `systemd`

## 0) Thông tin bạn cần chuẩn bị

- **LAN IP của Ubuntu server** (ví dụ `192.168.1.10`)
- Máy client (Windows) truy cập LAN tới server (mở firewall nếu có)

## 1) Cài đặt tự động (khuyến nghị)

Repo đã có script cài nhanh:

```bash
curl -fsSL https://raw.githubusercontent.com/lichpppp5/Affilate-App-Prod/main/scripts/install-ubuntu-24.04-onprem.sh -o install.sh
chmod +x install.sh
sudo ./install.sh
```

Script sẽ:
- Cài Docker Engine + docker compose plugin
- Cài Node.js 20 (qua nvm) cho user hiện tại — script **luôn `source ~/.nvm/nvm.sh`**, không dùng `source ~/.bashrc` (vì `.bashrc` thường thoát ngay với shell không tương tác, khiến `nvm` không tồn tại).
- Clone repo vào `/opt/appaffilate`
- Tạo `.env` từ `.env.example` và điền URL theo LAN IP
- Chạy `npm install`, `npm run infra:up`, `db:migrate`, `db:reset-demo`
- Tạo service `systemd` để **auto-start** (`appaffilate.service`)

### 1.1 Quan trọng: đừng chạy `npm` khi đang là **root**

Installer cài **Node 20 qua nvm** cho user Linux bạn dùng lúc gõ `sudo ./install.sh` (ví dụ `lichdt`). User **root** không có `npm` trong PATH → báo `Command 'npm' not found`.

**Cách đúng** — đăng nhập shell với user triển khai rồi load nvm:

```bash
sudo -i -u lichdt
cd /opt/appaffilate
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"
npm install
npm run infra:up
npm --workspace @appaffilate/api run db:migrate
npm run db:reset-demo
```

(Thay `lichdt` bằng đúng username trên server.)

**Hoặc** từ root, một lệnh (có sẵn trong repo):

```bash
chmod +x /opt/appaffilate/scripts/run-npm.sh
DEPLOY_USER=lichdt /opt/appaffilate/scripts/run-npm.sh install
DEPLOY_USER=lichdt /opt/appaffilate/scripts/run-npm.sh run infra:up
```

Sau khi xong:
- Web: `http://<LAN-IP>:3000`
- API: `http://<LAN-IP>:4000`

Tài khoản demo seed sẵn:
- Email: `admin@appaffilate.local`
- Password: `admin123`
- TenantId: `tenant_demo`

## 2) Vận hành auto-start (systemd)

### 2.0 `Connection refused` tới cổng 3000 / 4000 — chưa có service hoặc app chưa chạy

Nếu `systemctl status appaffilate` báo **Unit could not be found**, installer có thể chưa chạy xong bước 8. **Docker chỉ là DB/Redis/MinIO**; web + API phải do **`npm run dev:all`** (hoặc systemd) đưa lên.

**Chạy tạm để kiểm tra** (thay `lichdt` bằng user có nvm + quyền `/opt/appaffilate`):

```bash
sudo -i -u lichdt
cd /opt/appaffilate
git pull
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"
npm install
npm run dev:all
```

Giữ terminal này mở; từ máy khác (hoặc `curl` trên server) thử: `http://192.168.145.130:3000` (đổi đúng IP LAN của bạn).

**Tạo systemd** (auto-start, chạy nền) — chạy **một lần** dưới `root`, sửa `lichdt` nếu cần:

```bash
APP_USER=lichdt
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
sudo tee /etc/systemd/system/appaffilate.service >/dev/null <<EOF
[Unit]
Description=AppAffilate (on-prem)
After=network-online.target docker.service
Wants=network-online.target docker.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=/opt/appaffilate
EnvironmentFile=/opt/appaffilate/.env
ExecStart=/bin/bash -c 'set -euo pipefail; export NVM_DIR="${APP_HOME}/.nvm"; source "\$NVM_DIR/nvm.sh"; cd /opt/appaffilate; exec npm run dev:all'
Restart=always
RestartSec=3
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now appaffilate
sudo systemctl status appaffilate --no-pager
```

### 2.1 Trạng thái service

```bash
sudo systemctl status appaffilate --no-pager
```

### 2.2 Xem log realtime

```bash
sudo journalctl -u appaffilate -f
```

### 2.3 Restart / Stop

```bash
sudo systemctl restart appaffilate
sudo systemctl stop appaffilate
sudo systemctl start appaffilate
```

### 2.4 Disable auto-start

```bash
sudo systemctl disable --now appaffilate
```

## 3) Cấu hình `.env` cho LAN (điểm quan trọng nhất)

Trong `/opt/appaffilate/.env` cần đúng 3 biến sau (thay `<LAN-IP>`):

```env
API_BASE_URL=http://<LAN-IP>:4000
WEB_BASE_URL=http://<LAN-IP>:3000
NEXT_PUBLIC_API_BASE_URL=http://<LAN-IP>:4000
```

Giải thích nhanh:
- **`NEXT_PUBLIC_API_BASE_URL`** là URL mà **trình duyệt client** gọi được, nên phải là IP LAN của server (không phải `localhost`).

## 4) Mở firewall cho LAN (nếu bạn bật UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 3000/tcp
sudo ufw allow 4000/tcp
sudo ufw reload
```

(Nếu bật UFW mà **chưa** `allow OpenSSH`, lần reboot sau bạn có thể **mất SSH** — luôn mở SSH trước khi `ufw enable`.)

Không cần mở `5432/6379/9000/9001` ra LAN nếu bạn chỉ dùng qua app.

### 4.1 Lỗi `Connection terminated unexpectedly` khi `db:reset-demo`

PostgreSQL trong container thường cần vài giây sau `docker compose up` mới nhận kết nối. Repo đã có bước **`db:wait`** (retry tới ~120s) trước `db:migrate` và `db:reset-demo`. Nếu vẫn lỗi:

- Kiểm tra container: `docker compose -f infra/docker-compose.yml ps`
- Xem log Postgres: `docker compose -f infra/docker-compose.yml logs postgres --tail 80`
- Đảm bảo `.env` có `DATABASE_URL=postgres://appaffilate:appaffilate@localhost:5432/appaffilate` (đúng user/mật khẩu như `infra/docker-compose.yml`)

Trên DB mới, chạy lần lượt: `npm run infra:up` → `npm --workspace @appaffilate/api run db:migrate` → `npm run db:reset-demo`.

## 5) Cập nhật phiên bản (pull code)

```bash
cd /opt/appaffilate
sudo systemctl stop appaffilate
git pull
npm install
npm run infra:up
npm run db:migrate
sudo systemctl start appaffilate
```

## 6) Gỡ cài đặt (tuỳ chọn)

```bash
sudo systemctl disable --now appaffilate || true
sudo rm -f /etc/systemd/system/appaffilate.service
sudo systemctl daemon-reload
sudo rm -rf /opt/appaffilate
```

