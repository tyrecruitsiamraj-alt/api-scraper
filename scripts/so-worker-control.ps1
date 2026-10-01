# SO Worker Control - แผงสวิตช์เปิด/ปิด Worker (Windows)
# ดับเบิลคลิก SO-Workers.bat หรือ start-workers.bat
# ไม่เปิด terminal รก - Worker รันแบบซ่อน ดูสถานะจากสวิตช์นี้

[CmdletBinding()]
param(
  [switch]$LegacyTerminals
)

$ErrorActionPreference = 'Stop'

# WinForms ต้องรันบน STA - ถ้าเปิดแบบ MTA แผงจะพังแล้วหน้าต่างหายทันที
$apartment = [System.Threading.Thread]::CurrentThread.GetApartmentState()
if ($apartment -ne 'STA') {
  $relaunch = @(
    '-NoProfile'
    '-STA'
    '-ExecutionPolicy'
    'Bypass'
    '-File'
    $PSCommandPath
  )
  if ($LegacyTerminals) { $relaunch += '-LegacyTerminals' }
  $p = Start-Process -FilePath 'powershell.exe' -ArgumentList $relaunch -Wait -PassThru
  exit $p.ExitCode
}

try {
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root 'package.json'))) {
  [System.Windows.Forms.MessageBox]::Show(
    "โฟลเดอร์ผิด - ต้องอยู่ที่รากโปรเจกต์ api-scraper",
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
  Scrape   = @('scraper-pool\.mjs', 'workers[/\\]runner\.js', 'npm.*scraper:pool', 'start-scrape\.cmd')
  Autopost = @('post-remote-worker-supervisor\.js', 'post-remote-worker\.js', 'npm.*worker:post', 'start-autopost\.cmd')
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

# ตอนดับเบิลคลิกจาก Explorer PATH อาจไม่มี node - รวม PATH จาก Registry
try {
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if ($machinePath -or $userPath) {
    $env:Path = (@($machinePath, $userPath, $env:Path) | Where-Object { $_ }) -join ';'
  }
} catch { }

function Resolve-NodeExe {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source -and (Test-Path -LiteralPath $cmd.Source)) {
    return $cmd.Source
  }
  $candidates = @(
    (Join-Path $env:ProgramFiles 'nodejs\node.exe')
    (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe')
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
    (Join-Path $env:LOCALAPPDATA 'nvs\node\*\*\node.exe')
  )
  foreach ($pattern in $candidates) {
    if (-not $pattern) { continue }
    $hit = Get-Item -Path $pattern -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hit) { return $hit.FullName }
  }
  throw "ไม่พบ node.exe - ติดตั้ง Node.js แล้วลองเปิดแผงใหม่ (หรือเปิดจากเครื่องที่รัน node ใน cmd ได้)"
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

function Resolve-NpmCmd {
  $cmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { return $cmd.Source }
  $cmd = Get-Command npm -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { return $cmd.Source }
  $nodeDir = Split-Path -Parent (Resolve-NodeExe)
  foreach ($name in @('npm.cmd', 'npm.exe', 'npm')) {
    $candidate = Join-Path $nodeDir $name
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  throw "ไม่พบ npm - ติดตั้ง Node.js แบบมี npm แล้วเปิดแผงใหม่"
}

function Wait-WorkerStarted([string]$Group, [int]$TimeoutSec = 20) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-WorkerRunning $Group) { return $true }
    Start-Sleep -Milliseconds 500
    [System.Windows.Forms.Application]::DoEvents()
  }
  return $false
}

# เปิดแบบเดียวกับ start-workers-legacy.bat ที่เคยใช้ได้จริง
# ใช้หน้าต่าง cmd ย่อ (Minimized) + npm run - ไม่ซ่อนแบบ CreateNoWindow ที่พังบนเครื่องนี้
function Start-WorkerWindow([string]$Title, [string]$WorkDir, [string]$NpmScript, [string]$Group) {
  if (-not (Test-Path -LiteralPath $WorkDir)) {
    throw "ไม่พบโฟลเดอร์งาน: $WorkDir"
  }
  $npm = Resolve-NpmCmd
  $sha = Get-WorkerBuildSha
  $logPath = Join-Path $LogDir ($(if ($Group -eq 'Scrape') { 'scrape-pool.log' } else { 'autopost.log' }))
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path $logPath -Value "`n==== $stamp start $Title via npm run $NpmScript ====`n" -Encoding UTF8

  # เขียน .cmd แล้ว start ชื่อหน้าต่างคงที่ - ปิดด้วย taskkill ตามชื่อได้
  $safeName = $Group.ToLower()
  $launcher = Join-Path $LogDir ("start-$safeName.cmd")
  $content = @(
    '@echo off'
    'chcp 65001 >nul'
    "cd /d `"$WorkDir`""
    "set WORKER_BUILD_SHA=$sha"
    'set WORKER_CAPABILITIES=post,preflight'
    'set AUTO_POST_DAILY_ENABLED=0'
    "title $Title"
    "echo [%date% %time%] starting $NpmScript>> `"$logPath`""
    "`"$npm`" run $NpmScript"
    "echo [%date% %time%] exited errorlevel=%errorlevel%>> `"$logPath`""
  ) -join "`r`n"
  [System.IO.File]::WriteAllText($launcher, $content, [System.Text.Encoding]::ASCII)

  # start "title" cmd /k launcher - เหมือน legacy ที่ใช้ได้
  $cmdExe = $env:ComSpec
  if (-not $cmdExe) { $cmdExe = 'cmd.exe' }
  # start "ชื่อหน้าต่าง" /MIN launcher.cmd - เหมือนปุ่ม start-workers เดิม
  $argLine = "/c start `"$Title`" /MIN `"$launcher`""
  $p = Start-Process -FilePath $cmdExe -ArgumentList $argLine -WorkingDirectory $WorkDir -WindowStyle Hidden -PassThru
  if (-not $p) {
    throw "สั่งเปิดหน้าต่าง $Title ไม่สำเร็จ"
  }

  if (-not (Wait-WorkerStarted -Group $Group -TimeoutSec 20)) {
    throw @"
เปิด $Title ไม่สำเร็จภายใน 20 วินาที
npm: $npm
launcher: $launcher
โฟลเดอร์: $WorkDir

ลองดูหน้าต่างย่อบน taskbar ชื่อ:
$Title
หรือกด 'เปิดไฟล์ log'
"@
  }
}

function Start-ScrapeWorker {
  Start-WorkerWindow -Title 'SO Scraper Pool (auto-scale)' -WorkDir $Root -NpmScript 'scraper:pool' -Group 'Scrape'
}

function Start-AutopostWorker {
  $autopost = Join-Path $Root 'autopost'
  Start-WorkerWindow -Title 'SO AutoPost Worker (worker:post)' -WorkDir $autopost -NpmScript 'worker:post' -Group 'Autopost'
}

# ---- UI ----
$form = New-Object System.Windows.Forms.Form
$form.Text = 'SO Workers'
$form.Size = New-Object System.Drawing.Size(460, 460)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedSingle'
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(248, 249, 251)
$form.Font = New-Object System.Drawing.Font('Segoe UI', 10)

$title = New-Object System.Windows.Forms.Label
$title.Text = 'เปิด / ปิด Worker'
$title.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 16)
$title.Location = New-Object System.Drawing.Point(24, 16)
$title.AutoSize = $true
$form.Controls.Add($title)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Text = 'เขียว = เปิดอยู่ | เทา = ปิดอยู่  (เปิดแล้วมีหน้าต่างย่อที่ taskbar)'
$subtitle.ForeColor = [System.Drawing.Color]::FromArgb(100, 110, 120)
$subtitle.Location = New-Object System.Drawing.Point(26, 48)
$subtitle.AutoSize = $true
$form.Controls.Add($subtitle)

function New-SwitchRow([string]$LabelText, [int]$Top) {
  $panel = New-Object System.Windows.Forms.Panel
  $panel.Location = New-Object System.Drawing.Point(24, $Top)
  $panel.Size = New-Object System.Drawing.Size(400, 88)
  $panel.BackColor = [System.Drawing.Color]::White
  $panel.BorderStyle = 'FixedSingle'
  $panel.Cursor = [System.Windows.Forms.Cursors]::Hand

  $label = New-Object System.Windows.Forms.Label
  $label.Text = $LabelText
  $label.Location = New-Object System.Drawing.Point(14, 10)
  $label.AutoSize = $true
  $label.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 11)
  $label.Cursor = [System.Windows.Forms.Cursors]::Hand
  $panel.Controls.Add($label)

  $status = New-Object System.Windows.Forms.Label
  $status.Text = 'กำลังตรวจ...'
  $status.Location = New-Object System.Drawing.Point(14, 36)
  $status.Size = New-Object System.Drawing.Size(220, 28)
  $status.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 14)
  $status.Cursor = [System.Windows.Forms.Cursors]::Hand
  $panel.Controls.Add($status)

  $hint = New-Object System.Windows.Forms.Label
  $hint.Text = ''
  $hint.Location = New-Object System.Drawing.Point(14, 64)
  $hint.AutoSize = $true
  $hint.ForeColor = [System.Drawing.Color]::FromArgb(120, 130, 140)
  $hint.Font = New-Object System.Drawing.Font('Segoe UI', 8)
  $hint.Cursor = [System.Windows.Forms.Cursors]::Hand
  $panel.Controls.Add($hint)

  # สวิตช์เลื่อน: ราง + ปุ่มกลม
  $track = New-Object System.Windows.Forms.Panel
  $track.Size = New-Object System.Drawing.Size(72, 36)
  $track.Location = New-Object System.Drawing.Point(310, 26)
  $track.BackColor = [System.Drawing.Color]::FromArgb(203, 213, 225)
  $track.BorderStyle = 'FixedSingle'
  $track.Cursor = [System.Windows.Forms.Cursors]::Hand
  $panel.Controls.Add($track)

  $thumb = New-Object System.Windows.Forms.Panel
  $thumb.Size = New-Object System.Drawing.Size(28, 28)
  $thumb.Location = New-Object System.Drawing.Point(4, 3)
  $thumb.BackColor = [System.Drawing.Color]::White
  $thumb.BorderStyle = 'FixedSingle'
  $thumb.Cursor = [System.Windows.Forms.Cursors]::Hand
  $track.Controls.Add($thumb)

  $switchText = New-Object System.Windows.Forms.Label
  $switchText.Text = 'OFF'
  $switchText.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 8)
  $switchText.AutoSize = $false
  $switchText.Size = New-Object System.Drawing.Size(72, 16)
  $switchText.Location = New-Object System.Drawing.Point(310, 64)
  $switchText.TextAlign = 'MiddleCenter'
  $switchText.ForeColor = [System.Drawing.Color]::FromArgb(100, 110, 120)
  $switchText.Cursor = [System.Windows.Forms.Cursors]::Hand
  $panel.Controls.Add($switchText)

  return @{
    Panel = $panel
    Title = $label
    Status = $status
    Hint = $hint
    Track = $track
    Thumb = $thumb
    SwitchText = $switchText
    IsOn = $false
    Enabled = $true
  }
}

$scrapeRow = New-SwitchRow 'ค้นหาผู้สมัคร (Scrap)' 78
$autoRow = New-SwitchRow 'โพสต์ Facebook (Autopost)' 178
$form.Controls.Add($scrapeRow.Panel)
$form.Controls.Add($autoRow.Panel)

$updateBtn = New-Object System.Windows.Forms.Button
$updateBtn.Text = 'อัปเดตโค้ด'
$updateBtn.Size = New-Object System.Drawing.Size(120, 34)
$updateBtn.Location = New-Object System.Drawing.Point(24, 286)
$form.Controls.Add($updateBtn)

$logBtn = New-Object System.Windows.Forms.Button
$logBtn.Text = 'เปิดไฟล์ log'
$logBtn.Size = New-Object System.Drawing.Size(120, 34)
$logBtn.Location = New-Object System.Drawing.Point(158, 286)
$form.Controls.Add($logBtn)

$refreshBtn = New-Object System.Windows.Forms.Button
$refreshBtn.Text = 'รีเฟรช'
$refreshBtn.Size = New-Object System.Drawing.Size(120, 34)
$refreshBtn.Location = New-Object System.Drawing.Point(292, 286)
$form.Controls.Add($refreshBtn)

$legacyBtn = New-Object System.Windows.Forms.Button
$legacyBtn.Text = 'เปิดแบบเดิม (มีหน้าต่าง)'
$legacyBtn.Size = New-Object System.Drawing.Size(400, 30)
$legacyBtn.Location = New-Object System.Drawing.Point(24, 326)
$form.Controls.Add($legacyBtn)


$footer = New-Object System.Windows.Forms.Label
$footer.Location = New-Object System.Drawing.Point(26, 364)
$footer.Size = New-Object System.Drawing.Size(400, 36)
$footer.ForeColor = [System.Drawing.Color]::FromArgb(100, 110, 120)
$footer.Text = "โค้ด: $(Get-WorkerBuildSha)"
$form.Controls.Add($footer)

$busy = $false
function Set-Busy([bool]$Value) {
  $script:busy = $Value
  $scrapeRow.Enabled = -not $Value
  $autoRow.Enabled = -not $Value
  $updateBtn.Enabled = -not $Value
  $refreshBtn.Enabled = -not $Value
  $cursor = if ($Value) {
    [System.Windows.Forms.Cursors]::WaitCursor
  } else {
    [System.Windows.Forms.Cursors]::Hand
  }
  $scrapeRow.Panel.Cursor = $cursor
  $autoRow.Panel.Cursor = $cursor
}

function Update-ToggleVisual($Row, [bool]$On) {
  $Row.IsOn = $On
  if ($On) {
    $Row.Status.Text = 'เปิดอยู่'
    $Row.Status.ForeColor = [System.Drawing.Color]::FromArgb(22, 163, 74)
    $Row.Hint.Text = 'กดสวิตช์เพื่อปิด'
    $Row.Track.BackColor = [System.Drawing.Color]::FromArgb(22, 163, 74)
    $Row.Thumb.Location = New-Object System.Drawing.Point(38, 3)
    $Row.SwitchText.Text = 'ON'
    $Row.SwitchText.ForeColor = [System.Drawing.Color]::FromArgb(22, 163, 74)
    $Row.Panel.BackColor = [System.Drawing.Color]::FromArgb(240, 253, 244)
  } else {
    $Row.Status.Text = 'ปิดอยู่'
    $Row.Status.ForeColor = [System.Drawing.Color]::FromArgb(148, 163, 184)
    $Row.Hint.Text = 'กดสวิตช์เพื่อเปิด'
    $Row.Track.BackColor = [System.Drawing.Color]::FromArgb(203, 213, 225)
    $Row.Thumb.Location = New-Object System.Drawing.Point(4, 3)
    $Row.SwitchText.Text = 'OFF'
    $Row.SwitchText.ForeColor = [System.Drawing.Color]::FromArgb(100, 110, 120)
    $Row.Panel.BackColor = [System.Drawing.Color]::White
  }
}

function Refresh-Status {
  if ($busy) { return }
  try {
    Update-ToggleVisual $scrapeRow (Test-WorkerRunning 'Scrape')
    Update-ToggleVisual $autoRow (Test-WorkerRunning 'Autopost')
    $footer.Text = "โค้ด: $(Get-WorkerBuildSha)  |  log: output\worker-logs"
  } catch {
    $footer.Text = "ตรวจสถานะไม่ได้: $($_.Exception.Message)"
  }
}

function Invoke-RowToggle($Row, [string]$GroupName) {
  if ($busy) { return }
  if (-not $Row.Enabled) { return }
  $wantOn = -not [bool]$Row.IsOn
  Set-Busy $true
  try {
    if ($wantOn) {
      $footer.Text = "กำลังเปิด $GroupName..."
      $Row.Status.Text = 'กำลังเปิด...'
      $Row.Status.ForeColor = [System.Drawing.Color]::FromArgb(37, 99, 235)
      [System.Windows.Forms.Application]::DoEvents()
      if ($GroupName -eq 'Scrap') { Start-ScrapeWorker } else { Start-AutopostWorker }
      $footer.Text = "เปิด $GroupName แล้ว"
    } else {
      $footer.Text = "กำลังปิด $GroupName..."
      $Row.Status.Text = 'กำลังปิด...'
      $Row.Status.ForeColor = [System.Drawing.Color]::FromArgb(37, 99, 235)
      [System.Windows.Forms.Application]::DoEvents()
      Stop-WorkerGroup $(if ($GroupName -eq 'Scrap') { 'Scrape' } else { 'Autopost' }) | Out-Null
      Start-Sleep -Milliseconds 800
      $footer.Text = "ปิด $GroupName แล้ว"
    }
  } catch {
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "$GroupName - เปิด/ปิดไม่สำเร็จ", 'OK', 'Error') | Out-Null
  } finally {
    Set-Busy $false
    Refresh-Status
  }
}

# ผูกคลิกทั้งแถว + สวิตช์
$scrapeClick = { if (-not $busy) { Invoke-RowToggle $scrapeRow 'Scrap' } }
$autoClick = { if (-not $busy) { Invoke-RowToggle $autoRow 'Autopost' } }
foreach ($ctrl in @($scrapeRow.Panel, $scrapeRow.Title, $scrapeRow.Status, $scrapeRow.Hint, $scrapeRow.Track, $scrapeRow.Thumb, $scrapeRow.SwitchText)) {
  $ctrl.Add_Click($scrapeClick)
}
foreach ($ctrl in @($autoRow.Panel, $autoRow.Title, $autoRow.Status, $autoRow.Hint, $autoRow.Track, $autoRow.Thumb, $autoRow.SwitchText)) {
  $ctrl.Add_Click($autoClick)
}

$legacyBtn.Add_Click({
  if ($busy) { return }
  $legacy = Join-Path $Root 'start-workers-legacy.bat'
  if (-not (Test-Path -LiteralPath $legacy)) {
    [System.Windows.Forms.MessageBox]::Show('ไม่พบ start-workers-legacy.bat', 'SO Workers', 'OK', 'Error') | Out-Null
    return
  }
  Start-Process -FilePath $legacy -WorkingDirectory $Root
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
} catch {
  $msg = $_.Exception.Message
  $stack = $_.ScriptStackTrace
  try {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
    [System.Windows.Forms.MessageBox]::Show(
      "$msg`n`n$stack",
      'SO Workers - เปิดแผงไม่สำเร็จ',
      'OK',
      'Error'
    ) | Out-Null
  } catch {
    Write-Host "SO Workers error: $msg"
    Write-Host $stack
    Read-Host 'กด Enter เพื่อปิด'
  }
  exit 1
}
