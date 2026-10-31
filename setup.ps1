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
# 1. Check Prerequisites (Python & Node.js)
# ------------------------------------------------------------------------------
Write-Host "`n[1/4] Checking prerequisites..." -ForegroundColor Yellow

# Check Python
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "  Python is not installed or not in PATH! Please install Python 3.10+." -ForegroundColor Red
    exit 1
}
$PythonVersion = python --version 2>&1
Write-Host "  Python: $PythonVersion" -ForegroundColor Green

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  Node.js is not installed or not in PATH! Please install Node.js 18+." -ForegroundColor Red
    exit 1
}
$NodeVersion = node --version 2>&1
Write-Host "  Node.js: $NodeVersion" -ForegroundColor Green

# ------------------------------------------------------------------------------
# 2. Configure Environment Files
# ------------------------------------------------------------------------------
Write-Host "`n[2/4] Setting up environment files..." -ForegroundColor Yellow

# Root .env
if (-not (Test-Path ".env")) {
    Write-Host "  Creating root .env..." -ForegroundColor Cyan
@"
DATABASE_URL=sqlite+aiosqlite:///./cachette.db
S3_ENDPOINT_URL=http://127.0.0.1:9002
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
S3_ENDPOINT_URL=http://127.0.0.1:9002
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
# 3. Setup Backend Environment
# ------------------------------------------------------------------------------
Write-Host "`n[3/4] Setting up Backend virtual environment..." -ForegroundColor Yellow

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

# ------------------------------------------------------------------------------
# 4. Setup Frontend Dependencies
# ------------------------------------------------------------------------------
Write-Host "`n[4/4] Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location "$ProjectRoot\frontend"
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    pnpm install
} else {
    npm install
}
Set-Location $ProjectRoot

Write-Host "`n====================================================" -ForegroundColor Green
Write-Host "       Cachette Node Setup Complete!                " -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Green
Write-Host "No Docker required! MinIO and Cloudflared run natively." -ForegroundColor Cyan
Write-Host "To start your node, run in separate terminals:`n"
Write-Host "  Terminal 1 (Backend):" -ForegroundColor Cyan
Write-Host "    cd backend"
Write-Host "    .\.venv\Scripts\Activate.ps1"
Write-Host "    uvicorn app.main:app --port 8000`n"
Write-Host "  Terminal 2 (Frontend):" -ForegroundColor Cyan
Write-Host "    cd frontend"
Write-Host "    npm run dev`n"
Write-Host "Once started, open http://localhost:3000 to pair your node with Central." -ForegroundColor Yellow
Write-Host "====================================================" -ForegroundColor Green
