# ADR-0050：节点树遍历必须带循环守卫（seen / 深度上限）

- 状态：已接受（2026-10-21）
- 关联：§16（设计模型唯一真值）、§159（不静默修数据，如实报）、save / Quality Gate 路径

## 背景

2026-10-21 在设计模型的**多个节点树遍历**里发现同一类真缺陷——遍历没有 visited / 深度守卫，
遇到"成环"的节点文档不是**如实报 `cycle`**，而是**整个崩**：

| 位置 | 遍历方向 | 成环时的表现 |
| --- | --- | --- |
| `patch.ts` `collectSubtree` | 沿 `children` 递归 | 栈溢出（`RangeError: Maximum call stack size exceeded`） |
| `nodes.ts` `descendants` | 沿 `children` 递归 | 同上：栈溢出 |
| `nodes.ts` `walk` | 沿 `children` 递归 | 同上：栈溢出 |
| `nodes.ts` `ancestors` | 沿 `parentId` 爬 | 同步死循环（`while` 不退出） |
| `nodes.ts` `isDescendant` | 沿 `parentId` 爬 | 同上：死循环 |

**为什么本意是"报 cycle"却崩了**：`validatePage` 是**先调 `collectSubtree` 求 reachable、再跑自己的
`detectCycle`**（`validate.ts`）。于是成环文档在第一行就先把 `collectSubtree` 撑爆——**cycle 检测根本没机会跑**。
旁边注释还写着"按 error 挡在写入侧"，崩显然不是预期出口。

**畸形文档从哪来**：导入包、AI 补丁（尤其 `reparent` 少一道成环校验）、手改 jsonb。它们挡在门外本来就该得到
一条 `cycle` issue，而不是一次保存 500 / 质量门挂掉。**同步死循环比栈溢出更隐蔽**：它连报错都留不下（vitest 只能被
外部 SIGTERM 掐掉，连"红在哪一条"都说不清）。

## 决定

**所有沿 `children` 递归、沿 `parentId` 爬的节点树遍历，一律带 `seen` 守卫；父链用法同时配合数量上限。**

硬约束（回归判据）：
1. **无环树的输出逐项不变**——加守卫只把"崩 / hang"变成"有界"，绝不改变正常语义。
   （实证：全 design-model 25 文件 / 332 条回归绿。）
2. **成环必须终止而非崩**——回归用"成环不再抛 / 不再挂 + 无环树顺序·计数·ancestor 链不变"双断言钉死。

横向清同族：修 `collectSubtree` 那一刻就该顺手扫的——凡是"沿 children 递归 / 沿 parentId 爬 且没有
seen 或 depth 上限"的都是同一颗雷。本次把 `collectSubtree / descendants / walk / ancestors / isDescendant`
五处一次清完，配套 `traversal-cycle.test.ts`。

## 后果

- 好：保存 / 质量门 / 补丁应用（`remove`、`reparent` 也走 `collectSubtree`）对畸形文档**不再崩**，
  让上游的 `cycle` 检测有机会如实报 issue（§159）。
- 代价：每个遍历多维护一个 `Set<string>` + 常数比较；实测无性能回归（10k 节点档未见差异，仅在访问到节点时 O(1) 判一次）。

## 未做 / 后续

- `codegen` / `context-index` / `diff` / `serialize` 里若还有同型的"沿树递归无守卫"，按同一规则补齐。
- 更彻底：在补丁应用侧（`reparent` 一类）拒绝产生成环，把畸形文档挡在生成之前；本 ADR 只保证"即使生成了也不崩"。
