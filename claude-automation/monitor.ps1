# Monitor the batch processing from another terminal
# Shows live progress and status

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "================================" -ForegroundColor Cyan
Write-Host "  Claude Automation Monitor" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Find latest log file
$latestLog = Get-ChildItem -Path "logs" -Filter "*.log" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $latestLog) {
    Write-Host "No log files found. Start a batch process first." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Watching for new logs..." -ForegroundColor Gray

    # Wait for a log file to appear
    while (-not $latestLog) {
        Start-Sleep -Seconds 2
        $latestLog = Get-ChildItem -Path "logs" -Filter "*.log" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
    }
}

Write-Host "Monitoring: $($latestLog.Name)" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor DarkGray

# Tail the log file
Get-Content -Path $latestLog.FullName -Wait -Tail 50
