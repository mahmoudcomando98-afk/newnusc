# join-group.ps1 — الانضمام للجروب عبر رابط الدعوة ثم يكتب الـ ID في .env تلقائيًا
$botRoot = Split-Path -Parent $PSScriptRoot
Set-Location $botRoot
npm run join-group
