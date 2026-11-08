$parents = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'wrangler' }
foreach ($p in $parents) { Write-Host ("wrangler node " + $p.ProcessId); Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'workerd.exe' } | ForEach-Object { Write-Host ("workerd " + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 3
$rest = netstat -ano | Select-String ':8798.*LISTENING'
if ($rest) { $rest | ForEach-Object { Write-Host $_ } } else { Write-Host 'PORT 8798 LIBRE' }
