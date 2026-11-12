# ADR-0207：§FE-55 `MemoryPanel.tsx` `.mm-` 门面化——§48 角色记忆

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-54 · `apps/web/test/memory-panel-visual-style.test.ts` · `docs/evidence/fe-55-memory-panel-facade/evidence.md`

## 背景

`MemoryPanel.tsx` 是 §48 角色记忆面板：角色记忆 CRUD，明文编辑；`embedded=false` 时显示「未向量化」字样——不造假。
与 Studio 的 lanes：memory 属于角色资产链（ CharacterChat/§47 + 角色记忆/§48），与画布 Command 撤销链不交叉。
本片只换皮；clear/save/scope 全部 studio 派发——一字不动。

## 决定

1. **新增 `.mm-*` 门面族**（globals.css，`.pb-` 段之后）：29 定义——`growField11/truncFaint/accent/textArea/growLead/memRow/labelRow/clearAll/mono/growPlaceholder/rowMt2/chipPlain/btn1/btnGhost/xshrink/semi90`，+ 复用 `.wd-*`、`.cp-*`、`.gp-*`、`.ds-*`、`.hi-*`、`.pb-*`、`.sb-*`。
2. **零行为恒等门**（redact）：page `973ddab6…` 与 HEAD 字节一致。
3. **判据**（8/8 绿）：client + studio 进门 · 字面类全 mm-/复用族 · 零裸原子（ml-auto/hover:/disabled: 扫面）· 类名闭环 · 段成规模 · 零 hex · token 全声明 · 零新增颜色 token · 零 transition/@media/@keyframes · **SHA256 守恒**。
4. cn 三元映射：embedded=false 时 append `.mm-semi90`（0.9 透明度）——`entry.embedded=true` 时不出现此类；embedded=false 时唯一视觉区别是 90% 透明度（原 Tailwind `opacity-90` 同语义）。

## 取舍

- 不动 embedded 检查；不动 scope 切换 UI（clearAll 按钮 shared owner）；不动 §48 的持久层。
- 不做截图：browser 不可用。

## 后果

`MemoryPanel` 加入门面矩阵。Studio 余 ≈11 面板继续（WorldGraphView/RetrievePanel 仍最大）。
