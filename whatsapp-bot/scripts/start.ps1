# start.ps1 — يشغل البوت
# الاستخدام: .\scripts\start.ps1        (في الخلفية)
#            .\scripts\start.ps1 -Fg    (في المقدمة — Ctrl+C للإيقاف)
param([switch]$Fg)

$botRoot = Split-Path -Parent $PSScriptRoot
Set-Location $botRoot

# تأكد إن الحزم مثبتة
if (-not (Test-Path (Join-Path $botRoot 'node_modules'))) {
  Write-Host 'Installing dependencies...' -ForegroundColor Yellow
  npm install
}

$pidFile = Join-Path $botRoot '.bot.pid'
if (Test-Path $pidFile) {
  $oldPid = 0
  if ([int]::TryParse((Get-Content $pidFile -Raw).Trim(), [ref]$oldPid)) {
    $p = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
    if ($p) {
      Write-Host "Bot already running (PID $oldPid). Stop it first with .\scripts\stop.ps1" -ForegroundColor Red
      exit 1
    }
  }
  Remove-Item $pidFile -Force
}

if ($Fg) {
  # في المقدمة — Ctrl+C للإيقاف
  npm run start
} else {
  $logDir = Join-Path $botRoot 'logs'
  New-Item -ItemType Directory -Force $logDir | Out-Null
  $logPath = Join-Path $logDir 'bot.log'
  $errPath = Join-Path $logDir 'bot.err.log'
  $proc = Start-Process -FilePath 'node' -ArgumentList 'src/index.js start' -WorkingDirectory $botRoot -WindowStyle Hidden -RedirectStandardOutput $logPath -RedirectStandardError $errPath -PassThru
  $proc.Id | Out-File -FilePath $pidFile -Encoding ascii -NoNewline
  Write-Host "Bot started in background. PID = $($proc.Id)" -ForegroundColor Green
  Write-Host "Logs: $logPath" -ForegroundColor Cyan
  Write-Host 'To stop: .\scripts\stop.ps1' -ForegroundColor Cyan
}
