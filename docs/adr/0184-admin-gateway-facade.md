# ADR-0184：§FE-32 `/admin/gateway` `.gw-*` 结构冻结——wrapper/layout atom 迁入 `.am-*` 族，SC-40 原语不动

- 状态：Accepted
- 日期：2026-11-12
- 关联：ADR-0182 · §SC-40（网关态势）· `apps/web/test/admin-gateway-visual-style.test.ts` · `docs/evidence/fe-32-admin-gateway-facade/evidence.md`

## 背景

`/admin/gateway` 是 §SC-40 的网关态势页：`page.tsx`（server，denied×2 + AdminNav）+ `GatewayPanel.tsx`
（client，4s 轮询，visibilitychange 暂停，失败不清空上一帧）。其视觉原语 `.gw-*` 已由 §SC-40
自带（`gw-grid`/`gw-card`/`gw-dot*`/`gw-pill`/`gw-row`/`gw-gapItem`/`gw-mono`/`gw-skeleton`）。
本片只清掉**外层布局/排版**类的字面裸 atom（`flex`/`gap-5`/`max-w-[1180px]`…），
把它们迁入 `.am-*` wrapper/layout 族；SC-40 九种原语原样保留。

## 决定

1. **`.am-*` 族补排版件**：`.am-shellXl`（73.75rem/gap-5）· `.am-titleLg`（text-24 semibold/tracking-tight）·
   `.am-chipRow`（列 pill 行）· `.am-warnNote`（12px warn-ink）· `.am-stack`/`.am-stackSm`/`.am-stackXl`
   （flex-col gap-1/1/5）· `.am-sectionHeadSm`（13px semibold fg-2）· `.am-rowHead`（11px fg-3）·
   `.am-mutedText`（fg-2）；`.gw-ident`/`.gw-ident2`（mono+tabular-nums+fg-1/fg-2）。
   `.gw-skeleton` **自带 height: 5.75rem**（markup 不准再写 `h-[92px]`）。
2. **`gw-root` marker class 删除**（尾随 `am-shellXl`，`.gw-root` 本来就没有对应规则，是死标记）。
3. **零行为恒等门**：`page.tsx` `be946472…`、`GatewayPanel.tsx` `7922f441…` 与 git HEAD 一致；
   redact 前先做 EOL 归一（\r\n→\n）——panel 在工作树里是 CRLF（index text=auto eol=lf 下的本地漂移）。
4. **判据**（13/13 绿）：server 组件门 · client 指令 + 4s 轮询封印进门 · 字面类全 gw/adm/am-* ·
   零裸 Tailwind · 类名闭环 · `.gw-*` 九原语冻结（ident/skeleton 有对应行为门）·
   零 hex（SC-40 允许 token-mix 而禁写死 hex）· token 全声明 · **双文件 SHA256 守恒** · 钩子守恒。

## 取舍

- 不动 `visibilitychange` 封印、POLL_MS、pollAllowed 判据、GatewaySnapshot 形状、poll-logic。
- 不动 `gateway-view.ts` 纯判据（既有 54 例全绿）。
- 不引入横滚 region：本页无宽表格，不需要键盘可达横滚。
- 不做截图：browser 不可用。

## 后果

`/admin/gateway` 加入门面矩阵。admin 剩余：access / observability / rate-limit / discover-cache。
