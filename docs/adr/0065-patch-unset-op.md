# ADR-0065：删除字段走显式 `unset` op，而不是一条没有 value 的 `set`

## 背景

撤销一条 `set` 要知道"改之前是什么"。当这条路径在改之前**根本不存在**时（例如把状态补丁贴到一个
还没有 `states.hover` 的节点），`invertPatch` 最自然的写法是
`{ op: 'set', path, value: undefined }`。内存里这能表达"删掉"，但补丁要过 HTTP JSON：
`JSON.stringify` 会把 `value` 这个键整个丢掉，服务端 zod 收到的是一条缺字段的 `set`，
报 `patches.0.ops.0.value: expected nonoptional, received undefined`，整个 PATCH 400。

§124 状态剪贴板的浏览器见证真的踩到了这条路：粘贴 → 撤销一次 → 自动保存 400，界面上
"已保存"停在旧状态。这不是测试写法问题，是 wire 协议缺了一格。

## 选项

1. **让 `set.value` 可空**（`z.unknown().optional()`）。代价是把"我要删掉这个字段"和
   "我忘了写 value"变成同一件事：一个拼错的补丁会静默删除字段，违反 §159。
2. **显式 `unset` op**：新增判别分支，`nodeId` / `path` 必填。删除成为一等意图，
   没写 value 的 `set` 仍然被拒。
3. **撤销不发逆补丁，客户端本地回滚**：绕过 wire 协议，undo 只在当前 tab 有效；
   协作、跨端与 AI 补丁的撤销没有通道。

## 决定

选 **2**。

- `PatchOp` 增加 `{ op: 'unset'; nodeId; path }`。`applyToPage` 与 `set` 同形状：节点不存在 →
  记入 `skipped`，不抛错；`pathUnset` 对不存在的中间层/叶子幂等（本来就没有这个字段）。
  只删指定路径的叶子，不顺手清空祖先空对象——`states.hover` 删掉后 `states` 留 `{}`，
  与"清空最后一个通道"的既有行为一致。
- `invertPatch` 对称处理：`set` / `unset` 的逆都看"改之前有没有这个字段"——有就 `set` 回原值，
  没有就 `unset`。
- `diffPatch` 把 `unset` 报成 `kind: 'removed'`、`after: undefined`，历史面板照常显示。
- zod `PatchOpSchema` 加分支；`set` 的 `value` 保持必填。三份 contract（设计补丁 / AI 响应 /
  AI 作业状态）用 `npm run contract:export` 重新生成。
- MCP 工具的 ops 说明补上 `unset`：外部 Agent 不该照着旧词表发非法补丁。

## 后果

- wire 词表 +1。旧服务端遇到 `unset` 会拒绝整个补丁——这是有意的：宁可 400，
  不要静默丢字段；旧客户端不会生成 `unset`（只有新的 `invertPatch` 会发）。
- 见证：`patch-commands.test.ts` 三例（新字段的逆是 `unset` 且 JSON 往返保形 / `unset` 的逆
  把原值放回来 / 对本来不存在的字段幂等）；`patch-unset.test.ts` 两例（请求 schema 接收 `unset`、
  缺 value 的 `set` 被拒且 issue 落在 `patches.0.ops.0.value`）。
- 变异探针：把 `pathUnset` 换成空实现 → 恰好 1 红（"往空处新增字段的逆是 unset"那一例），
  其余 35 例绿，逐字节还原。
