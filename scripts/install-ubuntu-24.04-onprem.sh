#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root: sudo $0" >&2
  exit 1
fi

APP_USER="${SUDO_USER:-}"
if [[ -z "${APP_USER}" || "${APP_USER}" == "root" ]]; then
  echo "Run via sudo from a normal user (not root)." >&2
  exit 1
fi

APP_DIR="/opt/appaffilate"
REPO_URL="https://github.com/lichpppp5/Affilate-App-Prod.git"
APP_HOME="$(getent passwd "${APP_USER}" | cut -d: -f6)"

echo "== AppAffilate on-prem installer (Ubuntu 24.04) =="
echo "- user: ${APP_USER}"
echo "- home: ${APP_HOME}"
echo "- dir:  ${APP_DIR}"
echo

# nvm is a shell function; ~/.bashrc often returns immediately for non-interactive shells,
# so never rely on "source ~/.bashrc" in su/systemd — always source nvm.sh directly.
with_nvm() {
  local cmd="$1"
  su - "${APP_USER}" -c "bash -euo pipefail -c \"
export NVM_DIR='${APP_HOME}/.nvm'
if [[ ! -s \\\"\\\$NVM_DIR/nvm.sh\\\" ]]; then
  echo 'nvm is not installed (run installer step 3 first).' >&2
  exit 1
fi
source \\\"\\\$NVM_DIR/nvm.sh\\\"
cd '${APP_DIR}'
${cmd}
\""
}

echo "Step 1/8: Install base packages"
apt-get update -y
apt-get install -y git curl ca-certificates gnupg

echo "Step 2/8: Install Docker Engine + compose plugin"
install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
fi

if [[ ! -f /etc/apt/sources.list.d/docker.list ]]; then
  codename="$(. /etc/os-release && echo "${UBUNTU_CODENAME}")"
  arch="$(dpkg --print-architecture)"
  echo "deb [arch=${arch} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${codename} stable" \
    >/etc/apt/sources.list.d/docker.list
fi

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
usermod -aG docker "${APP_USER}"

echo "Step 3/8: Install Node.js 20 via nvm (for ${APP_USER})"
su - "${APP_USER}" -c "bash -euo pipefail -c \"
export NVM_DIR='${APP_HOME}/.nvm'
if [[ ! -s \\\"\\\$NVM_DIR/nvm.sh\\\" ]]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
fi
source \\\"\\\$NVM_DIR/nvm.sh\\\"
nvm install 20
nvm use 20
\""

echo "Step 4/8: Clone or update repository"
if [[ -d "${APP_DIR}/.git" ]]; then
  su - "${APP_USER}" -c "bash -euo pipefail -c 'cd \"${APP_DIR}\" && git pull'"
else
  rm -rf "${APP_DIR}"
  mkdir -p "${APP_DIR}"
  chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
  su - "${APP_USER}" -c "bash -euo pipefail -c 'git clone \"${REPO_URL}\" \"${APP_DIR}\"'"
fi

echo "Step 5/8: Configure .env (LAN IP + URLs)"
LAN_IP_DEFAULT="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i==\"src\") {print $(i+1); exit}}' || true)"
LAN_IP_DEFAULT="${LAN_IP_DEFAULT:-127.0.0.1}"

read -r -p "LAN IP of this server [${LAN_IP_DEFAULT}]: " LAN_IP
LAN_IP="${LAN_IP:-${LAN_IP_DEFAULT}}"

ENV_PATH="${APP_DIR}/.env"
if [[ ! -f "${ENV_PATH}" ]]; then
  cp "${APP_DIR}/.env.example" "${ENV_PATH}"
  chown "${APP_USER}:${APP_USER}" "${ENV_PATH}"
fi

set_kv() {
  local key="$1"
  local value="$2"
  if grep -qE "^${key}=" "${ENV_PATH}"; then
    sed -i "s|^${key}=.*|${key}=${value}|g" "${ENV_PATH}"
  else
    echo "${key}=${value}" >>"${ENV_PATH}"
  fi
}

set_kv "API_BASE_URL" "http://${LAN_IP}:4000"
set_kv "WEB_BASE_URL" "http://${LAN_IP}:3000"
set_kv "NEXT_PUBLIC_API_BASE_URL" "http://${LAN_IP}:4000"

echo "Step 6/8: Install npm dependencies"
with_nvm "npm install"

echo "Step 7/8: Start infra + migrate + seed demo"
with_nvm "npm run infra:up"
with_nvm "npm --workspace @appaffilate/api run db:migrate"
with_nvm "npm run db:reset-demo"

echo "Step 8/8: Create systemd service (auto-start)"
SERVICE_PATH="/etc/systemd/system/appaffilate.service"
cat >"${SERVICE_PATH}" <<EOF
[Unit]
Description=AppAffilate (on-prem)
After=network-online.target docker.service
Wants=network-online.target docker.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_PATH}
ExecStart=/bin/bash -c 'set -euo pipefail; export NVM_DIR="${APP_HOME}/.nvm"; source "$NVM_DIR/nvm.sh"; cd "${APP_DIR}"; exec npm run dev:all'
Restart=always
RestartSec=3
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now appaffilate

echo
echo "== DONE =="
echo "Web: http://${LAN_IP}:3000"
echo "API: http://${LAN_IP}:4000"
echo
echo "Service:"
echo "  sudo systemctl status appaffilate --no-pager"
echo "Logs:"
echo "  sudo journalctl -u appaffilate -f"

