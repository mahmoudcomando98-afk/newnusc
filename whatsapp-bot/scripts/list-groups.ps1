# يعرض كل المجموعات اللي عندك بارقمك — للتعرف على ID الجروب
$botRoot = Split-Path -Parent $PSScriptRoot
Set-Location $botRoot
npm run list-groups
