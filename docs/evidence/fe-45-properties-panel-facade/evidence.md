# §FE-45 · `PropertiesPanel.tsx` `.pp-` 门面化——验收记录

## 这次做了什么

`PropertiesPanel.tsx`（§6 属性面板 inspector：选中元素属性分区 + 响应式四档 + 状态补丁 + token 绑定）从全裸 Tailwind（102 处）改为 `.pp-*` 门面族（66 定义）。Studio 最大的一块门面。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                 → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                        → ESLINT_EXIT=0
npx vitest run apps/web/test/properties-panel-visual-style.test.ts → 10 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @、cn()整体归一后为 cn()、`const cls = '…'` 共享类常量归一）：page→`6d2c2adacf41d89dce034c123f7e10858c3ae527a2b5b15b00c49271e7e7229d`，与改前（git HEAD）逐字节一致。

## 事故记账（两次拦截，均已修复并在本片收口）

1. `apply-pp.cjs` 因两处 defensive pair 没中（`inline-flex items-center gap-2` / `text-12 text-fg-3 hover:text-danger-ink` 并不存在）——已确认无需补。
2. **共享类常量 `const cls = 'w-full … text-12'` 是本片唯一埋在变量名里的裸原子**，脚本首轮没扫到；已替换为 `.pp-wfullInput12`（同时补全 token/焦点/禁用语义与原子一致）。
3. 零裸 Tailwind check 首轮红：罪魁就是它——修完即 10/10 绿。
4. hex 判据口径：JS 内的 `#000000`/`#ffffff`/`#8b5cf6` 是**用户色值数据**，不是样式；hex 只拦 CSS 视觉段与 className 字面量。

## 细节

- `shadow-panel` 原子 utility → @theme var(--shadow-panel) → tokens `--nexus-shadow-md`；门面类直接锚 `--nexus-shadow-md`。
- text-9 / px-[5px] / h-3.5 等任意值 token 尺度没有 → 字面量 0.5625rem / 0.3125rem / 0.875rem（与 FE-37/42 口径一致）。
- cn 三元统一映射：`bg-brand text-accent-fg` → `.pp-segOn` 一枚；off 态按 hover 拆 `.pp-segOff`（hover fg-1）/`.pp-segOffQuiet`（无 hover，hug/fill 键盘语境）；ghost 按 size 拆 `.pp-ghostBtn`(12px)/`.pp-ghostBtnSm`(11px) + Ready/DangerReady/Idle 三档——三态 AA 不碰文字 token。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；字段 onSet/mixed Symbol 判定/响应式四档决策未在本轮重放。
