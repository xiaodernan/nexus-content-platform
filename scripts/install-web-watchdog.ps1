# Nexus web 守护计划任务（self-hosted，用户级，无需管理员）
# 背景：环境/会话重启会杀掉 next dev，导致访问 3100 报 ECONNREFUSED；
#       与 Clash 无关（本机代理层已清）。这个任务每 5 分钟自检一次，
#       只在服务确实没起来时用无代理方式拉起，平时 probe 一下即退出。
#
# 安装（普通 PowerShell 即可，不用管理员）：
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-web-watchdog.ps1
# 卸载：
#   schtasks /Delete /TN nexus-web-watchdog /F
#
# 用 schtasks.exe 而非 New-ScheduledTaskAction：后者会把含引号的 -Argument 吞成空
# （实测），schtasks 能正确接收中文工作目录里的 .cmd 路径。

$root = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $root 'scripts\web-watchdog.cmd'
if (-not (Test-Path $runner)) { throw "找不到 $runner" }

$name = 'nexus-web-watchdog'
# 只有任务确实存在时才删，删完等一拍再建（delete/create 立即连着做会撞状态）
schtasks /Query /TN $name > $null 2>&1
if ($LASTEXITCODE -eq 0) {
  schtasks /Delete /TN $name /F > $null 2>&1
  Start-Sleep -Seconds 1
}
# cmd /c 包装脚本用 %~dp0 相对定位，纯 ASCII，避开中文与引号嵌套
$tr = 'cmd /c "' + $runner + '"'
schtasks /Create /TN $name /TR $tr /SC MINUTE /MO 5 /F > $null 2>&1
if ($LASTEXITCODE -ne 0) { throw "schtasks /Create 失败，退出码 $LASTEXITCODE" }
Start-Sleep -Seconds 1
schtasks /Query /TN $name > $null 2>&1
if ($LASTEXITCODE -ne 0) { throw "安装失败：schtasks /Query 退出码 $LASTEXITCODE" }
Write-Output "INSTALLED $name every 5 min -> $runner"
