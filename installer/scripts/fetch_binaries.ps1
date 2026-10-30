# ==============================================================================
# Cachette Native Binaries Fetcher
# Downloads standalone minio.exe and cloudflared.exe into bin/ directory
# ==============================================================================

$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
$ProjectRoot = Resolve-Path "$ScriptDir\..\.."
$BinDir = "$ProjectRoot\bin"

if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
}

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "   Downloading Cachette Standalone Native Binaries  " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. MinIO Server (Windows AMD64)
$MinioPath = "$BinDir\minio.exe"
if (-not (Test-Path $MinioPath)) {
    $GoMinioPath = "$env:USERPROFILE\go\bin\minio.exe"
    if (Test-Path $GoMinioPath) {
        Write-Host "`nFound pre-compiled MinIO in GOPATH: $GoMinioPath" -ForegroundColor Green
        Copy-Item -Path $GoMinioPath -Destination $MinioPath -Force
        Write-Host "  Copied MinIO to $MinioPath" -ForegroundColor Green
    } elseif (Get-Command go -ErrorAction SilentlyContinue) {
        Write-Host "`nBuilding MinIO server from official source using Go toolchain..." -ForegroundColor Yellow
        go install github.com/minio/minio@latest
        if (Test-Path $GoMinioPath) {
            Copy-Item -Path $GoMinioPath -Destination $MinioPath -Force
            Write-Host "  MinIO compiled and copied to $MinioPath" -ForegroundColor Green
        } else {
            Write-Host "  Could not find compiled MinIO at $GoMinioPath" -ForegroundColor Red
        }
    } else {
        Write-Host "`nMinIO binary not found and Go toolchain is not available." -ForegroundColor Yellow
        Write-Host "Please place a pre-compiled 'minio.exe' into '$BinDir'." -ForegroundColor Cyan
    }
} else {
    Write-Host "  MinIO binary already exists at $MinioPath. Skipping." -ForegroundColor Green
}

# 2. Cloudflare Tunnel (Windows AMD64)
$CloudflaredPath = "$BinDir\cloudflared.exe"
if (-not (Test-Path $CloudflaredPath)) {
    $CloudflaredUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    Write-Host "`nDownloading Cloudflare Tunnel standalone binary from $CloudflaredUrl..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $CloudflaredUrl -OutFile $CloudflaredPath -UseBasicParsing
    Write-Host "  Cloudflared downloaded: $CloudflaredPath" -ForegroundColor Green
} else {
    Write-Host "  Cloudflared binary already exists at $CloudflaredPath. Skipping." -ForegroundColor Green
}

Write-Host "`nAll standalone native binaries are ready in: $BinDir" -ForegroundColor Green
