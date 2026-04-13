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
- Cài Node.js 20 (qua nvm) cho user hiện tại
- Clone repo vào `/opt/appaffilate`
- Tạo `.env` từ `.env.example` và điền URL theo LAN IP
- Chạy `npm install`, `npm run infra:up`, `npm run db:reset-demo`
- Tạo service `systemd` để **auto-start** (`appaffilate.service`)

Sau khi xong:
- Web: `http://<LAN-IP>:3000`
- API: `http://<LAN-IP>:4000`

Tài khoản demo seed sẵn:
- Email: `admin@appaffilate.local`
- Password: `admin123`
- TenantId: `tenant_demo`

## 2) Vận hành auto-start (systemd)

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
sudo ufw allow 3000/tcp
sudo ufw allow 4000/tcp
```

Không cần mở `5432/6379/9000/9001` ra LAN nếu bạn chỉ dùng qua app.

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

