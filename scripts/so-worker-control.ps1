# SO Worker Control — แผงสวิตช์เปิด/ปิด Worker (Windows)
# ดับเบิลคลิก SO-Workers.bat หรือ start-workers.bat
# ไม่เปิด terminal รก — Worker รันแบบซ่อน ดูสถานะจากสวิตช์นี้

[CmdletBinding()]
param(
  [switch]$LegacyTerminals
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root 'package.json'))) {
  [System.Windows.Forms.MessageBox]::Show(
    "โฟลเดอร์ผิด — ต้องอยู่ที่รากโปรเจกต์ api-scraper",
    "SO Workers",
    'OK',
    'Error'
  ) | Out-Null
  exit 1
}

$OutputDir = Join-Path $Root 'output'
$LogDir = Join-Path $OutputDir 'worker-logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$Patterns = @{
  Scrape   = @('scraper-pool\.mjs', 'workers[/\\]runner\.js')
  Autopost = @('post-remote-worker-supervisor\.js', 'post-remote-worker\.js')
}

function Get-MatchingProcesses([string[]]$Patterns) {
  $hits = @()
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ForEach-Object {
    $cmd = $_.CommandLine
    if (-not $cmd) { return }
    if ($cmd -match 'so-worker-control\.ps1|stop-windows-workers\.ps1|SO-Workers\.bat') { return }
    foreach ($pattern in $Patterns) {
      if ($cmd -match $pattern) {
        $hits += $_
        break
      }
    }
  }
  return $hits
}

function Stop-ProcessTree([int]$ProcessId) {
  Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-ProcessTree -ProcessId $_.ProcessId
  }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Stop-WorkerGroup([string]$Group) {
  $stopped = 0
  foreach ($proc in (Get-MatchingProcesses $Patterns[$Group])) {
    Stop-ProcessTree -ProcessId $proc.ProcessId
    $stopped += 1
  }
  if ($Group -eq 'Scrape') {
    & taskkill.exe /F /T /FI "WINDOWTITLE eq SO Scraper Pool*" 2>$null | Out-Null
    & taskkill.exe /F /T /FI "WINDOWTITLE eq SO Hidden Scrape*" 2>$null | Out-Null
  } else {
    & taskkill.exe /F /T /FI "WINDOWTITLE eq SO AutoPost Worker*" 2>$null | Out-Null
    & taskkill.exe /F /T /FI "WINDOWTITLE eq SO Hidden Autopost*" 2>$null | Out-Null
  }
  return $stopped
}

function Test-WorkerRunning([string]$Group) {
  return @(Get-MatchingProcesses $Patterns[$Group]).Count -gt 0
}

function Get-WorkerBuildSha {
  Push-Location $Root
  try {
    $sha = (git rev-parse --short HEAD 2>$null)
    if (-not $sha) { return 'unknown' }
    return $sha.Trim()
  } finally {
    Pop-Location
  }
}

function Update-WorkerCode {
  Push-Location $Root
  try {
    git fetch origin main 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "git fetch ไม่สำเร็จ" }
    git checkout -B main origin/main 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
      git reset --hard origin/main 2>&1 | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "git reset ไม่สำเร็จ" }
    } else {
      git reset --hard origin/main 2>&1 | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "git reset ไม่สำเร็จ" }
    }
    git clean -fd 2>&1 | Out-Null
    return (Get-WorkerBuildSha)
  } finally {
    Pop-Location
  }
}

function Start-HiddenNode([string]$Name, [string]$WorkDir, [string]$NodeArgs, [string]$LogName, [hashtable]$ExtraEnv) {
  $logPath = Join-Path $LogDir $LogName
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path $logPath -Value "`n==== $stamp start $Name ====`n" -Encoding UTF8

  $nodeExe = (Get-Command node -ErrorAction Stop).Source
  # ใช้ cmd /c + CreateNoWindow แล้ว redirect เข้าไฟล์ — ไม่เปิด console
  # และไม่ค้าง pipe เวลาแผงสวิตช์ปิด (ต่างจาก RedirectStandard* บน Process)
  $inner = "`"$nodeExe`" $NodeArgs >> `"$logPath`" 2>&1"
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = 'cmd.exe'
  $psi.Arguments = "/d /c $inner"
  $psi.WorkingDirectory = $WorkDir
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden

  $psi.EnvironmentVariables['WORKER_BUILD_SHA'] = (Get-WorkerBuildSha)
  $psi.EnvironmentVariables['WORKER_CAPABILITIES'] = 'post,preflight'
  $psi.EnvironmentVariables['AUTO_POST_DAILY_ENABLED'] = '0'
  foreach ($key in $ExtraEnv.Keys) {
    $psi.EnvironmentVariables[$key] = [string]$ExtraEnv[$key]
  }

  [void][System.Diagnostics.Process]::Start($psi)
}

function Start-ScrapeWorker {
  Start-HiddenNode -Name 'Scrape' -WorkDir $Root -NodeArgs 'workers/scraper-pool.mjs' -LogName 'scrape-pool.log' -ExtraEnv @{}
}

function Start-AutopostWorker {
  $autopost = Join-Path $Root 'autopost'
  Start-HiddenNode -Name 'Autopost' -WorkDir $autopost -NodeArgs 'scripts/post-remote-worker-supervisor.js' -LogName 'autopost.log' -ExtraEnv @{}
}

# ---- UI ----
$form = New-Object System.Windows.Forms.Form
$form.Text = 'SO Workers'
$form.Size = New-Object System.Drawing.Size(420, 360)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedSingle'
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(248, 249, 251)
$form.Font = New-Object System.Drawing.Font('Segoe UI', 10)

$title = New-Object System.Windows.Forms.Label
$title.Text = 'เปิด / ปิด Worker'
$title.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 16)
$title.Location = New-Object System.Drawing.Point(24, 18)
$title.AutoSize = $true
$form.Controls.Add($title)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Text = 'ไม่เปิดหน้าต่างดำ — กดสวิตช์อย่างเดียว (Chrome ตอน scrape/โพสต์อาจยังโผล่)'
$subtitle.ForeColor = [System.Drawing.Color]::FromArgb(100, 110, 120)
$subtitle.Location = New-Object System.Drawing.Point(26, 52)
$subtitle.AutoSize = $true
$form.Controls.Add($subtitle)

function New-SwitchRow([string]$LabelText, [int]$Top) {
  $panel = New-Object System.Windows.Forms.Panel
  $panel.Location = New-Object System.Drawing.Point(24, $Top)
  $panel.Size = New-Object System.Drawing.Size(360, 64)
  $panel.BackColor = [System.Drawing.Color]::White
  $panel.BorderStyle = 'FixedSingle'

  $label = New-Object System.Windows.Forms.Label
  $label.Text = $LabelText
  $label.Location = New-Object System.Drawing.Point(14, 12)
  $label.AutoSize = $true
  $label.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 11)
  $panel.Controls.Add($label)

  $status = New-Object System.Windows.Forms.Label
  $status.Text = 'กำลังตรวจ...'
  $status.Location = New-Object System.Drawing.Point(14, 36)
  $status.AutoSize = $true
  $status.ForeColor = [System.Drawing.Color]::FromArgb(100, 110, 120)
  $panel.Controls.Add($status)

  $toggle = New-Object System.Windows.Forms.CheckBox
  $toggle.Appearance = 'Button'
  $toggle.Text = 'ปิด'
  $toggle.Size = New-Object System.Drawing.Size(88, 36)
  $toggle.Location = New-Object System.Drawing.Point(256, 14)
  $toggle.TextAlign = 'MiddleCenter'
  $toggle.FlatStyle = 'Flat'
  $panel.Controls.Add($toggle)

  return @{ Panel = $panel; Toggle = $toggle; Status = $status }
}

$scrapeRow = New-SwitchRow 'ค้นหาผู้สมัคร (Scrap)' 88
$autoRow = New-SwitchRow 'โพสต์ Facebook (Autopost)' 164
$form.Controls.Add($scrapeRow.Panel)
$form.Controls.Add($autoRow.Panel)

$updateBtn = New-Object System.Windows.Forms.Button
$updateBtn.Text = 'อัปเดตโค้ด'
$updateBtn.Size = New-Object System.Drawing.Size(110, 34)
$updateBtn.Location = New-Object System.Drawing.Point(24, 246)
$form.Controls.Add($updateBtn)

$logBtn = New-Object System.Windows.Forms.Button
$logBtn.Text = 'เปิดไฟล์ log'
$logBtn.Size = New-Object System.Drawing.Size(110, 34)
$logBtn.Location = New-Object System.Drawing.Point(146, 246)
$form.Controls.Add($logBtn)

$refreshBtn = New-Object System.Windows.Forms.Button
$refreshBtn.Text = 'รีเฟรช'
$refreshBtn.Size = New-Object System.Drawing.Size(110, 34)
$refreshBtn.Location = New-Object System.Drawing.Point(268, 246)
$form.Controls.Add($refreshBtn)

$footer = New-Object System.Windows.Forms.Label
$footer.Location = New-Object System.Drawing.Point(26, 296)
$footer.Size = New-Object System.Drawing.Size(360, 20)
$footer.ForeColor = [System.Drawing.Color]::FromArgb(100, 110, 120)
$footer.Text = "โค้ด: $(Get-WorkerBuildSha)"
$form.Controls.Add($footer)

$busy = $false
function Set-Busy([bool]$Value) {
  $script:busy = $Value
  $scrapeRow.Toggle.Enabled = -not $Value
  $autoRow.Toggle.Enabled = -not $Value
  $updateBtn.Enabled = -not $Value
  $refreshBtn.Enabled = -not $Value
}

function Update-ToggleVisual($Row, [bool]$On) {
  if ($On) {
    $Row.Toggle.Checked = $true
    $Row.Toggle.Text = 'เปิด'
    $Row.Toggle.BackColor = [System.Drawing.Color]::FromArgb(22, 163, 74)
    $Row.Toggle.ForeColor = [System.Drawing.Color]::White
    $Row.Status.Text = 'กำลังทำงาน (ซ่อนหน้าต่าง)'
    $Row.Status.ForeColor = [System.Drawing.Color]::FromArgb(22, 163, 74)
  } else {
    $Row.Toggle.Checked = $false
    $Row.Toggle.Text = 'ปิด'
    $Row.Toggle.BackColor = [System.Drawing.Color]::FromArgb(226, 232, 240)
    $Row.Toggle.ForeColor = [System.Drawing.Color]::FromArgb(51, 65, 85)
    $Row.Status.Text = 'ปิดอยู่'
    $Row.Status.ForeColor = [System.Drawing.Color]::FromArgb(100, 110, 120)
  }
}

function Refresh-Status {
  if ($busy) { return }
  Update-ToggleVisual $scrapeRow (Test-WorkerRunning 'Scrape')
  Update-ToggleVisual $autoRow (Test-WorkerRunning 'Autopost')
  $footer.Text = "โค้ด: $(Get-WorkerBuildSha)  ·  log: output\worker-logs"
}

$scrapeRow.Toggle.Add_Click({
  if ($busy) { return }
  Set-Busy $true
  try {
    if ($scrapeRow.Toggle.Checked) {
      $footer.Text = 'กำลังเปิด Scrap...'
      [System.Windows.Forms.Application]::DoEvents()
      Start-ScrapeWorker
      Start-Sleep -Seconds 2
    } else {
      $footer.Text = 'กำลังปิด Scrap...'
      [System.Windows.Forms.Application]::DoEvents()
      Stop-WorkerGroup 'Scrape' | Out-Null
      Start-Sleep -Seconds 1
    }
  } catch {
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Scrap', 'OK', 'Error') | Out-Null
  } finally {
    Set-Busy $false
    Refresh-Status
  }
})

$autoRow.Toggle.Add_Click({
  if ($busy) { return }
  Set-Busy $true
  try {
    if ($autoRow.Toggle.Checked) {
      $footer.Text = 'กำลังเปิด Autopost...'
      [System.Windows.Forms.Application]::DoEvents()
      Start-AutopostWorker
      Start-Sleep -Seconds 2
    } else {
      $footer.Text = 'กำลังปิด Autopost...'
      [System.Windows.Forms.Application]::DoEvents()
      Stop-WorkerGroup 'Autopost' | Out-Null
      Start-Sleep -Seconds 1
    }
  } catch {
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Autopost', 'OK', 'Error') | Out-Null
  } finally {
    Set-Busy $false
    Refresh-Status
  }
})

$updateBtn.Add_Click({
  if ($busy) { return }
  Set-Busy $true
  try {
    $wasScrape = Test-WorkerRunning 'Scrape'
    $wasAuto = Test-WorkerRunning 'Autopost'
    if ($wasScrape) { Stop-WorkerGroup 'Scrape' | Out-Null }
    if ($wasAuto) { Stop-WorkerGroup 'Autopost' | Out-Null }
    $footer.Text = 'กำลังดึงโค้ดจาก GitHub...'
    [System.Windows.Forms.Application]::DoEvents()
    $sha = Update-WorkerCode
    $footer.Text = "อัปเดตแล้ว: $sha"
    if ($wasScrape) { Start-ScrapeWorker }
    if ($wasAuto) { Start-AutopostWorker }
    if ($wasScrape -or $wasAuto) { Start-Sleep -Seconds 2 }
  } catch {
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'อัปเดตโค้ด', 'OK', 'Error') | Out-Null
  } finally {
    Set-Busy $false
    Refresh-Status
  }
})

$logBtn.Add_Click({
  Start-Process explorer.exe -ArgumentList $LogDir
})

$refreshBtn.Add_Click({ Refresh-Status })

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 4000
$timer.Add_Tick({ Refresh-Status })
$timer.Start()

$form.Add_Shown({ Refresh-Status })
$form.Add_FormClosed({ $timer.Stop() })

if ($LegacyTerminals) {
  # โหมดเก่า: เปิด terminal แยก (ใช้เมื่อต้องการดู log สด)
  & (Join-Path $Root 'start-workers-legacy.bat')
  exit 0
}

[System.Windows.Forms.Application]::Run($form)
