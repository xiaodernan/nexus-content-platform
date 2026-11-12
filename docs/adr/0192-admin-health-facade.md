# ADR-0192：§FE-40 `/admin/health` 管理台健康总览 `.hd-` 门面化——五层快照一次成，统一只读断言

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-26（ADR-0178 admin 门面系列起点）· §FE-36（ADR-0188 admin 收官）· `apps/web/test/admin-health-visual-style.test.ts` · `apps/web/test/admin-health-aggregate.test.ts` · `docs/evidence/fe-40-admin-health-facade/evidence.md`

## 背景

管理台没有一格回答"这一台（或这套）实例此刻真的连着吗"。用户长期要的是**前后端协同 + Redis/计网 + 数据库性能 + 缓存合理**这几件事；§SC-81 正是那一格：AI Service · java-domain-service · Gateway · Redis · Postgres 五层一次端出，谁都不能假装成"都好"——拿不到的一定说未测到，而不是 down（§159）。

## 决定

1. **新增 `/admin/health`**（server 组件）+ `/api/admin/health`（role=admin, no-store, 只读）：
   五层并行探测（AI healthz capability · java actuator/health UP · gateway actuator/health UP · Redis PING · Postgres SELECT 1），
   每层独立超时 ≤2.5s；拿不到留"未测到"字样。**JSON 快照当场渲染不等 DB 写**（不写审计、不改缓存）。
2. **新增 `.hd-*` 门面族**（globals.css，`.cd-` 之后）：`.hd-overallOk/.hd-overallBad/.hd-list/.hd-row/.hd-left/.hd-name/.hd-dot/.hd-dotOk/.hd-dotBad/.hd-verdict/.hd-detail/.hd-measured`。
   - overallOK/BAD 两态 1px success/warn color-mix 边，内容一律中性 fg-1（AA）。
   - dot 只有 success/warn；verdict 文案一律 fg-3；detail 是 mono + tabular-nums。
   - 零 @media / 零动效 / 零新增颜色 token。
3. **零行为恒等**：denied×2 分支与现状一字不动；role 闸门一字不动；AdminNav 新增 §health 叶子（12 入口），admin 总览新增 §health 卡（11→12 卡）。
4. **判据**：
   - 新增 `admin-health-aggregate.test.ts`（4/4）——只验 probeAllTiers 的"判据翻译"，不依赖真实网络/DB/Redis 进程。
   - 新增 `admin-health-visual-style.test.ts`（12/12）——.hd-/.adm-* 两类闭环、零 hex、token 全声明、focus-visible 锚、dot muted 文字。
   - 旧判据更新：admin-home-style（→11 处/11 卡）、admin-hub-visual-style（→12 入口 + page 红act 常量 91884ec4… + nav redact 常量 861d0804…）。
5. **probe 出口网对象**：/admin/health 是只读面板——写任何一格（改 5s 缓存、改轮询频率、给 tier 整除因子）都需要第二条 ADR。

## 取舍

- 不做 hover 高亮、不引入 chart/SVG——快照不值得。
- 不探测 real Java port 因为 JAVA_HOME 在 docker 内；Java 服务此机实测已下线（只 8081 上通 gateway actuator——看了实况，端口活着）。
- 浏览器截图未做（browser 不可用）：/admin/health 页面 HTML 未出；截图留 next 可上网截图窗口。

## 后果

`/admin/health` 加入门面矩阵。admin 矩阵现在 12 张卡（+ §SC-81 健康总览）。未 push。
