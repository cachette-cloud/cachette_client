# ==============================================================================
# Cachette Node Setup Script (PowerShell for Windows)
# ==============================================================================

$ErrorActionPreference = "Stop"

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "           Cachette Node Setup Script               " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

$ProjectRoot = $PSScriptRoot
Set-Location $ProjectRoot

# ------------------------------------------------------------------------------
# 1. Check Docker & Docker Compose
# ------------------------------------------------------------------------------
Write-Host "`n[1/4] Checking prerequisites..." -ForegroundColor Yellow

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "  Docker is not installed! Please install Docker Desktop and start it." -ForegroundColor Red
    exit 1
}
Write-Host "  Docker is installed." -ForegroundColor Green

$ComposeCmd = "docker compose"
try {
    docker compose version | Out-Null
} catch {
    if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
        $ComposeCmd = "docker-compose"
    } else {
        Write-Host "  Docker Compose not found!" -ForegroundColor Red
        exit 1
    }
}
Write-Host "  Using Compose command: $ComposeCmd" -ForegroundColor Green

# ------------------------------------------------------------------------------
# 2. Configure Environment Files
# ------------------------------------------------------------------------------
Write-Host "`n[2/4] Setting up environment files..." -ForegroundColor Yellow

# Root .env
if (-not (Test-Path ".env")) {
    Write-Host "  Creating root .env..." -ForegroundColor Cyan
@"
DATABASE_URL=sqlite+aiosqlite:///./cachette.db
REDIS_URL=redis://localhost:6379
S3_ENDPOINT_URL=http://localhost:9002
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_REGION=us-east-1
S3_BUCKET_NAME=cachette-files
CF_TUNNEL_TOKEN=
"@ | Out-File -FilePath ".env" -Encoding utf8
    Write-Host "  Created root .env" -ForegroundColor Green
} else {
    Write-Host "  Root .env already exists. Skipping." -ForegroundColor Green
}

# Backend .env
if (-not (Test-Path "backend\.env")) {
    Write-Host "  Creating backend\.env..." -ForegroundColor Cyan
@"
DATABASE_URL=sqlite+aiosqlite:///./cachette.db
REDIS_URL=redis://localhost:6379
S3_ENDPOINT_URL=http://localhost:9002
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_REGION=us-east-1
S3_BUCKET_NAME=cachette-files
CF_TUNNEL_TOKEN=
CENTRAL_URL=https://cachette.cloud
"@ | Out-File -FilePath "backend\.env" -Encoding utf8
    Write-Host "  Created backend\.env" -ForegroundColor Green
} else {
    Write-Host "  backend\.env already exists. Skipping." -ForegroundColor Green
}

# Frontend .env
if (-not (Test-Path "frontend\.env")) {
    Write-Host "  Creating frontend\.env..." -ForegroundColor Cyan
@"
BACKEND_URL=http://127.0.0.1:8000
NEXT_PUBLIC_CENTRAL_URL=https://cachette.cloud
"@ | Out-File -FilePath "frontend\.env" -Encoding utf8
    Write-Host "  Created frontend\.env" -ForegroundColor Green
} else {
    Write-Host "  frontend\.env already exists. Skipping." -ForegroundColor Green
}

# ------------------------------------------------------------------------------
# 3. Determine Setup Mode
# ------------------------------------------------------------------------------
# Check if CF_TUNNEL_TOKEN is already set in .env
$CfToken = ""
if (Test-Path ".env") {
    $line = Get-Content ".env" | Where-Object { $_ -match "^CF_TUNNEL_TOKEN=(.*)$" } | Select-Object -First 1
    if ($line) {
        $CfToken = ($line -replace "^CF_TUNNEL_TOKEN=", "").Trim()
    }
}
$HasTunnelToken = -not [string]::IsNullOrWhiteSpace($CfToken)

Write-Host "`n[3/4] Select setup mode:" -ForegroundColor Yellow
Write-Host "  1) Full Docker Mode (Runs Frontend, Backend, Redis, MinIO via Docker Compose)"
Write-Host "  2) Local Development Mode (Runs Redis & MinIO in Docker; Python & Next.js locally)"
$choice = Read-Host "Enter choice [1 or 2] (default: 1)"
if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "1" }

# ------------------------------------------------------------------------------
# 4. Execute Setup
# ------------------------------------------------------------------------------
if ($choice -eq "1") {
    Write-Host "`n[4/4] Starting all services with Docker Compose..." -ForegroundColor Yellow
    if ($HasTunnelToken) {
        Write-Host "  Found CF_TUNNEL_TOKEN: starting stack with Cloudflare tunnel profile..." -ForegroundColor Green
        Invoke-Expression "$ComposeCmd --profile tunnel up -d --build"
    } else {
        Invoke-Expression "$ComposeCmd up -d --build"
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nDocker Compose failed to start services. Please check the error above." -ForegroundColor Red
        exit $LASTEXITCODE
    }

    Write-Host "`n====================================================" -ForegroundColor Green
    Write-Host "   Cachette Docker Stack is up and running!         " -ForegroundColor Green
    Write-Host "====================================================" -ForegroundColor Green
    Write-Host "  • Frontend UI:    http://localhost:3000" -ForegroundColor Cyan
    Write-Host "  • Backend API:    http://localhost:8000/docs" -ForegroundColor Cyan
    Write-Host "  • MinIO Console:  http://localhost:9003  (User: minioadmin / Pass: minioadmin)" -ForegroundColor Cyan

    if ($HasTunnelToken) {
        Write-Host "`nTunnel Status: Cloudflare tunnel is running and connected." -ForegroundColor Green
        Write-Host "Your node is accessible via your assigned subdomain on cachette.cloud." -ForegroundColor Cyan
    } else {
        Write-Host "`nOpen http://localhost:3000 to pair your node. The tunnel starts after pairing." -ForegroundColor Yellow
        Write-Host "Once paired, your node will be live at its public subdomain." -ForegroundColor Cyan
        Write-Host "If the tunnel does not start automatically after pairing, run:" -ForegroundColor DarkGray
        Write-Host "  $ComposeCmd --profile tunnel up -d cloudflared" -ForegroundColor DarkGray
    }

} elseif ($choice -eq "2") {
    Write-Host "`n[4/4] Setting up Local Development environment..." -ForegroundColor Yellow

    if ($HasTunnelToken) {
        Write-Host "`nStarting supporting containers (Redis, MinIO & Cloudflared tunnel)..."
        Invoke-Expression "$ComposeCmd --profile tunnel up -d redis minio cloudflared"
    } else {
        Write-Host "`nStarting supporting containers (Redis & MinIO)..."
        Invoke-Expression "$ComposeCmd up -d redis minio"
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nFailed to start supporting containers." -ForegroundColor Red
        exit $LASTEXITCODE
    }

    # Backend Setup
    Write-Host "`nSetting up Backend virtual environment..."
    Set-Location "$ProjectRoot\backend"
    if (-not (Test-Path ".venv")) {
        python -m venv .venv
        Write-Host "  Created backend\.venv" -ForegroundColor Green
    }

    $VenvPython = "$ProjectRoot\backend\.venv\Scripts\python.exe"

    & $VenvPython -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) { Write-Host "pip upgrade failed" -ForegroundColor Red; exit 1 }

    & $VenvPython -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { Write-Host "Dependency install failed" -ForegroundColor Red; exit 1 }

    & $VenvPython -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { Write-Host "Alembic migration failed" -ForegroundColor Red; exit 1 }
    Set-Location $ProjectRoot

    # Frontend Setup
    Write-Host "`nInstalling frontend npm dependencies..."
    Set-Location "$ProjectRoot\frontend"
    npm install
    Set-Location $ProjectRoot

    Write-Host "`n====================================================" -ForegroundColor Green
    Write-Host "   Local Development Setup Complete!                " -ForegroundColor Green
    Write-Host "====================================================" -ForegroundColor Green
    Write-Host "To start your services, open two separate terminals:`n"
    Write-Host "  Terminal 1 (Backend):" -ForegroundColor Cyan
    Write-Host "    cd backend"
    Write-Host "    .\.venv\Scripts\Activate.ps1"
    Write-Host "    uvicorn app.main:app --reload --port 8000`n"
    Write-Host "  Terminal 2 (Frontend):" -ForegroundColor Cyan
    Write-Host "    cd frontend"
    Write-Host "    npm run dev`n"
    if ($HasTunnelToken) {
        Write-Host "Tunnel Status: Cloudflare tunnel container is running." -ForegroundColor Green
    } else {
        Write-Host "Workflow: Open http://localhost:3000 to enter your pairing code from https://cachette.cloud." -ForegroundColor Yellow
        Write-Host "Upon pairing, the backend writes your tunnel token and connects to your live subdomain." -ForegroundColor Cyan
        Write-Host "Manual tunnel start command if needed:" -ForegroundColor DarkGray
        Write-Host "  $ComposeCmd --profile tunnel up -d cloudflared`n" -ForegroundColor DarkGray
    }
}
