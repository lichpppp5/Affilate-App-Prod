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

function Run-CmdLine([string]$cmd) {
  Write-Host ">> $cmd"
  cmd.exe /c $cmd | Write-Host
}

function Escape-SingleQuoteForBash([string]$Value) {
  if ($null -eq $Value) { return "" }
  return $Value.Replace("'", "'\''")
}

function Test-WslDistroReady([string]$Name) {
  # Native wsl stderr becomes ErrorRecord; with $ErrorActionPreference Stop the script would terminate.
  $prevEa = $ErrorActionPreference
  try {
    $ErrorActionPreference = "SilentlyContinue"
    $null = & wsl.exe -d $Name -- bash -lc "true" 2>&1
  } finally {
    $ErrorActionPreference = $prevEa
  }
  return ($LASTEXITCODE -eq 0)
}

function Test-WslSubsystemInstalled {
  # wsl.exe exists on many builds even before the optional feature is fully active
  $prevEa = $ErrorActionPreference
  try {
    $ErrorActionPreference = "SilentlyContinue"
    $raw = & wsl.exe -l -v 2>&1
  } finally {
    $ErrorActionPreference = $prevEa
  }

  $text = ($raw | ForEach-Object {
    if ($_ -is [System.Management.Automation.ErrorRecord]) {
      $_.Exception.Message
    } else {
      $_.ToString()
    }
  }) -join "`n"

  if ($text -match '(?i)windows subsystem for linux is not installed') {
    return $false
  }
  if ($text -match '(?i)no installed distributions') {
    return $true
  }
  if ($text -match '(?i)(VERSION|Ubuntu|docker-desktop)') {
    return $true
  }
  return ($LASTEXITCODE -eq 0)
}

function Invoke-WslBootstrapScript {
  param(
    [string]$DistroName,
    [string]$ScriptContent
  )

  $unixContent = ($ScriptContent -replace "`r`n", "`n") + "`n"
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($unixContent)
  $b64 = [Convert]::ToBase64String($bytes)

  Write-Host ">> wsl -d $DistroName -- bash (bootstrap via base64)"
  & wsl.exe -d $DistroName -- bash -lc "set -euo pipefail; echo '$b64' | base64 -d | bash"
  if ($LASTEXITCODE -ne 0) {
    throw "WSL bootstrap script failed (exit $LASTEXITCODE). See messages above."
  }
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
  Run-CmdLine "wsl --status"
} catch {
  # ignore
}

Write-Host "Enabling WSL optional components (DISM)..."
Run-CmdLine "dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart"
Run-CmdLine "dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart"

if (-not (Test-WslSubsystemInstalled)) {
  Write-Host ""
  Write-Host "WSL is not installed yet (normal on first run). Installing via Microsoft installer..."
  Write-Host "This often requires a REBOOT. If setup asks you to restart, reboot then run this script again."
  Write-Host ""
  try {
    Run-CmdLine "wsl --install -d $Distro"
  } catch {
    Write-Host "Note: wsl --install may have failed or needs a reboot."
  }
  Start-Sleep -Seconds 3
  if (-not (Test-WslSubsystemInstalled)) {
    throw (
      "WSL is still not available after 'wsl --install'.`n" +
      "  1) REBOOT Windows (required after DISM/WSL install on many PCs).`n" +
      "  2) After reboot, open PowerShell (Admin) and run: wsl --update`n" +
      "  3) Run this script again.`n" +
      "Manual: https://aka.ms/wslinstall"
    )
  }
}

Write-Host "Setting default WSL version to 2..."
Run-CmdLine "wsl --set-default-version 2"

if (-not (Test-WslDistroReady $Distro)) {
  Write-Host "WSL distro '$Distro' not ready yet - finishing setup (may require reboot or first-launch)..."
  try {
    Run-CmdLine "wsl --install -d $Distro"
  } catch {
    Write-Host "Note: wsl --install may require a reboot. After reboot, run this script again."
  }
  if (-not (Test-WslDistroReady $Distro)) {
    # Avoid @" "@ here-strings for multi-line errors: PS 5.1 can misparse lines like "1) ..." after a bad/closing match.
    throw (
      "Distro '$Distro' is still not usable. Typical fixes:`n" +
      "  - Open 'Ubuntu' from the Start menu once and finish creating the UNIX user.`n" +
      "  - Run: wsl --update then wsl --shutdown then re-run this script.`n" +
      "  - Reboot if Windows asked you to after enabling WSL.`n" +
      "  Check: wsl -l -v"
    )
  }
} else {
  Write-Host "WSL distro '$Distro' is ready."
}

Write-Host
Write-Host "Step 2/6: Check Docker Desktop"
if (-not (Has-Cmd "docker")) {
  Write-Warning "Docker CLI not found. Install Docker Desktop (Linux containers) then re-run."
  Write-Warning "Download: https://www.docker.com/products/docker-desktop/"
  throw "Missing Docker Desktop."
}

docker version *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker is installed but not running. Start Docker Desktop then re-run."
}

Write-Host
Write-Host "Step 3/6: Bootstrap repo inside WSL"

$repoEsc = Escape-SingleQuoteForBash $RepoUrl
$dirEsc = Escape-SingleQuoteForBash $WslRepoDir
$apiEsc = Escape-SingleQuoteForBash $ApiBaseUrl
$webEsc = Escape-SingleQuoteForBash $WebBaseUrl
$nextEsc = Escape-SingleQuoteForBash $NextPublicApiBaseUrl

# Single-quoted bash assignments — values were escaped for embedding in '...'
$bashTpl = @'
set -euo pipefail

REPO_URL='__REPO_URL__'
WSL_DIR='__WSL_DIR__'
API_BASE_URL='__API_BASE_URL__'
WEB_BASE_URL='__WEB_BASE_URL__'
NEXT_PUBLIC_API_BASE_URL='__NEXT_PUBLIC_API_BASE_URL__'

echo '[wsl] installing base deps'
sudo apt-get update -y
sudo apt-get install -y git curl ca-certificates

echo '[wsl] installing nvm + Node 20'
if [ ! -d "$HOME/.nvm" ]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
fi
export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

nvm install 20
nvm use 20

mkdir -p "$WSL_DIR"
cd "$WSL_DIR"

if [ -d .git ]; then
  echo '[wsl] repo exists, pulling'
  git pull
else
  echo '[wsl] cloning repo'
  rm -rf "$WSL_DIR"
  mkdir -p "$(dirname "$WSL_DIR")"
  git clone "$REPO_URL" "$WSL_DIR"
  cd "$WSL_DIR"
fi

echo '[wsl] configuring .env'
if [ ! -f .env ]; then
  cp .env.example .env
fi

set_kv() {
  _key="$1"
  _val="$2"
  if grep -qE "^${_key}=" .env; then
    sed -i "s|^${_key}=.*|${_key}=${_val}|g" .env
  else
    echo "${_key}=${_val}" >> .env
  fi
}

set_kv API_BASE_URL "$API_BASE_URL"
set_kv WEB_BASE_URL "$WEB_BASE_URL"
set_kv NEXT_PUBLIC_API_BASE_URL "$NEXT_PUBLIC_API_BASE_URL"

echo '[wsl] installing deps'
npm install

echo '[wsl] starting infra'
npm run infra:up

echo '[wsl] reset demo db'
npm run db:reset-demo

echo '[wsl] done bootstrap'
'@

$bashScript = $bashTpl `
  -replace '__REPO_URL__', $repoEsc `
  -replace '__WSL_DIR__', $dirEsc `
  -replace '__API_BASE_URL__', $apiEsc `
  -replace '__WEB_BASE_URL__', $webEsc `
  -replace '__NEXT_PUBLIC_API_BASE_URL__', $nextEsc

Invoke-WslBootstrapScript -DistroName $Distro -ScriptContent $bashScript

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
Write-Host "Manual run (WSL):"
Write-Host "  wsl -d $Distro -- bash -lc `"cd $WslRepoDir && npm run dev:all`""
