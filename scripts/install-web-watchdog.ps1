# Nexus web 守护计划任务（self-hosted，用户级，无需管理员）
#
# 原理（2026-11-25 实测定型）：让计划任务本身**前台运行** next dev，而不是在 node 脚本里
# detached spawn —— 后者在计划任务上下文里，子进程随任务结束被终止，实测拉不起来
# （WEB_RECOVER_FAILED）。任务进程即服务进程，不会被"任务结束"杀掉。
# MultipleInstancesPolicy=IgnoreNew 保证只有一个实例：服务在跑时新 tick 因端口占用退出（无副作用），
# 服务挂了则下一个 tick 把它拉起并持续运行。每 5 分钟一次。
#
# 端口：3101 = 本仓 dev server。3100 是被并行线 next start（旧生产构建）占用的，别守护它。
# 当前脚本写死 3101；要改端口请同时改 scripts/watchdog-start-dev.cmd 的 -p 参数。
#
# 安装（普通 PowerShell 即可，不用管理员）：
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-web-watchdog.ps1
# 卸载：
#   schtasks /Delete /TN nexus-web-watchdog /F

$root = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $root 'scripts\watchdog-start-dev.cmd'
if (-not (Test-Path $runner)) { throw "找不到 $runner" }

$name = 'nexus-web-watchdog'
schtasks /Query /TN $name > $null 2>&1
if ($LASTEXITCODE -eq 0) {
  schtasks /Delete /TN $name /F > $null 2>&1
  Start-Sleep -Seconds 1
}
$tr = 'cmd /c "' + $runner + '"'
schtasks /Create /TN $name /TR $tr /SC MINUTE /MO 5 /F > $null 2>&1
if ($LASTEXITCODE -ne 0) { throw "schtasks /Create 失败，退出码 $LASTEXITCODE" }
Start-Sleep -Seconds 1
schtasks /Query /TN $name > $null 2>&1
if ($LASTEXITCODE -ne 0) { throw "安装失败：schtasks /Query 退出码 $LASTEXITCODE" }
Write-Output "INSTALLED $name every 5 min (foreground next dev) -> $runner"
