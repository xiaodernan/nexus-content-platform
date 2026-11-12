# ADR-0176：§FE-24 `/game` 与 `/world` 运行时壳 `.rt-` 门面化——两个非发布链运行时页同族收口

- 状态：Accepted
- 日期：2026-11-12
- 关联：§FE-23（ADR-0175）· §50/§140/§54 · `apps/web/test/runtime-pages-visual-style.test.ts` · `docs/evidence/fe-24-runtime-shells-facade/evidence.md`

## 背景

`/game/[projectId]`（§50 可玩投影，编译 §54 游戏设计文档 → PlayByKind）与
`/world/[projectId]`（§140 世界投影，编译 §「世界」文档 → WorldWalk 全屏 3D）是两条
**非发布链、只有作者本人可进**的运行时载体。共同点：三态门（none/broken/ok）、h1
font-size-21、accent-2-ink 链接、danger-ink 错误句。此前全裸 Tailwind
（`max-w-[720px]`、`text-[var(--nexus-font-size-21)]`、`h-dvh w-full` 等）。

## 决定

1. **新增 `.rt-*` 门面族**（globals.css，`.tl-` 段之后）：`.rt-shell/.rt-shellWide/.rt-title/
   .rt-lede/.rt-error/.rt-note/.rt-head/.rt-subtitle/.rt-link/.rt-linkSub/.rt-stage`——双主题
   token 锚定、零 hex、零新增颜色 token、零动效、零 @media；`:focus-visible` 覆盖两档 link。
   - **`.rt-stage { height: 100dvh; width: 100% }`**：/world 的全屏 3D 画布占位，逐字节等价 `h-dvh w-full`。
   - **空间尺寸取字面量而非发明 token**：基线 `py-16`（4rem）没有同名 token
     （scale 止于 space-12），用字面 `4rem`，不发明 `--nexus-space-16`。
2. **零行为恒等门**：两个 page 的标的判据——鉴权（requireUser + projectVisibleTo + notFound）、
   判 kind、compileForKind/buildWorldScene、文案、data 钩子、WorldWalk props——红线：
   两个文件剥 className 后 redact SHA256 与 git HEAD 一致（game `4dc0a0b5…`、world `819282fa…`）。
   本片没有新增 className 到原本无类的元素（/world 外层 `<div>` 本来就带类，换成 `.rt-stage`），
   所有改动都落在既有 className 取值上。
3. **判据**（12/12 绿）：server 组件门 ×2 · 字面类全 rt-* · 零裸 Tailwind · 类名闭环 ·
   成规模（≥10）· 零 hex · token 全在 · 零新增颜色 token · 零 transition/animation/@media ·
   focus-visible · **双文件 SHA256 守恒** · 数据钩子守恒（game 7 + world 3+stage 钩子）。

## 取舍

- 不动 3D 运行时本身（WorldWalk 的 WebGL 生命周期、实例化、帧循环）——不是这片。
- 不动 PlayByKind 投影判 kind 逻辑、不动 §160 边界（DEMO MODE 不适用本页）。
- /world 不做 DEMO/不可达态扩展：世界读取是作者本人的读路径（§140）。
- 不做浏览器截图：browser 不可用。

## 后果

两个运行时壳加入门面矩阵；`/preview/[projectId]` 是最后一张列表页（7.2 KB，
含 postMessage 沙箱握手），按同一纪律继续。
