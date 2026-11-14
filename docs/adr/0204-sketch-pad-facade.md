# ADR-0204：§FE-52 `SketchPad.tsx` `.sk-` 门面化——§38 Sketch → Image 绘制面

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-51 · `apps/web/test/sketch-pad-visual-style.test.ts` · `docs/evidence/fe-52-sketch-pad-facade/evidence.md`

## 背景

`SketchPad.tsx` 是 §38 的绘制面：一块白纸、一支黑笔。它是草图的**输入面**，不是第二个画布——画布（§5）是设计文档的投影，一切编辑走 Command；这一块是生成链的原料采集：画的笔迹不进设计模型，导出成 PNG 走与上传同一道摄取门（§80）。
撤销一笔只是本地编辑原料，不碰设计文档，所以不进撤销栈——与分镜、世界面板同一口径。

## 决定

1. **新增 `.sk-*` 门面族**（globals.css，`.cp-` 段之后）：12 定义——`.sk-root/.sk-paper/.sk-row1/.sk-selfStart/.sk-btn/.sk-btn:hover/.sk-btn:disabled/.sk-primary/.sk-primary:hover:not(:disabled)/.sk-primary:disabled/.sk-monoFaint/.sk-warn12`，+ 复用 `.wd-faint11`/`.cp-warn11`/`.wd-body11`。
   - **`.sk-paper { background: #fff; }`** 是全片唯一写死 hex：白纸是**内容色**（canvas 底 `ctx.fillStyle = '#ffffff'`），两主题一致；改成 token `--nexus-color-bg-1`-ish 会在 dark 下把纸涂成暗色、与墨迹对比丢失，证据不成立。
2. **零行为恒等门**（redact）：page `e6fa416e…` 与 HEAD 字节一致。
3. **判据**（10/10 绿）：'use client' + onGenerate/redraw/toBlob 进门 · 字面类全 sk/wd/cp-* · 零裸 Tailwind · 类名闭环 · 唯一 hex 只出现在 `.sk-paper { background: #fff; }`（有注释记账）· token 全声明 · 零 transition/@media/@keyframes · **SHA256 守恒** · 钩子守恒（data-sketch-pad/undo/clear/strokes/generate/export-error/need-prompt/empty）。
4. INK `const INK = '#101014'` / `ctx.fillStyle='#ffffff'` / `lineWidth`/`pointOf`/`PAD_SIZE 240`——**全部原样**；INK 是画笔内容的呈现色，换 token 会把墨色量化掉（与白纸一样是内容色）。

## 取舍

- 不动 `style={{ touchAction: 'none' }}`（指针语义）；不动空白纸按钮/hover/`disabled:opacity-50` → `:disabled {opacity:.5}`；
- 不新增 `.sk-paper` 纹理/阴影——白纸就是白纸；
- 不做截图：browser 不可用。

## 后果

`SketchPad` 加入门面矩阵。Studio 余 ≈14 面板继续。
