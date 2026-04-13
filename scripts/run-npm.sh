#!/usr/bin/env bash
# Run npm from repo root with nvm-loaded Node.
# On Ubuntu on-prem, nvm is installed for the deploy user — NOT for root.
#
# As deploy user:
#   ./scripts/run-npm.sh install
# As root (replace lichdt with your user):
#   DEPLOY_USER=lichdt ./scripts/run-npm.sh install
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"

run_as_self() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
    echo "nvm not found at $NVM_DIR/nvm.sh" >&2
    echo "Log in as the user who ran install-ubuntu-24.04-onprem.sh, then retry." >&2
    exit 1
  fi
  # shellcheck disable=SC1090
  source "$NVM_DIR/nvm.sh"
  cd "$REPO"
  exec npm "$@"
}

if [[ "${EUID}" -eq 0 ]]; then
  U="${DEPLOY_USER:-}"
  if [[ -z "$U" ]]; then
    cat >&2 <<EOF
You are root: npm/nvm are not on PATH here.

Use the Linux user who ran the installer (Node was installed via nvm for that user only).

  sudo -i -u <deploy-user>
  cd $REPO
  export NVM_DIR="\$HOME/.nvm" && source "\$NVM_DIR/nvm.sh"
  npm install
  npm run infra:up
  ...

Or from root in one line:

  DEPLOY_USER=<deploy-user> $REPO/scripts/run-npm.sh install
EOF
    exit 1
  fi

  join=""
  for a in "$@"; do
    join+=" $(printf '%q' "$a")"
  done
  exec sudo -u "$U" bash -lc "export NVM_DIR=\"\$HOME/.nvm\"; source \"\$NVM_DIR/nvm.sh\"; cd $(printf '%q' "$REPO"); exec npm${join}"
fi

run_as_self "$@"
