# اختبار إرسال رسالة للجروب المستهدف
$botRoot = Split-Path -Parent $PSScriptRoot
Set-Location $botRoot
npm run test-send
