# Run the batch processor
# Usage: .\run.ps1 <notes-file> [start-from]
# Example: .\run.ps1 input\prospects.md
# Example: .\run.ps1 input\prospects.md 5

param(
    [Parameter(Mandatory=$true)]
    [string]$NotesFile,

    [Parameter(Mandatory=$false)]
    [int]$StartFrom = 1,

    [Parameter(Mandatory=$false)]
    [switch]$DryRun
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# Activate venv
if (Test-Path "venv\Scripts\Activate.ps1") {
    & ".\venv\Scripts\Activate.ps1"
} else {
    Write-Host "ERROR: Virtual environment not found. Run setup.ps1 first." -ForegroundColor Red
    exit 1
}

# Check if file exists
if (-not (Test-Path $NotesFile)) {
    Write-Host "ERROR: File not found: $NotesFile" -ForegroundColor Red
    exit 1
}

# Build command
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile = "logs\run_$timestamp.log"

Write-Host "================================" -ForegroundColor Cyan
Write-Host "  Claude Batch Processor" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Input:    $NotesFile" -ForegroundColor White
Write-Host "Start:    #$StartFrom" -ForegroundColor White
Write-Host "Log:      $logFile" -ForegroundColor White
Write-Host ""

if ($DryRun) {
    Write-Host "MODE: Dry run (no changes)" -ForegroundColor Yellow
    python batch_process_notes.py $NotesFile --start-from $StartFrom --dry-run 2>&1 | Tee-Object -FilePath $logFile
} else {
    Write-Host "MODE: Live processing" -ForegroundColor Green
    Write-Host ""
    Write-Host "Controls:" -ForegroundColor Yellow
    Write-Host "  'c' = Copy response, next note" -ForegroundColor White
    Write-Host "  's' = Skip this note" -ForegroundColor White
    Write-Host "  'q' = Quit" -ForegroundColor White
    Write-Host ""

    python batch_process_notes.py $NotesFile --start-from $StartFrom 2>&1 | Tee-Object -FilePath $logFile
}

Write-Host ""
Write-Host "Log saved to: $logFile" -ForegroundColor Green
