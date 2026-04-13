param(
  [string]$Distro = "Ubuntu",
  [string]$WslRepoDir = "~/appaffilate",
  [string]$RepoUrl = "https://github.com/lichpppp5/Affilate-App-Prod.git",
  [string]$ApiBaseUrl = "http://localhost:4000",
  [string]$WebBaseUrl = "http://localhost:3000",
  [string]$NextPublicApiBaseUrl = "http://localhost:4000"
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Please run PowerShell as Administrator."
  }
}

function Has-Cmd($name) {
  $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function Run($cmd) {
  Write-Host ">> $cmd"
  cmd.exe /c $cmd | Write-Host
}

Assert-Admin

Write-Host "== AppAffilate installer (Windows + Docker + WSL2) =="
Write-Host "- WSL distro: $Distro"
Write-Host "- WSL dir:    $WslRepoDir"
Write-Host

Write-Host "Step 1/6: Enable WSL2 + Ubuntu (if missing)"
if (-not (Has-Cmd "wsl.exe")) {
  throw "WSL is not available on this Windows build."
}

try {
  Run "wsl --status"
} catch {
  # ignore
}

# Ensure WSL optional features (safe if already enabled)
Run "dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart"
Run "dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart"

Run "wsl --set-default-version 2"

$existing = (wsl -l -q 2>$null) -join "`n"
if ($existing -notmatch "^(Ubuntu|Ubuntu-24\.04|Ubuntu-22\.04)$") {
  Write-Host "Installing Ubuntu via WSL (may prompt / take time)..."
  try {
    Run "wsl --install -d Ubuntu"
  } catch {
    Write-Host "WSL distro install may already be in progress or require reboot."
  }
} else {
  Write-Host "WSL Ubuntu already present."
}

Write-Host
Write-Host "Step 2/6: Check Docker Desktop"
if (-not (Has-Cmd "docker")) {
  Write-Warning "Docker CLI not found. Please install Docker Desktop (Linux containers) then re-run this script."
  Write-Warning "Download: https://www.docker.com/products/docker-desktop/"
  throw "Missing Docker Desktop."
}

try {
  docker version | Out-Null
} catch {
  throw "Docker is installed but not running. Start Docker Desktop then re-run."
}

Write-Host
Write-Host "Step 3/6: Bootstrap repo inside WSL"

$wslSetup = @"
set -euo pipefail

echo '[wsl] installing base deps'
sudo apt-get update -y
sudo apt-get install -y git curl ca-certificates

echo '[wsl] installing nvm + Node 20'
if ! command -v nvm >/dev/null 2>&1; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
fi
source ~/.bashrc
nvm install 20
nvm use 20

mkdir -p $WslRepoDir
cd $WslRepoDir

if [ -d .git ]; then
  echo '[wsl] repo exists, pulling'
  git pull
else
  echo '[wsl] cloning repo'
  rm -rf "$WslRepoDir"
  git clone "$RepoUrl" "$WslRepoDir"
  cd "$WslRepoDir"
fi

echo '[wsl] configuring .env'
if [ ! -f .env ]; then
  cp .env.example .env
fi

set_kv() {
  key="$1"
  value="$2"
  if grep -qE "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|g" .env
  else
    echo "${key}=${value}" >> .env
  fi
}

set_kv API_BASE_URL "$ApiBaseUrl"
set_kv WEB_BASE_URL "$WebBaseUrl"
set_kv NEXT_PUBLIC_API_BASE_URL "$NextPublicApiBaseUrl"

echo '[wsl] installing deps'
npm install

echo '[wsl] starting infra'
npm run infra:up

echo '[wsl] reset demo db'
npm run db:reset-demo

echo '[wsl] done bootstrap'
"@

Run "wsl -d $Distro -- bash -lc `"$wslSetup`""

Write-Host
Write-Host "Step 4/6: Create auto-start Scheduled Task"

$taskName = "AppAffilate Auto Start"
$taskCmd = "wsl.exe -d $Distro -- bash -lc `"cd $WslRepoDir && npm run infra:up && npm run dev:all`""

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -Command `"$taskCmd`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId "$env:UserName" -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew

try {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
} catch {}

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null

Write-Host
Write-Host "Step 5/6: Start the task now"
Start-ScheduledTask -TaskName $taskName

Write-Host
Write-Host "Step 6/6: Summary"
Write-Host "Web: $WebBaseUrl"
Write-Host "API: $ApiBaseUrl"
Write-Host "Task: $taskName (runs at logon)"
Write-Host
Write-Host "Logs (WSL):"
Write-Host "  wsl -d $Distro -- bash -lc `"cd $WslRepoDir && npm run dev:all`""

