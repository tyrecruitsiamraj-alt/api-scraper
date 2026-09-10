# Stop only this project's Worker processes so start-workers.bat can refresh
# like so-control.command on Mac. Do not kill unrelated Node apps.
$ErrorActionPreference = 'SilentlyContinue'
$patterns = @(
  'scraper-pool\.mjs',
  'workers[/\\]runner\.js',
  'post-remote-worker-supervisor\.js',
  'post-remote-worker\.js'
)

function Stop-ProcessTree([int]$ProcessId) {
  Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" | ForEach-Object {
    Stop-ProcessTree -ProcessId $_.ProcessId
  }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

$stopped = 0
Get-CimInstance Win32_Process | ForEach-Object {
  $command = $_.CommandLine
  if (-not $command) { return }
  if ($command -match 'stop-windows-workers\.ps1') { return }
  foreach ($pattern in $patterns) {
    if ($command -match $pattern) {
      Stop-ProcessTree -ProcessId $_.ProcessId
      $stopped += 1
      break
    }
  }
}

foreach ($title in @('SO Scraper Pool*', 'SO AutoPost Worker*')) {
  & taskkill.exe /F /T /FI "WINDOWTITLE eq $title" 2>$null | Out-Null
}

Write-Output "stopped=$stopped"
exit 0
