# pair.ps1 — ربط البوت برقم WhatsApp للمرة الأولى (امسح الـ QR)
$botRoot = Split-Path -Parent $PSScriptRoot
Set-Location $botRoot

Write-Host ''
Write-Host '============================================================'
Write-Host '  Link COMANDO WhatsApp Bot to your personal WhatsApp     '
Write-Host '============================================================'
Write-Host ''
Write-Host 'Scan the QR code from your phone:'
Write-Host '  WhatsApp -> Settings -> Linked Devices -> Link a Device'
Write-Host ''
Write-Host 'Security: never share this QR — anyone who scans it controls your session.'
Write-Host ''
npm run pair
