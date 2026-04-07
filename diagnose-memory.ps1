# hagen-ui memory diagnostic
# Run in PowerShell from hagen-ui root

Write-Host "=== hagen-ui Memory Diagnostic ===" -ForegroundColor Cyan
Write-Host ""

# 1. System memory
Write-Host "--- System Memory ---" -ForegroundColor Yellow
$os = Get-CimInstance Win32_OperatingSystem
$totalMem = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
$freeMem = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
Write-Host "Total RAM: $totalMem GB"
Write-Host "Free RAM: $freeMem GB"
Write-Host ""

# 2. Node version
Write-Host "--- Node Version ---" -ForegroundColor Yellow
node --version
$env:NODE_OPTIONS
Write-Host ""

# 3. Next.js config
Write-Host "--- next.config.ts ---" -ForegroundColor Yellow
$nextConfig = Get-Content "app/next.config.ts" -Raw
Write-Host $nextConfig
Write-Host ""

# 4. Large source files (top 10 by line count)
Write-Host "--- Largest TSX/TS files ---" -ForegroundColor Yellow
Get-ChildItem -Path "app/src" -Recurse -Include "*.tsx","*.ts" |
    ForEach-Object { [PSCustomObject]@{ File = $_.FullName; Lines = (Get-Content -LiteralPath $_.FullName).Count } } |
    Sort-Object Lines -Descending |
    Select-Object -First 10 |
    ForEach-Object { Write-Host "$($_.Lines) lines - $($_.File)" }
Write-Host ""

# 5. Total source files + line count
Write-Host "--- Source Stats ---" -ForegroundColor Yellow
$allFiles = Get-ChildItem -Path "app/src" -Recurse -Include "*.tsx","*.ts"
$totalLines = 0
$allFiles | ForEach-Object { $totalLines += (Get-Content -LiteralPath $_.FullName).Count }
Write-Host "Total TSX/TS files: $($allFiles.Count)"
Write-Host "Total lines of code: $totalLines"
Write-Host ""

# 6. Check for circular imports in key files
Write-Host "--- Potential Circular Import Detection ---" -ForegroundColor Yellow
$criticalFiles = @(
    "app/src/app/studio/customers/[id]/page.tsx",
    "app/src/app/studio/layout.tsx",
    "app/src/app/page.tsx",
    "app/src/middleware.ts",
    "app/src/lib/auth/navigation.ts"
)
foreach ($f in $criticalFiles) {
    if (Test-Path -LiteralPath $f) {
        $content = Get-Content -LiteralPath $f -Raw
        $importCount = ([regex]::Matches($content, "import.*from")).Count
        $lines = (Get-Content -LiteralPath $f).Count
        Write-Host "$f - $lines lines, $importCount imports"
    }
}
Write-Host ""

# 7. Suggested heap setting
Write-Host "--- Suggested NODE_OPTIONS ---" -ForegroundColor Yellow
$recommended = 3072
if ($totalMem -gt 16) { $recommended = 4096 }
Write-Host "Your system has ~$totalMem GB RAM. Try:"
Write-Host "  set NODE_OPTIONS=--max-old-space-size=$recommended"
Write-Host "  npm run dev"
Write-Host ""

Write-Host "=== End Diagnostic ===" -ForegroundColor Cyan
