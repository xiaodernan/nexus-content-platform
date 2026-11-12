# ADR-0186：§FE-34 `/admin/access` `.am-*` 门面化——访问账（全局），窗口条 + 双 CSV 导出不动

- 状态：Accepted
- 日期：2026-11-12
- 关联：ADR-0185 · §188 M8 第三片 · `apps/web/test/admin-access-visual-style.test.ts` · `docs/evidence/fe-34-admin-access-facade/evidence.md`

## 背景

`/admin/access` 是 §188 M8 第三片欠的那格——全平台谁在扫库、哪一枚凭据是热点。
`page.tsx`（server）：窗口条（1/7/30 天白名单，坏值 parseApiAccessWindowDays 兜成 7）+
两张榜（热点凭据 / 热点端点，各取 TOP_N）+ 两个"不截断"的 CSV 导出链接。denied×2，AdminNav current="access"。

## 决定

1. **`.am-*` 族补件**：`.am-windowNav`/`.am-windowNavPush`（ml-auto 导出区）`.am-windowChipActive`/`.am-windowChipIdle`（选中/未选中，focus-visible 锚）`.am-strongText`（fg-1）`.am-linkImplicit`（inherit color + underline + focus-visible）。
   两张榜+empty 复用 `.am-audit`/`.am-auditTitle`/`.am-empty`/`.am-note`；表复用 `.tl-table`/`.tl-thRow`；denied×2/head/shell 复用 `.adm-*`。
2. **零行为恒等门**：`761cfec7…` 与 git HEAD 一致。
3. **判据**（12/12 绿）：server 组件门 · 两个 CSV export anchor 仍是 `a[href]`（§188 明写"不截断"）·
   template 三元 `am-windowChipActive/Idle` · 字面类全 adm/am/tl-* · 零裸 Tailwind · 类名闭环 ·
   零 hex · 零新增颜色 token · 新增 am-window* 全 kind · **SHA256 守恒** · 19 钩子守恒。

## 取舍

- 不动排序（owner/calls/lastSeen）、TOP_N 截断、CSV 内容字段。
- 不动 parseApiAccessWindowDays 回退语义；窗口条只有 a[href] 无 form。
- 不做截图：browser 不可用。

## 后果

`/admin/access` 加入门面矩阵。admin 剩余：observability / discover-cache（DiscoverPanel 也实现 .gw- 复用）。
