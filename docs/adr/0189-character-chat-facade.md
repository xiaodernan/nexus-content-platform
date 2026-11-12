# ADR-0189：§FE-37 `CharacterChat.tsx` `.ch-` 门面化——§47 角色对话框、0.625rem 留字面量

- 状态：Accepted
- 日期：2026-11-13
- 关联：§47 · `apps/web/test/character-chat-visual-style.test.ts` · `docs/evidence/fe-37-character-chat-facade/evidence.md`

## 背景

`CharacterChat.tsx` 是 §47 的角色对话框——CharacterPanel 档案编辑器和 `/world` 的 3D HUD 都渲染它。回复只有一种来源（ai-service 真模型、§159 不编造）；无会话线程，真实回复落 §48 角色记忆，界面刷新即不在了。先前全裸 Tailwind + 模块级 `cn()` 条件拼接（bg-bg-2 vs bg-bg-3）。

## 决定

1. **新增 `.ch-*` 门面族**（globals.css，`.gw-ident2` 之后）：`.ch-title/.ch-lede/.ch-log/.ch-msg/.ch-msgUser/.ch-msgCharacter/.ch-speaker/.ch-error/.ch-row/.ch-input/.ch-send`——双主题 token、零 hex（除 .ch-speaker 的字面量 0.625rem）、零 @media、零动效；input:focus 落 bg-3、:disabled 真禁用、send 按钮 :hover+`:disabled`+`:focus-visible` 环。
   - **字面量 `0.625rem`**：speaker 字号 10px，token 尺度没有 10px（最近档 11px）。写 11px 会真变字号，违反零行为；补 `--nexus-font-size-10` token 会动整个 token 体系。判定：保留 0.625rem 并在 ADR 记账（同 .am-ledgerGrid 不带颜色）。
   - `ch-msg` 分支改为三态 ternary className（user/character），颜色靠 `.ch-msgUser`/`.ch-msgCharacter` 两类切换。
2. **唯一代码删除**：`import { cn } from '@/lib/cn'`——唯一使用点消失后已死；雕刻门证 `HEAD − cn 行` ≡ 现状（hash `ef0f3980…`）。
3. **判据**（12/12 绿）：client 指令 + send()/sessionRef + fetch 三件套（CSRF/POST）· 字面类全 ch-* · 零裸 Tailwind · 类名闭环 · 零 hex · token 全在 · 零新增颜色 token · 零 transition·@media · 雕刻门守恒。

## 取舍

- 不动 send()/CSRF/sessionRef/map idx/data 钩子——这些是行为。
- 不补 hover 高亮/placeholder 样式；不动 busy 态动字 "在想…"。
- 不做截图：browser 不可用。

## 后果

`CharacterChat` 加入门面矩阵。studio 余 27+ 面板继续按同一纪律推进。
