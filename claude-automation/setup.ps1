# Setup script for Claude Desktop Automation
# Run this once to set everything up

Write-Host "================================" -ForegroundColor Cyan
Write-Host "  Claude Automation Setup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# Check Python
Write-Host "[1/4] Checking Python..." -ForegroundColor Yellow
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Host "ERROR: Python not found. Install Python first." -ForegroundColor Red
    exit 1
}
$pythonVersion = python --version
Write-Host "  Found: $pythonVersion" -ForegroundColor Green

# Create virtual environment
Write-Host "[2/4] Creating virtual environment..." -ForegroundColor Yellow
if (-not (Test-Path "venv")) {
    python -m venv venv
    Write-Host "  Created venv/" -ForegroundColor Green
} else {
    Write-Host "  venv/ already exists" -ForegroundColor Green
}

# Activate and install dependencies
Write-Host "[3/4] Installing dependencies..." -ForegroundColor Yellow
& ".\venv\Scripts\Activate.ps1"
pip install -r requirements.txt --quiet
Write-Host "  Dependencies installed" -ForegroundColor Green

# Create directories
Write-Host "[4/4] Creating directories..." -ForegroundColor Yellow
$dirs = @("logs", "input", "output")
foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
        Write-Host "  Created $dir/" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Put your notes file in input/" -ForegroundColor White
Write-Host "  2. Edit config.py to customize the prompt" -ForegroundColor White
Write-Host "  3. Open Claude Desktop with your context" -ForegroundColor White
Write-Host "  4. Run: .\run.ps1 input\your_notes.md" -ForegroundColor White
Write-Host ""
Write-Host "To monitor from another terminal:" -ForegroundColor Yellow
Write-Host "  .\monitor.ps1" -ForegroundColor White
Write-Host ""
