# Live evidence — 观察站 AI 深读「形势 · 展望 · 下一步」2026-11-19 cont.232

> §九 管理员页「监控所有用户的统计数据、做分析和趋势预测，并根据这些数据给出下一步应该采取的深度优化措施」的落点升级 slice。

## 改动

- `apps/web/src/app/api/admin/observer/digest/route.ts`
  - system prompt 由「3-5 句讲下一步」改为固定三段：**形势**（2-3 句，现状，每句带数字）· **展望 · 7 天推断**（opens7d/opens30d 日均 × completionPct 外推，**必须显式标注「推断：…不是实测」**，给出悲观→乐观区间，每句带数字）· **下一步 · 优先级**（1-3 件，按先后顺序、每件引用数字与预期效果）
  - user 指令同步改为三段式；
  - digest 原字上限 900 → 1400（三段合计自然上浮）；
  - 服务机械校验不变（无数字 → 502 不展示 · DEMO MODE → 409 · 每 IP+观众 5/h · 24h LRU）。
- `apps/web/src/components/ObserverDeepRead.tsx` COPY 更新（idle 句式），SHA 重钉 `8acd502…`
- `apps/web/src/app/globals.css` `.observer-aidr-digest` 增加 `white-space: pre-wrap`（三段换行可见）
- fe-gates 147/147 · 1353/1353 全绿

## 线上实测（next start :3461 + ai-service :3200 · 口令 123 unlocked · 真 provider）

| 调用 | locale | cached | 输出（节选） |
|---|---|---|---|
| #1 | zh | false | **形势**：近 7 天新增用户 1448，总用户 3429……近 7 天打开 52 次，近 30 天打开 97 次，30 天平均完成率为 71.23%，游戏完成 3 次、作品完成 16 次…… |
| #2 | zh（同输入） | **true（LRU 命中）** | 同上原样回声 |
| #3 | en | false | **Situation**: Total users are 3,429, including 1,448 new users in the last 7 days… **Forecast · 7-day inference: Inference, not measurement: pace-based range of 23–52 opens.** … |

- 关键达标：不再出现之前轮次中「展望段被静默跳过」的问题；推断被强制标注；三段都带真实数字；en/zh 分输出（不混写）。
- **注意**：本次 AI 进程在首次探针中途死亡（Windows PID 40864 消失，无日志——可能是内存锯齿回收）；重启后全链 200，证据记录如实写明，未伪造「一次成」。
