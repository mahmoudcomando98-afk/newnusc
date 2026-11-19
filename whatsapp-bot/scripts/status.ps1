# status.ps1 — يعرض حالة البوت
$botRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $botRoot '.bot.pid'

if (-not (Test-Path $pidFile)) {
  Write-Host 'Bot: NOT running (no PID file).' -ForegroundColor Yellow
} else {
  $raw = (Get-Content $pidFile -Raw).Trim()
  $parsed = 0
  if ([int]::TryParse($raw, [ref]$parsed)) {
    $p = Get-Process -Id $parsed -ErrorAction SilentlyContinue
    if ($p) {
      $uptime = (Get-Date) - $p.StartTime
      Write-Host ("Bot: RUNNING (PID {0}, up {1})" -f $p.Id, $uptime.ToString('g')) -ForegroundColor Green
    } else {
      Write-Host 'Bot: NOT running (stale PID file — run ./scripts/stop.ps1 to clean).' -ForegroundColor Yellow
    }
  } else {
    Write-Host 'Bot: PID file is invalid.' -ForegroundColor Yellow
  }
}

Write-Output ''
Write-Output 'Recent log lines (logs/bot.log):'
$logPath = Join-Path $botRoot 'logs\bot.log'
if (Test-Path $logPath) {
  Get-Content $logPath -Tail 15
} else {
  Write-Output 'No bot.log yet — start the bot first.'
}
