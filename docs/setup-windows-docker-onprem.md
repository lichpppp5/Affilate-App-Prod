# Setup on‑prem trên Windows thường + Docker (WSL2) — kèm auto start

Tài liệu này hướng dẫn chạy AppAffilate trên **Windows 10/11** theo cách ổn định nhất:
- Windows chỉ làm “host”
- **WSL2 Ubuntu** chạy Node + repo
- **Docker Desktop** chạy Postgres/Redis/MinIO (Linux containers)

Bạn sẽ có:
- Web admin: `http://localhost:3000`
- API: `http://localhost:4000`

> Nếu bạn cần cho người khác trong LAN truy cập từ máy khác, khuyến nghị chạy chính trên **Ubuntu server** (xem `docs/setup-ubuntu-24.04-onprem.md`).

---

## 0) Yêu cầu

### Phần mềm
- Windows 10/11 (khuyến nghị 11)
- **Docker Desktop** (Linux containers)
- **WSL2** + Ubuntu
- Git (tuỳ chọn nếu clone từ Windows; nếu clone trong WSL thì không bắt buộc)

### Bật ảo hoá
- BIOS/UEFI: bật Virtualization (VT-x/AMD-V)

---

## 1) Cài đặt tự động (khuyến nghị)

Repo có script PowerShell:

1) Mở **PowerShell (Run as Administrator)** tại thư mục repo (hoặc tải script từ GitHub).
2) Chạy:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
.\scripts\install-windows-docker.ps1
```

Script sẽ:
- Bật WSL2 (nếu chưa có) và cài Ubuntu
- Kiểm tra Docker Desktop (nhắc bạn cài nếu thiếu)
- Chuẩn bị môi trường trong WSL (cài Node 20 qua nvm)
- Clone repo vào WSL (`~/appaffilate`)
- Tạo `.env` từ `.env.example` và set URL (mặc định `localhost`)
- Chạy `npm install`, `npm run infra:up`, `npm run db:reset-demo`
- Tạo **Scheduled Task** để auto-start (mỗi lần bạn đăng nhập Windows)

Sau khi xong:
- Web: `http://localhost:3000`
- API: `http://localhost:4000`

Tài khoản demo seed sẵn:
- Email: `admin@appaffilate.local`
- Password: `admin123`
- TenantId: `tenant_demo`

---

## 2) Auto start hoạt động như thế nào?

Script tạo Scheduled Task tên:
- `AppAffilate Auto Start`

Task sẽ chạy khi **logon** user Windows:
- gọi `wsl.exe` và chạy lệnh trong Ubuntu để start infra + start dev servers

### 2.1 Xem trạng thái task

PowerShell:

```powershell
Get-ScheduledTask -TaskName "AppAffilate Auto Start"
```

### 2.2 Tắt auto start

```powershell
Disable-ScheduledTask -TaskName "AppAffilate Auto Start"
```

### 2.3 Bật lại auto start

```powershell
Enable-ScheduledTask -TaskName "AppAffilate Auto Start"
Start-ScheduledTask -TaskName "AppAffilate Auto Start"
```

---

## 3) Chạy thủ công (nếu không dùng auto start)

Mở Ubuntu (WSL) rồi chạy:

```bash
cd ~/appaffilate
npm run infra:up
npm run db:reset-demo
npm run dev:all
```

---

## 4) Lỗi thường gặp (Windows)

### 4.1 Docker Desktop chưa chạy
- Mở Docker Desktop và chờ “Docker Engine running”

### 4.2 WSL chưa có / lỗi kernel
PowerShell (Admin):

```powershell
wsl --update
wsl --shutdown
```

### 4.3 Port bị chiếm (3000/4000/5432/6379/9000/9001)
- Tắt app đang dùng port hoặc đổi port trong `.env`/compose

---

