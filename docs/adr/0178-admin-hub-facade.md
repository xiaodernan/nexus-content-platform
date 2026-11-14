# ADR-0178：§FE-26 `/admin` 总览 + `AdminNav` `.adm-` 门面化——磨砂胶囊导航与十卡矩阵，ITEM 模板常量精确雕刻

- 状态：Accepted
- 日期：2026-11-12
- 关联：§A11Y-3（AdminNav 磨砂胶囊升维）· §A11Y-4（FE 管理台首页，前置判据 `admin-home-style.test.ts`）· `apps/web/test/admin-hub-visual-style.test.ts` · `docs/evidence/fe-26-admin-hub-facade/evidence.md`

## 背景

`/admin` 是管理台十处入口的总览页（§A11Y-4：当时补的是「访客/管理员打开 /admin 被根 not-found
打回」的缺口）：纯导航、零读库、零发请求、不替任何决策。此前两处都是全裸 arbitrary atom——
`AdminNav.tsx` 用模块级 `ITEM` 常量把同一份 class 拼给 11 个链接（`${ITEM}` 模板拼接两种姿态），
`admin/page.tsx` 十张磨砂玻璃卡 + denied×2 分支。本片只做皮：删常量、并入 CSS。

## 决定

1. **新增 `.adm-*` 门面族**（globals.css，`.pv-` 段之后）：`.adm-denied/.adm-deniedTitle/.adm-deniedText/
   .adm-shell/.adm-head/.adm-kicker/.adm-title/.adm-lede/.adm-cards/.adm-card/.adm-slug/.adm-cardTitle/
   .adm-note/.adm-arrow/.adm-foot`（首页矩阵）与 `.adm-nav/.adm-navItem/.adm-navItemActive/.adm-navDot`
   （导航）。双主题 token；零 hex；零新增颜色 token；渐变实底只准用
   `linear-gradient(135deg, var(--nexus-color-accent-2), var(--nexus-color-info))`（两主题皆 ≥10.9:1，§A11Y-3 实测）。
   - **`@media (min-width: 40rem)` 2 列、`@media (min-width: 64rem)` 3 列**逐字平移 Tailwind v4 断点
     （sm=40rem、lg=64rem）；本段是 FE 系列中唯一（与 FE-16 `.notif-grid2` 相同语境）含 @media 的门面——
     删除它们会真的丢响应式，不是「一致」是「回退」。零 transition-all；时长一律 `var(--nexus-motion-fast)`。
   - **`backdrop-filter: blur(12px)`** 逐字平移（§A11Y-3 玻璃化）；不引入 reduced-motion 特例
     （blur 无时间性）。
   - 卡 hover/focus 沿用 `.adm-card:hover` + `:focus-visible`（2px accent-2-ink 环）；
     标题/箭头 hover 高亮改用后代选择器（`.adm-card:hover .adm-cardTitle`/`.adm-arrow`），
     去掉原 `group`/`group-hover:` 工式标记。
2. **唯一的行为面删除：`AdminNav.tsx` 未再使用的 `const ITEM` 模板常量**（3 行，§A11Y-3 遗留的
   单一真值化前身）。它并入 `.adm-navItem`/`.adm-navItemActive` 两条定义——删它不是行为改动是垃圾回收；
   判据把它钉成「雕刻锚」：HEAD 原文必须精确包含该块，雕刻后 redact-hash 必须与现状相等。
3. **零行为门（双文件，统一 pipeline）**：redact = `className="…"`/`className={\`…\`}`/`className={…}`
   → `@` 归一 + 注释占位。
   - `page.tsx`：`2731ed49…` 恒等于 HEAD 原样（这文件本片只换类、没碰任何一字节别的）；
   - `AdminNav.tsx`：`a1c6b390…` 恒等于「HEAD 原样删除 ITEM 块后的值」；jsdoc 的两处 truthfully
     措辞修正（`ITEM` → `.adm-navItem`）被注释占位吸收。
4. **判据**（15/15 绿）：denied×2 + role 闸门 · LINKS 11 入口 + `data-admin-link` 全集恒等于 LINKS 键集 ·
   home 十卡 slug 全集 · 字面类全 adm-* · 零裸 Tailwind · 类名闭环 · 成规模（19）· 零 hex ·
   token 全在（渐变 token 也进）· 零新增颜色 token · transition 时长全 motion-fast ·
   backdrop-blur/@media 逐字平移 · focus-visible ×2 · **双文件双门（page 原样、nav 雕刻）**。
   **旧判据 `admin-home-style.test.ts` 就地迁移而非删除**——三条钉在 literal 原子类的门
   （hex/transition/focus-visible）改为锚 `.adm-` 段，保留七条原判据原样。

## 取舍

- 不动 AREAS/LINKS 名单、aria-current、守卫语义、"两种拒绝都给姓名"的文案。
- 不动 §A11Y-3 的「下限 28px」决策：`.adm-navItem` 与 Active 变体同高 1.75rem。
- 不做截图：browser 不可用；旧注释引用的 `capture-admin-home.mts` 目标 data 钩子，不受皮线影响。

## 后果

`/admin` 总览页加入门面矩阵。admin 其余 18 文件（realtime/rate-limit/observability/access/
gateway/discover-cache/users×4/marketplace×2/moderation×2/audit）按后继 §FE-27..36 收尾。
