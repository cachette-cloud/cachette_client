# ==============================================================================
# Cachette Full Automated Installer Builder
# Produces standalone release/Cachette-Setup-x64.exe (No Docker Required)
# ==============================================================================

$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
$ProjectRoot = Resolve-Path "$ScriptDir\..\.."
$DistDir = "$ProjectRoot\dist"
$ReleaseDir = "$ProjectRoot\release"

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "         Cachette Native Installer Builder          " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# 1. Prepare Staging Directories
# ------------------------------------------------------------------------------
Write-Host "`n[1/5] Preparing clean staging directory..." -ForegroundColor Yellow
if (Test-Path $DistDir) {
    Remove-Item -Path $DistDir -Recurse -Force
}
New-Item -ItemType Directory -Path "$DistDir\bin" -Force | Out-Null
New-Item -ItemType Directory -Path "$DistDir\backend" -Force | Out-Null
New-Item -ItemType Directory -Path "$DistDir\frontend\out" -Force | Out-Null
New-Item -ItemType Directory -Path $ReleaseDir -Force | Out-Null

# ------------------------------------------------------------------------------
# 2. Fetch Standalone Binaries (MinIO & Cloudflare Tunnel)
# ------------------------------------------------------------------------------
Write-Host "`n[2/5] Fetching native standalone binaries..." -ForegroundColor Yellow
& "$ScriptDir\fetch_binaries.ps1"

Copy-Item -Path "$ProjectRoot\bin\minio.exe" -Destination "$DistDir\bin\" -Force
Copy-Item -Path "$ProjectRoot\bin\cloudflared.exe" -Destination "$DistDir\bin\" -Force
Write-Host "  Copied minio.exe and cloudflared.exe to dist\bin" -ForegroundColor Green

# ------------------------------------------------------------------------------
# 3. Build Static Frontend (Next.js Export)
# ------------------------------------------------------------------------------
Write-Host "`n[3/5] Building static frontend UI..." -ForegroundColor Yellow
Set-Location "$ProjectRoot\frontend"
$env:NEXT_EXPORT = "true"
npm run build
Set-Location $ProjectRoot

Copy-Item -Path "$ProjectRoot\frontend\out\*" -Destination "$DistDir\frontend\out\" -Recurse -Force
Write-Host "  Exported static UI assets to dist\frontend\out" -ForegroundColor Green

# ------------------------------------------------------------------------------
# 4. Compile Standalone Backend & Supervisor Launcher (PyInstaller)
# ------------------------------------------------------------------------------
Write-Host "`n[4/5] Compiling standalone backend & supervisor launcher..." -ForegroundColor Yellow

$PythonExe = "$ProjectRoot\backend\.venv\Scripts\python.exe"
if (-not (Test-Path $PythonExe)) {
    throw "Python virtual environment not found at: $PythonExe"
}

# 4a. Compile backend into standalone binary bundle (onedir)
Write-Host "  Compiling backend into cachette-backend.exe..." -ForegroundColor Yellow
$BackendStageDir = "$DistDir\backend_stage"

& $PythonExe -m PyInstaller --noconfirm --onedir --name "cachette-backend" `
    --distpath "$BackendStageDir" `
    --collect-all uvicorn --collect-all fastapi --collect-all pydantic --collect-all pydantic_core `
    --collect-all alembic --collect-all sqlalchemy --collect-all aiosqlite --collect-all aiobotocore --collect-all botocore `
    --hidden-import aiosqlite --hidden-import sqlalchemy.ext.asyncio --hidden-import app.models `
    "$ProjectRoot\backend\run_server.py"

# Move all compiled files from backend_stage/cachette-backend directly into dist\backend
Move-Item -Path "$BackendStageDir\cachette-backend\*" -Destination "$DistDir\backend\" -Force
Remove-Item -Path $BackendStageDir -Recurse -Force -ErrorAction SilentlyContinue

# Copy alembic migrations and configuration
Copy-Item -Path "$ProjectRoot\backend\alembic" -Destination "$DistDir\backend\alembic" -Recurse -Force
Copy-Item -Path "$ProjectRoot\backend\alembic.ini" -Destination "$DistDir\backend\" -Force
if (Test-Path "$ProjectRoot\backend\public.pem") {
    Copy-Item -Path "$ProjectRoot\backend\public.pem" -Destination "$DistDir\backend\" -Force
}

# 4b. Compile Cachette.exe supervisor launcher
Write-Host "  Compiling Cachette.exe supervisor launcher with PyInstaller..." -ForegroundColor Yellow
& $PythonExe -m PyInstaller --noconfirm --onefile --noconsole --name "Cachette" --distpath "$DistDir" "$ProjectRoot\installer\launcher.py"

# Clean up PyInstaller build artifacts
Remove-Item -Path "$ProjectRoot\Cachette.spec" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$ProjectRoot\backend\cachette-backend.spec" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$ProjectRoot\build" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$ProjectRoot\backend\build" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "  Standalone backend and launcher successfully compiled to dist." -ForegroundColor Green

# ------------------------------------------------------------------------------
# 5. Compile Inno Setup Installer (.exe)
# ------------------------------------------------------------------------------
Write-Host "`n[5/5] Compiling final Windows Installer..." -ForegroundColor Yellow

# Look for Inno Setup compiler (ISCC.exe)
$IsccPaths = @(
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe",
    "C:\Program Files (x86)\Inno Setup 5\ISCC.exe",
    "C:\Program Files\Inno Setup 5\ISCC.exe"
)
$Iscc = $IsccPaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $Iscc) {
    $IsccCmd = Get-Command "ISCC.exe" -ErrorAction SilentlyContinue
    if ($IsccCmd) { $Iscc = $IsccCmd.Source }
}

if ($Iscc) {
    Write-Host "  Found Inno Setup Compiler at: $Iscc" -ForegroundColor Green
    & $Iscc "$ProjectRoot\installer\CachetteSetup.iss"
    Write-Host "`n====================================================" -ForegroundColor Green
    Write-Host "   SUCCESS! Native Installer generated at:          " -ForegroundColor Green
    Write-Host "   $ReleaseDir\Cachette-Setup-x64.exe               " -ForegroundColor Cyan
    Write-Host "====================================================" -ForegroundColor Green
} else {
    Write-Host "`nInno Setup (ISCC.exe) was not found in standard directories." -ForegroundColor Yellow
    Write-Host "All installer files and binaries have been staged in: $DistDir" -ForegroundColor Cyan
    Write-Host "`nTo generate Cachette-Setup-x64.exe:" -ForegroundColor Yellow
    Write-Host "  1. Download and install Inno Setup: https://jrsoftware.org/isdl.php" -ForegroundColor Cyan
    Write-Host "  2. Right-click installer\CachetteSetup.iss and click 'Compile'." -ForegroundColor Cyan
}
