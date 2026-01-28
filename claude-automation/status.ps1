# Quick status check - see progress without live monitoring
# Run from Claude Code to check how the batch is going

param(
    [Parameter(Mandatory=$false)]
    [string]$NotesFile = ""
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host ""
Write-Host "=== Claude Automation Status ===" -ForegroundColor Cyan
Write-Host ""

# Check latest log
$latestLog = Get-ChildItem -Path "logs" -Filter "*.log" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if ($latestLog) {
    Write-Host "Latest log: $($latestLog.Name)" -ForegroundColor White
    Write-Host "Last update: $($latestLog.LastWriteTime)" -ForegroundColor Gray
    Write-Host ""

    # Show last 15 lines
    Write-Host "--- Recent Activity ---" -ForegroundColor Yellow
    Get-Content -Path $latestLog.FullName -Tail 15
    Write-Host ""
}

# Check for processed notes if file provided
if ($NotesFile -and (Test-Path $NotesFile)) {
    Write-Host "--- Processing Progress ---" -ForegroundColor Yellow

    $content = Get-Content -Path $NotesFile -Raw

    # Count total notes
    $totalNotes = ([regex]::Matches($content, '## \d+\.')).Count

    # Count completed (has response header)
    $completed = ([regex]::Matches($content, '### LeTrend Analys:')).Count

    $remaining = $totalNotes - $completed
    $percent = if ($totalNotes -gt 0) { [math]::Round(($completed / $totalNotes) * 100) } else { 0 }

    Write-Host "Total notes:     $totalNotes" -ForegroundColor White
    Write-Host "Completed:       $completed" -ForegroundColor Green
    Write-Host "Remaining:       $remaining" -ForegroundColor Yellow
    Write-Host "Progress:        $percent%" -ForegroundColor Cyan

    # Progress bar
    $barLength = 30
    $filledLength = [math]::Round($barLength * $percent / 100)
    $bar = "#" * $filledLength + "-" * ($barLength - $filledLength)
    Write-Host "[$bar]" -ForegroundColor Cyan
}

Write-Host ""
