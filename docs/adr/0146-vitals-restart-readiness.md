# ADR 0146 — CI 宿主机平面：verify:vitals 重启后的 §3 等待真正可查询（cont. 115）

- 状态：ACCEPTED（2026-11-14）
- 范围：`docs/evidence/m9/service-vitals-proof.mjs`（§3 restart-readiness）、NEXUS CI quality job
- 前置：cont. 102 / ADR 0138（同平面同类问题：JVM 预热偏移，tolerance 3s→15s）、cont. 103（同一跑团 118/119，仅 verify:vitals 红）

## 背景

3233c93 的 Studio CI quality 作业失败（118/119 green，1 red = `verify:vitals`）：
`psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed:
FATAL: the database system is starting up`。

现场追溯：§1 启动 throwaway PostgreSQL 后，proof 用真查询（`psql SELECT 1`）做 `until(...)` 门控——
这一段是对的（§1 注释明说"pg_isready 会在 starting up 时答 0，psql 不会"）。
但 **§3 停库再启库之后只做了一次 TCP canConnect**，然后直接 psql 读 audit_entry 等三张表。
主机端口在 pg 的 "starting up" 窗口内就已经接受 TCP 连接——所以门闩放行，随即 FATAL。

## 决定

1. **§3 复用 §1 的真实查询门控**：`until(() => real psql SELECT 1 returns 0, tries 60, gap 1000ms)`，
   放行之后再走原来的 canConnect 断言与 psql 读数。这一刀只改"先等到能问再问"这一件事，
   不改任何断言内容、不改任何读数——§3 原来的证明语义（vitals 不写任何库）原样保留。
2. **不改 runner、不改镜像、不改其他 118 项 proof**。§3 才是唯一失败位，按同门作者同一纪律修。
3. **诚实记录**：本次故障是宿主机平面时序小概率事件（同第二天前 cont. 102 同类）；
   修的是"§3 少一道 §1 已经有的门"，不是系统性 flaky。本 ADR 存证：连续两天的两起 hosted-plane 小概率
   均为时序问题，均有对应本项目内修，未用 --no-verify、未放宽任何断言内容。

## 验证

- 本机复现语义：§1/§3 的同构 `until` 真查询跑法已存在（§1 行 206-210 未动），§3 现在同构；
- 改动文件：`docs/evidence/m9/service-vitals-proof.mjs`（+8 行，纯 ASCII 注释，无 BOM）；
- Studio CI 会在本 ref 重新运行完整 119 项门——结论以 runner 为准，红绿不预判。

## 仍欠（诚实记录）

1. 如果 §3 再次红，且错误仍然是"starting up"，说明 60×1000ms 仍然不够——届时再论证而不是放开。
2. 这台宿主机平面本身的冷启动时间分布未成体系测量过；CI 黄/红两次都在 § 之间出现
   （一次 JVM 预热，一次 pg 启动），说明这个平面的"启动中"窗口本来就存在，只是没被计入过。
