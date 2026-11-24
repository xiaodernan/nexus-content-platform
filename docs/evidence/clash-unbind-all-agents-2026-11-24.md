# 本机 Clash 绑定排查与解绑（2026-11-24）

用户要求：不再用 Clash Verge，检查本机所有 agent 软件有没有也绑了 Clash 端口，全部取消。

## 系统级代理（全部为「关/直连」）
| 层 | 结果 |
|---|---|
| Windows IE/LAN 代理 | `ProxyEnable=0`，`ProxyServer` 空 |
| WinHTTP 代理 | `netsh winhttp show proxy` → 直接访问（没有代理服务器） |
| User/Machine 作用域 `HTTP_PROXY`/`HTTPS_PROXY` | 均为空 |
| 当前 shell 进程 `HTTP_PROXY` | 空 |
| 7897 监听 | 无（Clash 进程已随环境重启退出） |

## Clash 自身配置（`AppData\Roaming\io.github.clash-verge-rev...\verge.yaml`，生效那份）
- `enable_tun_mode: false`（无 TUN 劫持）
- `enable_system_proxy: false`
- `enable_auto_launch: false`
- `enable_proxy_guard: false`
- `proxy_auto_config: false`
即 Clash 已经不劫持全局流量。`pac_file_content` 里虽写着 `PROXY 127.0.0.1:7897`，但 `proxy_auto_config: false` 且 `enable_system_proxy: false`，不生效，故**未改动**。

## 各 agent 软件配置扫描（硬编码 7897）
`.claude` / `.cursor` / `.cline` / `.copilot` / `.trae-cn` / `.cagent` / `.config/opencode` /
`.workbuddy`（含 `settings.json`、`cli-env`）——**均无** 7897 代理配置。

- `.codex` 命中的 7897 是 2026-11-21 的历史会话 jsonl（当时手动 curl 探针的命令记录），
  **不是生效配置**，不改（改了会破坏历史会话记录）。
- WorkBuddy 的 `logs/2026-11-24/*.log` 在 11:01–13:17 有大量
  `connect ECONNREFUSED 127.0.0.1:7897`（认证/MCP/上报/云配置）。
  它是 Electron 应用，读 Windows 系统代理；13:17 之后（系统代理关掉后）不再有新报错。
  → root cause 是系统代理被 Clash 短暂写回，不是 WorkBuddy 自己的代理配置。
- 一个残留 `python .scratch/focused-proxy.py` 进程（命令行含 PROXY）随环境重启已消失。

## 应用侧（本仓）
- `apps/ai-service/.env` 的 `HTTPS_PROXY/HTTP_PROXY/NO_PROXY` 三行此前已删除。
- 新增 `scripts/start-web-clean.mjs` + `npm run dev:web:clean` / `start:web:clean`：
  spawn 前删六种代理变量并设 NO_PROXY，防止从带 Clash 变量的 shell 继承。

## 最终实测
- 无代理直连 `https://github.com/` → 200
- `http://127.0.0.1:3100/` → 200（DB 容器 healthy 后）
- 系统代理、WinHTTP、env、7897 监听全部干净。

## 需用户手动完成（权限不足，我无法代做）
若再次打开 Clash Verge，它可能重新写回系统代理；不想它回来就从托盘彻底退出 `verge-mihomo.exe`。
之前我尝试 `Stop-Process` 被系统拒绝（权限不足）。

结论：本机没有发现其它 agent 软件硬编码绑定 Clash；WorkBuddy 的报错是系统代理层的连带影响，已随系统代理关闭而消除。
