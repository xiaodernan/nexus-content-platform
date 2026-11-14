# ADR-0252：§FE-99 `play/StoryPlay.tsx` `.st-` 门面化——§54 互动叙事运行时 chrome

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-98 · `apps/web/test/story-play-visual-style.test.ts` · `docs/evidence/fe-99-story-play-facade/evidence.md`

## 背景

§54 互动叙事的运行时：blocked 照实说；choices 点击换 beat；trail 原样回放；§PLAYTEST 自动查一遍；notes 原字回放。裸原子 29 处。

## 决定

1. 新增 `.st-*` 门面族（globals.css，`.pk-hint2` 之后）：`st-card/st-hudRow/st-restartBtn/st-title/st-warnNote/st-emptyNote/st-body/st-choices/st-choiceBtn/st-endingNote/st-summary/st-notesList/st-bullet`；复用 `.pk-h2/.pp-danger12/.g2-*`。
   - `leading-6` → `line-height: 1.5rem`；`py-1.5` → `6px`；`gap-1.5` → `6px`；`rounded-lg` → `var(--nexus-radius-lg)`；
   - notes 列表 `preflight 归零后显式 `list-style:disc` 还原`（原行为=preflight 不杀但有 class 说需要的 disc）。
2. **零行为恒等门**（redact）：`5a101e8e…` 与 HEAD 字节一致。
3. **判据**（8/8 绿）：client + story-/playtest- 钩守恒 · 字面类全 st-/pk-/g2-/pp- · 零裸 Tailwind · 类名闭环 · token 全声明 · 零 hex · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- `.st-choiceBtn` 不做 `:focus-visible`（现 hover 描边即 affordance，同家族节制）；
- 不动 Playtest 语义、`data-story-trail` 原文回放；
- `.st-body` 不补 `word-break`——中文行宽由容器限宽决定，不在本片加行为。

## 后果

`StoryPlay` 加入门面矩阵。§54/§51 游戏表面全部零裸原子。
