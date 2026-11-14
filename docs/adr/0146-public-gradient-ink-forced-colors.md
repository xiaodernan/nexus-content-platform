# ADR-0146：公开门面渐变墨字标题的高对比度回退——真 Chrome 证伪后的跨 UA 防御性加固

- 状态：已采纳（2026-11-11，§A11Y-1，承接 FE-1~FE-8 / ADR-0123 六红线）
- 关联：ADR-0123（FE 视觉六红线：零新增颜色 token / 全走 tokens.css + color-mix / 零写死 hex / 双主题 AA / prefers-reduced-motion / focus-visible）、
  `apps/web/src/app/globals.css`（本片唯一生产改动：一条 `@media (forced-colors: active)` 回退块）、
  `apps/web/test/forced-colors-style.test.ts`（本片新增，静态不变式）、
  `e2e/forced-colors.spec.ts` + `e2e/forced-colors.config.ts` + `e2e/forced-colors-probe.mjs`（本片新增，真浏览器那一寸与证伪探针）
- 触发（user 长期点名）：**前端美观/魅力登峰造极 + 前后端协同**里被忽略的一寸——可访问性。公开门面矩阵全部升完后，堵上"高对比度下透明字标题"这条跨 UA 隐患。

## 背景

FE-1~FE-8 把全站公开门面（discover / marketplace / home / /search / 创作者主页 / 公开作品页 / 公开试玩页 / 公开分镜页）逐一升成门面化视觉，8 个标题统一用
`color: transparent` + `background-clip: text` 做渐变墨字：`.dv-title`/`.mk-title`/`.hp-heroTitle`/`.se-title`/`.pf-name`/`.pb-title`/`.pp-title`/`.ss-title`。
常规（浅/深）双主题下这 8 个标题都有 AA 对比度；但 `forced-colors: active`（Windows 高对比度、用户自定义强制配色）下，`color: transparent` 的渐变字会不会整片消失？
本片**先量再治**——不凭想象力编造一个缺陷来堵。

## 真浏览器证伪（本片最重要的一条诚实，先量后修）

写 `e2e/forced-colors-probe.mjs` 在**真 Chrome** 用 `page.emulateMedia({ forcedColors })` 跑 `2×2=4` 组 computed style 探测，有区分度的三组实测值：

| forced | withFix | color | backgroundImage | backgroundClip |
|---|---|---|---|---|
| false | false | `rgba(0, 0, 0, 0)` | `linear-gradient(...)` | `text` |
| true  | false | `rgb(0, 0, 0)`（系统前景色） | `none` | `text` |
| true  | true  | `rgb(0, 0, 0)` | `none` | `border-box` |

（第 4 组 `forced=false + withFix=true` 因 `@media (forced-colors: active)` 不匹配、回退块在非 forced 态不生效，与第 1 组同，故不单列。）

**结论（推翻初版假设）**：Chromium 在 `forced-colors: active` 下**内建保护**——会把 `color: transparent` 强制成系统前景色、把渐变 `background-image` 清成 `none`。
因此"Chrome 高对比度下标题变空白字"**并不成立，不夸大、不编造缺陷**。真正残留、且我的修复确实改变的量**只有一个**：`background-clip` 没回落，仍是 `text`。
Chromium 兜住了 color/background，但**其它 UA / 用户自定义高对比度主题不保证同等保护**，`clip:text` 残留是跨 UA 的可见性隐患。
本片因此定性为**防御性加固**，而不是"修了一个 Chrome 已自愈的洞"——所有 CSS 注释、判据文案、ADR 措辞都据此收紧。

## 决定（防御性、零常规视觉变化）

在 `globals.css` 的 `@layer components` 尾部（`.ss-` 段之后）加一条 `@media (forced-colors: active)` 回退块，覆盖全部 8 个渐变墨字类：

```css
@media (forced-colors: active) {
  .dv-title, .mk-title, .hp-heroTitle, .se-title,
  .pf-name, .pb-title, .pp-title, .ss-title {
    forced-color-adjust: auto;
    background: none;
    -webkit-background-clip: border-box; background-clip: border-box;
    color: CanvasText;
  }
}
```

三条设计取舍：

1. **`color: CanvasText` 用 CSS 系统色**，不用写死 hex、也不用 `var(--nexus-*)` token——双主题 token 只覆盖本项目的浅/深色，不覆盖用户任选的任意高对比度配色；系统色关键字才能自动适配用户所选配色（守住 ADR-0123 六红线的"零 hex / 零新增颜色 token"）。
2. **显式 `background-clip: border-box` + `background: none` + `forced-color-adjust: auto`**：把"交给系统配色"的意图写明，不是漏配；回落 clip 是本片唯一改变的可区分量。
3. **零常规态改动**：浅/深双主题下 8 个标题仍是 `transparent` 字 + `clip:text` 渐变墨字，判据专门守这条（见下"常规视觉一字未动"门）。

## 静态判据（9 门，`forced-colors-style.test.ts`，零浏览器/零真库/零时钟）

关键设计：**动态发现**而非硬编码 8 个类名——从 `globals.css` 源码扫出所有同时含 `color: transparent` + `background-clip: text` 的类，要求**每一个**都在 forced 块里有可读回退。
守的是"所有透明字标题都必须有高对比度兜底"这条**不变式**，而非 8 个名字的快照：将来任何人新增一个渐变墨字标题却忘了加回退，判据会自动抓到。

9 门：①动态发现 ≥8 个且逐一点名当前 8 类（防"扫到的是别的透明字元素"漂移）· ②每个渐变墨字类在 forced 块都有回退 · ③`color` 设为系统色（`CanvasText`/`Canvas`/`HighlightText`/`WindowText`/`currentColor`）而非 `transparent` · ④`background-clip` 回落 + `background` 清空 · ⑤回退块零写死 hex · ⑥回退块零 `var(--nexus-*)` token（双主题 token 不覆盖用户自定义高对比度）· ⑦显式声明 `forced-color-adjust` · ⑧**常规（非 forced）渐变墨字视觉一字未动** · ⑨`globals.css` 块注释定界符严格配对（堵注释提前闭合导致真编译挂的洞，FE-6 教训）。

**先红 4/5 → 9/9**：未接回退块时，动态发现门（扫到 8 类）与零 hex/零 token/常规视觉/注释配对 4 门本就绿（零回归对照），其余 5 门精准红。
**三变异臂 A/B/C 全红**：去某个类的回退 / 把系统色改回 `transparent` / 去掉 `background-clip` 回落——逐条当场备份 + `trap EXIT` 字节还原 + md5 断言变异真发生，恢复后 GOOD 复核 9/9。

`forcedColorsRules` 的 media 块解析**按花括号深度配平**，不用缩进/正则猜：`@media` 内规则的闭合 `    }` 与 media 自身闭合 `  }` 都带缩进，`\n\s*\}` 非贪婪会在内层规则处提前截断、body 丢掉尾部 `}`，`ruleBlocks` 就切不出完整规则（FE-6 同类教训：块边界必须按深度配平）。

## 真浏览器那一寸（离线 A/B 因果，`1 passed`）

`e2e/forced-colors.spec.ts` + 专用 `e2e/forced-colors.config.ts`：

- **刻意离线**：用 `page.setContent` + 从**产物 `globals.css` 真实提取**的 forced 块做 A/B 对照，不访问任何 URL、不依赖后端、零夹具，确定性真 Chrome（单 worker、`channel: 'chrome'`）。config **刻意不配 `webServer`**——主 config 的探活在本机后端网关 502 时会等满 180s（FE-7 首跑踩过的坑），本片不需要页面服务。
- **测的就是唯一可区分量**：对照组（无回退）+ forced → `background-clip` 仍残留 `text`；实验组（注入从产物提取的 forced 块）+ forced → `background-clip` 回落 `border-box`，且 `color` 系统色、背景清空、文本与尺寸在、可见。**不测 `color`**（那个已被 Chromium 强制兜住，测它抓不出修复差异）。
- 结果：真 Chrome **`1 passed`**（4.7–6.0s，非 skip）。

## 验证（诚实分层）

- 静态 `forced-colors-style` **9/9**；三变异臂 A/B/C 全红并还原；
- **横向 style 回归 72/72**：批 1 `style-tokens` + `play-visual-style` + `storyboard-visual-style` = 44/44；批 2 `profile-style` + `published-style` + `state-styles` = 28/28——`.pp-`/`.ss-` 等前缀共享 `@layer components` 尾部，forced 块插在其后不改变任何前序段判据；
- 工程门：`eslint forced-colors-style.test.ts` **EXIT=0**、`tsc --noEmit -p apps/web` **EXIT=0**、`tsc --noEmit -p e2e` **EXIT=0**、`postcss.parse(globals.css)` OK。

## 诚实边界

- **不夸大缺陷**：Chromium 已内建保护 `color`/`background`，本片**不声称**"Chrome 高对比度下标题变空白字"；真正改变的是 `background-clip: text → border-box`，属**跨 UA 防御性加固**。
- **跨 UA 是防御性承诺、非全 UA 实测**：断言的是 CSS 契约 + Chromium 真浏览器因果；Firefox / Edge 用户自定义高对比度主题**未在真机实测**，"其它 UA 不保证同等保护"是加固动机，不是"已在这些 UA 复现了洞"。
- **常规视觉零变化**：浅/深双主题 8 个标题仍是渐变墨字，只在高对比度媒体查询下回退；本片不动任何交互与文案。
- **离线 e2e 的取舍**：本机后端网关 502 无干净窗口，本片用 `page.setContent` 验 CSS 因果、不访问真实页面；这能证明"回退规则在真 Chromium 下确实改变 clip"，**不等于**"在真实部署站点的所有高对比度组合下逐页看过"。
- **`codegen.ts` 等产物不涉**（纯 web globals.css 改动）；真库/真 Redis 套件本机无干净窗口，未硬跑、不编绿灯；未 push。

## 协作边界

开工 HEAD 已含并行会话 SC-64（`/actuator/circuitbreakers` 暴露）与我的 FE-7（`b8ac3eca`）/ FE-8（`a0d675e5`）/ PERF-3（`85036cc0`），本片只改 `apps/web/src/app/globals.css` 的一条 forced 块 + 2 个新判据文件 + 1 个离线 config + 1 个证伪探针 + 本 ADR + ROADMAP/CURRENT-STATE/memory 增量登记。
纯 web CSS/测试，与并行会话的 java/realtime 文件正交；精确 stage 避开 `test-results-mine*/`、`.next-dev-archives/`、`.git/diag-fc.mjs`、`.git/*COMMIT_MSG.txt`。
ADR 编号查重：0145 被 PERF-3 占用，本片用 **0146**。文档基准取自最新 HEAD，只追加不 rewrite。

## 仍欠

- Firefox / Edge 自定义高对比度主题真机实测（当前是 CSS 契约 + Chromium 因果）；
- 若将来新增渐变墨字标题，静态判据的动态发现门会自动要求加回退——这是本片留下的防回归机制；
- 真库/真 Redis 全套、真部署站点逐页高对比度目视：待干净窗口，不承诺墙钟/全 UA 绿灯。
