# 0079 — 实例复制体的 id 从 instanceId 推出来，不摇随机数

## 背景

§13 的实例化落地后（ADR-0078），画布上"放一份组件"走的是 `instantiate` 这条 op。
自动保存走 #62② 的补丁路径：客户端改内存里那一份文档，同一条 op 再送去
`PATCH /api/projects/<id>/design`，服务端在**库里那一份**上把这条 op 重新 apply 一遍
（`apps/web/src/server/domain/projects.ts` 的 `patchProjectDocument`）。

也就是说，一条 op 天生要被 apply 两次。第三十五片加「更新实例」按钮时，
`e2e/components-panel.spec.ts` 那条同步见证（第三十四片 A5 之后补的 PATCH 计数）第一次跑就红了：

```
409 {"error":"ops_skipped","message":"有补丁没有落到目标上…这一批一条都没写",
     "skipped":[{"index":0,"reason":"node tex_mvzht9zj6o1cpd not found"}]}
```

那条 `remove` 点名的正是复制体里的节点。根因在 `instantiateComponent`：
复制体每个节点的 id 用 `uid()` 现场摇（`packages/design-model/src/nodes.ts`），
于是客户端那份文档和服务端那份文档各得一套 id —— 内容一样、id 不一样。
之前没有暴露，是因为**没有任何 op 点名过复制体内部的节点**：
`instantiate` 的撤销是 `remove` 壳子（壳子 id 由 `op.instanceId` 指定，两边一致），
子树跟着壳子一起收走。同步必须先收走旧的复制体子树，才第一次踩到这条缝。

界面没报错的原因是 `store.save()` 的兜底：PATCH 回 409/400 就当场换整份 PUT
（`apps/web/src/studio/store.ts`），PUT 送的是客户端那份完整文档，数据照样落库。
所以这个缺陷在界面上是**看不见的**，只有读网络报文才看得见。

## 选项

1. **保持随机 id，让同步 op 不点名复制体**：新增一条 `syncInstance` op，由服务端自己找到旧子树。
   代价是补丁词汇表要多一处（模型 union / zod / contracts / MCP 描述 / evaluation 五道同族门都得跟上，
   第三十四片刚查出漏了 MCP 那一处），而且"撤销同步"还得给这条新 op 单独写逆操作。
2. **保持随机 id，让客户端在 PATCH 被拒后重放**：把 409 当成正常的乐观并发失败，
   客户端拉回服务端那份文档、按 id 映射重算 op。改动落在 `store.save()`，
   但两份文档从此**永久分叉**（每次实例化都分叉一次），渲染、AI Diff、语料检索各认一份 id，
   §16"设计模型是唯一真值"就成了一句按进程各说各话的真值。
3. **复制体 id 改成推出来的**：`<类型前缀>_<instanceId>_<源节点 id>`。
   同一棵源子树 + 同一个 instanceId ⇒ 两次 apply 得到同一批 id，文档不再分叉。

## 决定

选 3。`instantiateComponent` 里 `next.id = \`${node.type.slice(0, 3)}_${instance.id}_${node.id}\``。
同时把根节点那次调用的临时 `id: "tmp"` 去掉——推导要用**源节点自己的 id**，临时 id 会把主组件那一份抹掉。

配套的门与账：

- **模型层门**（`packages/design-model/test/patch-instantiate.test.ts` 最后那个 describe）：
  同一串 op 在两份一模一样的文档上各打一次，断言①节点 id 集合相同；
  ②从客户端那份算出来的「更新实例」op 串，在服务端那份上 `skipped` 为空。
  这两条不看浏览器就能钉住这条路。
- **界面层门**（`e2e/components-panel.spec.ts` 同步那条）：自动保存的 PATCH 计数
  必须 `rejected === 0`，且被拒时把服务端返回的 `skipped` 理由原文摊进断言消息。
- **词汇表级门**（`packages/design-model/test/patch-determinism.test.ts`）：这一条不只钉 `instantiate`。
  20 条 op 各有一条"同一串 op 在两份一模一样的文档上各打一次 → 结果全等"的用例，
  而清单**由 `contracts/design-patch.schema.json` 反钉**（读不出至少 20 条就先红）。
  理由就是本篇这条纪律的通用形式：**任何会自己造 id 的 op 都可能重犯这个错**，
  所以每加一条 op 都必须先过这一关，而不是等下一条点名它的 op 在界面上撞 409。
- **撞 id 的边界**：`instantiate` 的撞 id 门查的是**整份文档**（`cow.document.pages`）里的 `op.instanceId`
  （范围口径见 ADR-0080）；
  复制体 id 是"已证明唯一的 instanceId"拼"同一棵子树里互不相同的源 id"，
  而 `uid()` 产出的 id 形如 `tex_<base36>`、不含下划线，拼接不会歧义，所以不再为复制体单开一道门。

## 后果

- 复制体 id 变长且可读（`con_ins_1_tex_mvg2abc`），排查时能从 id 直接看出"是谁的哪一颗"，这是白捡的。
- `insert` op 的 payload 本来就带 id，同步产出的新子树 id 随报文传过去，两边一致，不受本次改动影响。
- 随机 id → 推导 id 只影响**新**实例化；库里已有的实例用的还是老随机 id，
  那些 id 已经在两边一致地落过库（当时的整份 PUT 把它们写成了同一份），不需要迁移。
- 更一般的一条纪律，已写进 `docs/ROADMAP.md`：**任何会自己造 id 的 op 都必须让 id 可推导**
  （从 op 自带的参数推出来），否则"客户端算一遍、服务端重放一遍"这条路必然分叉。
  `addPage` / `addComponent` / `addAsset` 这几条的 id 都由 payload 自带，属于安全的一族。
