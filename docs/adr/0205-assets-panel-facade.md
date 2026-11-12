# ADR-0205：§FE-53 `AssetsPanel.tsx` `.ap-` 门面化——M2 Asset Library

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-52 · `apps/web/test/assets-panel-visual-style.test.ts` · `docs/evidence/fe-53-assets-panel-facade/evidence.md`

## 背景

`AssetsPanel.tsx` 是 M2 资产清单：项目资产清单是设计模型的一部分（§16）——这里只是它的一个投影（列出、预览、删除）。
删除走 `studio.deleteAssetFromLibrary`：一次可撤销事务把资产移出清单并剥掉引用它的 fill（§149）；字节删除尽力而为，面板把"撤销能恢复引用、字节回不来"这条非对称写进回执（§159）。
引用计数（`referenceCounts`）一次走全节点扫成 `Map`，不再针对每个资产全扫一遍（§147 代价 节点数+资产数，不是资产数×节点数）。

## 决定

1. **新增 `.ap-*` 门面族**（globals.css，`.sk-` 段之后）：42 定义——`chipDis/chipDisEnd/primary/uploadTrigger/searchField/row2ink/wrapCenter/topfaint/mono11faint/mono12faint/mono10uppercase/emptyState/assetRow/thumb/metaCol/colGap2Faint/faint/footnote/infoBox/codeChipSm/badgeWarn/wfullInput/headBetween/headCol/bannerWarn`，+ 复用 `.wd-*`（headBordered/scrollP2/rootCol/col2/mt2/label）+ 复用 `.sk-selfStart`、`.pp-cover`、`.ds-trunc12`、`.hi-warnink`、`.hi-monoTruncFaint`、`.sb-colMt2`、`.cp-colGap2`、`.gp-col1`。
2. **唯一代码变更**：删除唯一使用点消失后已死的 `import { cn } from '@/lib/cn'`（redact 守恒：HEAD 雕刻该 cn 行后与改后 redact 字节一致，§FE-37 同口径）。
3. **cn 三元统一映射**：demo-badge → `.ap-badgeWarn`（单条 template literal 改为直接 className）；其余 6 处 `className=` 替换为门面类名，行为零变更。
4. **零行为恒等门**：剥类+cn+雕刻 cn 行 → 与雕刻后的 HEAD 逐字节一致（测试内联雕刻判据）。
5. **判据**（10/10 绿）：useMemo/studio 路径进门 · 字面类全 ap-/复用族 · 零裸原子 · 类名闭环 · 段成规模（42 定义）· 零 hex · token 全声明 · 零新增颜色 token · 零 transition/@media/@keyframes · **SHA256 守恒** · 钩子守恒（assets-panel/asset-card/delete/demo-badge/notice/error/sketch-section/vbench-* 系列 21 处）。

## 取舍

- 不动 `referenceCounts` 的算法与 `found`/`bump`/`Set` 实现（§147 特殊 case）；不动 `SketchPad` 的挂载结构、`apiAssetUrl` 鉴权参数（signature）；
- 不把 `data-asset-dna/portrait/scene-from-portrait` 等 21 个钩子合并（真 provider 审美链要口令化）；
- 不做截图：browser 不可用。

## 后果

`AssetsPanel` 加入门面矩阵。Studio 余 ≈13 面板继续；`PublishPanel`/`RetrievePanel`/`WorldGraphView` 仍是最大的三个未做。
