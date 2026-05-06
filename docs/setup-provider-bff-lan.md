# Setup Provider BFF trong LAN (publish thật, không mock)

Mục tiêu: chạy `apps/provider-bff` như một service nội bộ, để API/worker trỏ `*_OAUTH_TOKEN_URL` và `*_PUBLISH_URL` vào đây.

## 1) Cài & build

Trong `/opt/appaffilate` (user deploy, không phải root):

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"
npm install
npm --workspace @appaffilate/provider-bff run build
```

## 2) Cấu hình env (ví dụ)

Trong `.env` (hoặc env riêng cho service), đặt:

```env
PROVIDER_BFF_PORT=4100

# Trỏ API + worker vào BFF
TIKTOK_OAUTH_TOKEN_URL=http://<LAN-IP>:4100/tiktok/oauth/token
TIKTOK_PUBLISH_URL=http://<LAN-IP>:4100/tiktok/publish
SHOPEE_OAUTH_TOKEN_URL=http://<LAN-IP>:4100/shopee/oauth/token
SHOPEE_PUBLISH_URL=http://<LAN-IP>:4100/shopee/publish
FACEBOOK_OAUTH_TOKEN_URL=http://<LAN-IP>:4100/facebook/oauth/token
FACEBOOK_PUBLISH_URL=http://<LAN-IP>:4100/facebook/publish

# Upstream thật (ví dụ: nếu bạn có service/proxy map theo từng nền tảng)
TIKTOK_UPSTREAM_TOKEN_URL=...
TIKTOK_UPSTREAM_PUBLISH_URL=...
SHOPEE_UPSTREAM_TOKEN_URL=...
SHOPEE_UPSTREAM_PUBLISH_URL=...

# Facebook: nếu không set FACEBOOK_UPSTREAM_PUBLISH_URL thì BFF sẽ dùng Graph API
FACEBOOK_GRAPH_BASE_URL=https://graph.facebook.com
FACEBOOK_GRAPH_VERSION=v20.0
FACEBOOK_PAGE_ID=...
```

> BFF sẽ fail-fast nếu bạn chưa cấu hình upstream thật cho TikTok/Shopee (và Facebook token URL nếu bạn dùng refresh).

## 3) Chạy systemd

Chạy một lần dưới `root` (sửa `<DEPLOY_USER>`):

```bash
APP_USER="<DEPLOY_USER>"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"

sudo tee /etc/systemd/system/appaffilate-bff.service >/dev/null <<EOF
[Unit]
Description=AppAffilate Provider BFF (LAN)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=/opt/appaffilate
EnvironmentFile=/opt/appaffilate/.env
ExecStart=/bin/bash -c 'set -euo pipefail; export NVM_DIR="${APP_HOME}/.nvm"; source "\$NVM_DIR/nvm.sh"; cd /opt/appaffilate; exec node dist/apps/provider-bff/src/index.js'
Restart=always
RestartSec=3
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now appaffilate-bff
sudo systemctl status appaffilate-bff --no-pager
```

## 4) Kiểm tra nhanh

```bash
curl -s http://<LAN-IP>:4100/health
```

