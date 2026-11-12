# ADR-0188：§FE-36 `/admin/discover-cache` `.dc-*` 冻结——wrapper atom 迁入 `.am-*`，SC-43 族不动

- 状态：Accepted
- 日期：2026-11-12
- 关联：ADR-0184 · §SC-43/44/45/46/47 · `apps/web/test/admin-discover-cache-visual-style.test.ts` · `docs/evidence/fe-36-admin-discover-cache-facade/evidence.md`

## 背景

`/admin/discover-cache` 是 §SC-43 的诊断入口：发现页按 viewer 分键缓存（跨实例 Redis 失效总线）的进程内读数。
两张文件：`page.tsx`（denied×2 + shellXl + titleLg 复用）+ `DiscoverPanel.tsx`（client，4s 轮询，
visibilitychange 封印，bus:null 中立档，hitRate 分母 0 说法，保留旧帧不清空）。SC-43 `.dc-*`/`.gw-*` 十一原语冻结。

## 决定

1. **`.am-*`/`.dc-*` 族补小件**：`.am-subNote`（12px fg-2）· `.dc-ledgerLabel`（颜色 only）· `.dc-busHeadline`（14px 600 fg-1，复刻 SC-40 舞台标题体）。
   `.gw-skeleton` 自带 height: 5.75rem（同 §FE-32；markup 不再携带 h-[92px]）。
2. SC-43 的 `.gw-*`/`.dc-*`（`gw-grid`/`gw-card`/`dc-busCard`/`dc-ledgerRow`…）冻结不动。
   `.dc-ledgerRow` 属性原样（flex baseline/between/border-top）。
   `gw-ident`/`am-mutedText` 由 `{mono ? 'gw-ident' : 'am-mutedText'}` 三元直接拼——不加中间件、不铺无用类。
3. **零行为恒等门**：page `2f1974be…`，panel `25cdf8a1…` 与 git HEAD 一致；redact 前 EOL 归一。
4. **判据**（12/12 绿）：server 组件门 · client 指令 + 4s 轮询进门 · 字面类全 gw/dc/adm/am/ar-* ·
   零裸 Tailwind · 类名闭环 · `.gw-*`/`.dc-*` 十一原语冻结 · 零 hex · token 全声明 ·
   `.dc-ledger*` 有定义 · **双文件 SHA256 守恒** · 23 钩子守恒（SC-43 计 21 + root/scope 2）。

## 取舍

- 不动 bus:null 的中立档、不改 hitRate 分母 0 的说法、不改 POLL_MS、不改 wave/epoch/stale/timings 窗口。
- 不引入 hover/transition——SC-43 本就无动效，animatenone 钉在 `.gw-card,.gw-dotDown,.gw-skeleton,.dc-busCard`。
- 不做截图：browser 不可用。

## 后果

`/admin/discover-cache` 加入门面矩阵。**admin 全部 20 文件全量门面化完成**：hub/access/audit/discover-cache/gateway/marketplace/
moderation/observability/rate-limit/realtime/users×4 + 其余——每片一把静态门、一把 SHA256 行为恒等保险。
