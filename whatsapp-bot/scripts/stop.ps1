# stop.ps1 — إيقاف البوت
$botRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $botRoot '.bot.pid'

if (-not (Test-Path $pidFile)) {
  Write-Host 'No PID file — bot is probably not running.' -ForegroundColor Yellow
  exit 0
}

$raw = (Get-Content $pidFile -Raw).Trim()
$parsed = 0
if ([int]::TryParse($raw, [ref]$parsed)) {
  $proc = Get-Process -Id $parsed -ErrorAction SilentlyContinue
  if ($proc) {
    Stop-Process -Id $proc.Id -Force
    Remove-Item $pidFile -Force
    Write-Host "Bot stopped (PID $($proc.Id))." -ForegroundColor Green
  } else {
    Write-Host "Bot was not running (PID $parsed not found)." -ForegroundColor Yellow
    Remove-Item $pidFile -Force
  }
} else {
  Write-Host 'PID file is invalid — removing it.' -ForegroundColor Yellow
  Remove-Item $pidFile -Force
}
