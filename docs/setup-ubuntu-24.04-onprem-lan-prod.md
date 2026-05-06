# Setup LAN “production-like” trên Ubuntu Server 24.04 (không domain/SSL)

Tài liệu này hướng dẫn chạy **AppAffilate** trong **mạng LAN** theo kiểu “production-like”:
- **Web** chạy `next start` (không dùng Next dev)
- **API + Worker** chạy từ output `dist/` (không dùng `tsx watch`)
- Tách **3 service systemd** để auto-start, restart khi crash

> Gợi ý: Infra (Postgres/Redis/MinIO) vẫn chạy bằng Docker Compose như tài liệu on-prem cơ bản.

## Mục tiêu & ports

- **Web admin**: `http://<LAN-IP>:3000`
- **API**: `http://<LAN-IP>:4000`

## 0) Chuẩn bị

- Ubuntu Server 24.04
- 1 user deploy (ví dụ `app`)
- LAN IP cố định của server (ví dụ `192.168.1.10`)

## 1) Cài Docker + Node.js 20 (nvm) + clone repo

Bạn có thể dùng script cài nhanh (từ repo):

```bash
curl -fsSL https://raw.githubusercontent.com/lichpppp5/Affilate-App-Prod/main/scripts/install-ubuntu-24.04-onprem.sh -o install.sh
chmod +x install.sh
sudo ./install.sh
```

Script sẽ clone repo vào `/opt/appaffilate` và tạo `.env` từ `.env.example`.

### Quan trọng: không chạy `npm` bằng root

Node.js được cài qua `nvm` theo user deploy. Nếu bạn `sudo -i` vào root, `npm` sẽ không có trong PATH.

Vào đúng user deploy rồi load nvm:

```bash
sudo -i -u <DEPLOY_USER>
cd /opt/appaffilate
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"
node -v
npm -v
```

## 2) Cấu hình `.env` cho LAN (bắt buộc)

Mở `/opt/appaffilate/.env` và đảm bảo 3 biến sau đúng LAN IP:

```env
API_BASE_URL=http://<LAN-IP>:4000
WEB_BASE_URL=http://<LAN-IP>:3000
NEXT_PUBLIC_API_BASE_URL=http://<LAN-IP>:4000
```

> `NEXT_PUBLIC_API_BASE_URL` là URL trình duyệt gọi được, nên **phải** là IP LAN của server (không phải `localhost`).

## 3) Bật hạ tầng DB/Redis/MinIO

```bash
cd /opt/appaffilate
docker compose -f infra/docker-compose.yml up -d
```

## 4) Install deps + migrate DB + build

Chạy bằng user deploy:

```bash
sudo -i -u <DEPLOY_USER>
cd /opt/appaffilate
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"

npm install
npm --workspace @appaffilate/api run db:migrate
npm run build
```

Sau khi build, các entrypoint sẽ là:
- API: `dist/apps/api/src/server.js`
- Worker: `dist/apps/worker/src/index.js`
- Web: `apps/web` chạy `next start` (port 3000)

## 5) Tạo 3 systemd services (auto-start)

Chạy **một lần** dưới `root`. Thay `<DEPLOY_USER>` và chỉnh `<LAN-IP>` ở `.env` (bước 2).

### 5.1 API service

```bash
APP_USER="<DEPLOY_USER>"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"

sudo tee /etc/systemd/system/appaffilate-api.service >/dev/null <<EOF
[Unit]
Description=AppAffilate API (LAN)
After=network-online.target docker.service
Wants=network-online.target docker.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=/opt/appaffilate
EnvironmentFile=/opt/appaffilate/.env
ExecStart=/bin/bash -c 'set -euo pipefail; export NVM_DIR="${APP_HOME}/.nvm"; source "\$NVM_DIR/nvm.sh"; cd /opt/appaffilate; exec node dist/apps/api/src/server.js'
Restart=always
RestartSec=3
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF
```

### 5.2 Worker service

```bash
APP_USER="<DEPLOY_USER>"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"

sudo tee /etc/systemd/system/appaffilate-worker.service >/dev/null <<EOF
[Unit]
Description=AppAffilate Worker (LAN)
After=network-online.target docker.service appaffilate-api.service
Wants=network-online.target docker.service appaffilate-api.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=/opt/appaffilate
EnvironmentFile=/opt/appaffilate/.env
ExecStart=/bin/bash -c 'set -euo pipefail; export NVM_DIR="${APP_HOME}/.nvm"; source "\$NVM_DIR/nvm.sh"; cd /opt/appaffilate; exec node dist/apps/worker/src/index.js'
Restart=always
RestartSec=3
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF
```

### 5.3 Web service

```bash
APP_USER="<DEPLOY_USER>"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"

sudo tee /etc/systemd/system/appaffilate-web.service >/dev/null <<EOF
[Unit]
Description=AppAffilate Web (LAN)
After=network-online.target appaffilate-api.service
Wants=network-online.target appaffilate-api.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=/opt/appaffilate
EnvironmentFile=/opt/appaffilate/.env
ExecStart=/bin/bash -c 'set -euo pipefail; export NVM_DIR="${APP_HOME}/.nvm"; source "\$NVM_DIR/nvm.sh"; cd /opt/appaffilate; exec npm --workspace @appaffilate/web run start'
Restart=always
RestartSec=3
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF
```

### 5.4 Enable + start

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now appaffilate-api appaffilate-worker appaffilate-web
sudo systemctl status appaffilate-api --no-pager
sudo systemctl status appaffilate-worker --no-pager
sudo systemctl status appaffilate-web --no-pager
```

## 6) Mở firewall cho LAN (nếu dùng UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 3000/tcp
sudo ufw allow 4000/tcp
sudo ufw reload
```

## 7) Xem log & kiểm tra nhanh

Log realtime:

```bash
sudo journalctl -u appaffilate-api -f
sudo journalctl -u appaffilate-worker -f
sudo journalctl -u appaffilate-web -f
```

Kiểm tra:
- Web: `http://<LAN-IP>:3000`
- API: `http://<LAN-IP>:4000`

Tài khoản demo (nếu bạn đã chạy seed/reset demo):
- Email: `admin@appaffilate.local`
- Password: `admin123`
- TenantId: `tenant_demo`

## 8) Cập nhật phiên bản (pull code)

```bash
sudo systemctl stop appaffilate-web appaffilate-worker appaffilate-api

sudo -i -u <DEPLOY_USER>
cd /opt/appaffilate
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"

git pull
npm install
docker compose -f infra/docker-compose.yml up -d
npm --workspace @appaffilate/api run db:migrate
npm run build

exit
sudo systemctl start appaffilate-api appaffilate-worker appaffilate-web
```

## 9) Gỡ cài đặt (tuỳ chọn)

```bash
sudo systemctl disable --now appaffilate-web appaffilate-worker appaffilate-api || true
sudo rm -f /etc/systemd/system/appaffilate-web.service
sudo rm -f /etc/systemd/system/appaffilate-worker.service
sudo rm -f /etc/systemd/system/appaffilate-api.service
sudo systemctl daemon-reload
sudo rm -rf /opt/appaffilate
```

