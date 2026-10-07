# Tue les process NODE de wrangler (le binaire reel, pas les wrappers
# cmd/bash : tuer le wrapper tue aussi nos propres spawns). Motif large :
# la ligne contient wrangler.js / wrangler dev / miniflare.
$procs = Get-CimInstance Win32_Process -Filter "name='node.exe'"
foreach ($p in $procs) {
  if ($null -eq $p.CommandLine) { continue }
  if ($p.CommandLine -match 'wrangler' -and $p.CommandLine -notmatch 'bonus-decouverte-gui') {
    Write-Output ("kill {0} :: {1}" -f $p.ProcessId, $p.CommandLine.Substring(0, [Math]::Min(110, $p.CommandLine.Length)))
    taskkill /F /T /PID $p.ProcessId 2>$null | Out-Null
  }
}
Start-Sleep -Seconds 2
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 8787,8792,8793,8794,8795 } | ForEach-Object {
  Write-Output ("encore {0} sur {1} - kill" -f $_.OwningProcess, $_.LocalPort)
  taskkill /F /T /PID $_.OwningProcess 2>$null | Out-Null
}
Write-Output "purge OK"
