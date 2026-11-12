# ADR-0203：§FE-51 `CharacterPanel.tsx` `.cp-` 门面化——§46-47 角色面板

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-50 · `apps/web/test/character-panel-visual-style.test.ts` · `docs/evidence/fe-51-character-panel-facade/evidence.md`

## 背景

`CharacterPanel.tsx` 是 §46 Character System 的面板：角色档案的建、改、删（名字/外观/identity/clothing/style/traits/personality/backstory/goals/fears/voice/cp-date/relationships）；「跟角色说话」是 CharacterChat 共用块（§47）。
AI 生成角色肖像要真 provider——「生成肖像」按钮只依赖 profile.visualIdentity.palette（服务端同一口径），本片只换皮。

## 决定

1. **新增 `.cp-*` 门面族**（globals.css，`.hi-` 段之后）：58 定义——`cp-root/cp-rowChip/cp-growInput/cp-growField/cp-mode80/cp-charTab/cp-tabOn/cp-tabIdle/cp-saveBtn/cp-saveReady/cp-saveIdle/cp-accentBtnSm/cp-btnHover/cp-dangerGhost/cp-stickyBar/cp-empty/cp-faintMb1/cp-faintPx1/cp-microFaint/cp-warn11/cp-warnMt1|2/cp-labelSmall/cp-rowMt2/cp-row2Mt2/cp-wrapMb3/cp-wrap/cp-colGap2/cp-trunc12ink/cp-ml1/cp-block/cp-noticeRow/cp-noticeError/.cp-inputShared/cp-grow/cp-mono`，
   + 复用 `.wd-*`（rootCol/scrollP2/headBordered/row2/monoFaintEnd/label/delBtn/dangerMt2/body11Mt2/col2/rowMt1）+ `.gp-*`（col1/mt1）。
2. **`const INPUT = 'cp-inputShared'`**（原共享的 `'w-full resize-y rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12 ...'` 去糖）：所有 ~13 处输入框的默认外观锚 `.cp-inputShared`，模板补 `${INPUT} gp-mt1 cp-mono` / `${INPUT} cp-grow`——与原设计等价。
   - `.cp-inputShared:focus { background: var(--nexus-color-bg-3); }` 语义与原 `focus:bg-bg-3` 一致（不引入 accent-2/hover）。
3. **cn 三元统一映射**：
   - 角色 tab → `.cp-charTab` + `.cp-tabOn`(selectedId) / `.cp-tabIdle`（hover bg-2）；
   - 保存键 → `.cp-saveBtn` + `.cp-saveReady`（accent-2）/ `.cp-saveIdle`（bg-2 fg-3）；
   - 生成肖像/场景 → `.cp-accentBtnSm`（accent-2 accent-fg，:disabled .5）与 `.gp-`/`.wd-` 不重入；
   - 删除/抹除录入 → `.cp-dangerGhost`（:hover danger-ink）或复用 `.wd-delBtn`（px-1 silence）。
4. **零行为恒等门**（redact，含 INPUT 共享类常量归一多行 `const INPUT =\s*'…'`）：page `db5864a8…` 与 HEAD 字节一致。
5. **判据**（10/10 绿）：client + useStudioReady 进门 · 字面类全 cp-*/wd-*/gp-* · 零裸原子 · 类名闭环 · 段成规模 · 零 hex（placeholder 里的色板示例 hex 是写给用户的文案、非样式）· token 全声明 · 零 transition/@media/@keyframes · **SHA256 守恒** · 钩子守恒（data-character-tab/save/delete/notice 系列）。

## 取舍

- 不动 `ListText` 的派生 memo（split/join/trim）、不动 relationships CRUD、不动 `generateCharacterPortrait` 的 L159 承诺（provider 才生成、否则抛错）；
- `placeholder`/`aria-label`/`data-*` 钩子一字不改（`relKind`/`palette`/`voice.catchphrases` 的内联 ListText 都直改）；
- `.cp-stickyBar` 元素名仍叫 sticky（`position: sticky`）——只是门面不是 Tailwind atom；判据对 className 字面量扫 `sticky bottom-0` 模式而不是 `粘 "sticky"` 词根。

## 后果

`CharacterPanel` 加入门面矩阵。Studio 余 ≈12 面板继续。
