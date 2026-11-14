# §A11Y-4 · /admin 管理台首页——十处的总入口（2026-11-12）

## 补的是什么

`/admin` 之前**没有 index route**。管理员或访客打开 `/admin` 拿到的是根 not-found——
内容平台每一处门面都言之有物，唯独这一格说自己是 404。十处真实入口（账号/复核/市场/审计/
实时/限流/访问账/观测/网关/缓存）早就各自成型，只缺一张总脸。本页就是那张脸。

## 改了什么（三样，其余不碰）

1. **`apps/web/src/components/AdminNav.tsx`**：LINKS 前插 `{ key: 'home', href: '/admin', label: '管理台' }`。
   `AdminSection` 类型自动扩。就这一行——十个既有入口的 `data-admin-link`、
   `aria-current`、下限（§A11Y-3 的 28px 胶囊）全保留。
2. **`apps/web/src/app/admin/page.tsx`**（新）：纯导航 server component。
   与 `/admin/*` 一致的门序（session → `role !== 'admin'` denial）——未登录/非 admin 只给姓名、不外泄任何读数。
   SEO 钩子：`data-admin-home-root` / `data-admin-home-kicker` / `data-admin-home-cards` / `data-admin-home-card=<slug>`。
   十张卡各自一段 ≤ 50 字的**老实话**；卡内无假数据、无百分比占位、无 fetch、无写路径（零行为）。
3. **`apps/web/test/admin-home-style.test.ts`**（新，10 例）：与 repo visual-style 门同型
   （去注释代码判据）——零 client 指令、零 fetch/action/form、两种 denial 钩在、十处 slug/href
   精确成组、`var(--nexus-*)` 全部 token 声明过、零 hex、transition 仅 --nexus-motion-fast、
   focus-visible 环在卡上、诚实文案门。

## 截图（live dev server，本机 3100，真跑）

dev DB 只有一个 admin 夹具（`obs-admin+fixture@nexus.test`）。`scripts/capture-admin-home.mts`
以它登录（同 repo 既有 e2e 夹具；无任何写入），然后直访 `/admin`：

| 图 | 说明 |
|---|---|
| `dark.png` | 深色：十卡网格 1280、磨砂胶囊导航带新「管理台」home 态、左上 mono 小标 + 大 H1 + 说明段 |
| `light.png` | 浅主题同构：底/字/分割线全部 token 翻转，卡面与 focus 对比不掉 |
| `narrow-390.png` | 390px 单列堆叠；`document.documentElement.scrollWidth - clientWidth === 0`（0 溢出，脚本断言） |
| `forced-colors.png` | `forcedColors: 'active'` 真 Chrome 媒体查询：Current 胶囊可辨、卡面 border 仍说得清 |

卡片 10/10 渲染（脚本 count），顺序/锚点锚定为 `账号与角色 / 复核台 / 市场工单 / 审计事件 / 实时总线 /
限流闸 / 访问账 / 观测 / 网关态势 / 发现页缓存`——与测试断言同一份数组。

## 判分面

- `npx tsc --noEmit -p apps/web/tsconfig.json` exit 0
- `npx eslint src/app/admin/page.tsx src/components/AdminNav.tsx test/admin-home-style.test.ts --max-warnings=0` exit 0
- `npx vitest run apps/web/test/admin-home-style.test.ts` **10/10**
- `/admin` 经真 Chrome 登录 → 真渲染（以上四张图）

## 诚实边界

- 本页**零读取零写入**：不管平台现在处于什么态，这一张只指路，不下判决；要真账先点「观测」。
- 截图不是"平台全貌"——只证明 /admin 首页在给定夹具下可达、可登录、可点、对比与 focus 环有效。
- axe 级 a11y 判定仍归 `a11y-internal.spec.ts`；本片不重复那扇门。
- AdminNav 多出一格后，`aria-current` 只有 /admin 自己用；其余十处不改判据。
- 图片取证用 live 服务器（3100）——没有把 e2e 结果、假渲染掩盖成真截图。
