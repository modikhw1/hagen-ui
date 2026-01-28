Write-Host "`n=== TOP MEMORY PROCESSES ===" -ForegroundColor Cyan
Get-Process | Where-Object {$_.WorkingSet64 -gt 100MB} | Sort-Object WorkingSet64 -Descending | Select-Object -First 20 Name, Id, @{N='MB';E={[math]::Round($_.WorkingSet64/1MB)}} | Format-Table

Write-Host "`n=== NODE.EXE PROCESSES ===" -ForegroundColor Cyan
Get-Process node -ErrorAction SilentlyContinue | Select-Object Id, @{N='MB';E={[math]::Round($_.WorkingSet64/1MB)}}, StartTime | Format-Table

Write-Host "`n=== POTENTIAL BLOAT (can be killed) ===" -ForegroundColor Yellow
$bloat = @(
    'AdobeCollabSync',
    'AdobeIPCBroker',
    'AdobeNotificationClient',
    'CCXProcess',
    'Creative Cloud',
    'OneDrive',
    'Spotify',
    'Discord',
    'Slack',
    'Teams'
)
Get-Process | Where-Object {$bloat -contains $_.Name} | Select-Object Name, Id, @{N='MB';E={[math]::Round($_.WorkingSet64/1MB)}} | Format-Table
