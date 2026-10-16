# Stage B — verified assurance（受 ADR 0018 阻塞，预设计）

> 状态：**预设计，不实现**。ADR 0018 仍为 Proposed，服务端无 accounts/sessions/tokens。
> 一旦 ADR 0018 合并（option A 或 B），本文件即成为 Stage B 的实现规范，与 ADR 0016 ledger 一同记录。

## 1. 为什么现在只做预设计

`KNOWN_ASSURANCES` 当前只含 `unsigned-local`（PublishService.java line 59）。把它 widened 到包含 `verified` 不是 UI 功能，是**服务端安全决策**：需要最小账号/凭证存，否则客户端可以自称 `verified`，服务端无法验证，等于没做。所以实现必须等 ADR 0018 落地。

预设计只定义**客户端将来会消费什么形状的数据**，不写任何服务端代码，不引入 session/cookie/OAuth，不违反 ADR 0018 §60（无 signedIn 徽章、无会话）。

## 2. 客户端类型（可立即写入，不碰服务端）

```ts
// apps/studio/src/lib/assurance.ts (Stage B 预设计，暂不导出到任何路由)

/** 今天服务端唯一接受的 assurance；Stage B 后可能加入 'verified'。 */
export type Assurance = 'unsigned-local' | 'verified';

/** 一个 owner claim 的保证等级。客户端只读，从服务端或 localStorage 读回，不自生。 */
export interface OwnerClaim {
  kind: 'owner-claim';
  accountId: string;
  handle: string;
  assurance: Assurance;        // 'unsigned-local' 今天，'verified' 待 ADR 0018
  claimedAt: number;           // epoch ms, host-supplied
}

/** 客户端对一条 publication 的“作者可见信息”。Stage B 新增 verified 标记。 */
export interface PublicationOwner {
  handle: string;
  assurance: Assurance;
}

/** 客户端渲染规则（与 Stage A 一致，仅加 verified 分支）：
 *  - assurance === 'unsigned-local' → 渲染 `by <handle> · unsigned-local`
 *  - assurance === 'verified'        → 渲染 `by <handle> · verified`（带 verified 徽章样式）
 *  - owner === null                  → 不渲染作者行（pre-claim 行）
 */
```

## 3. Stage B 实施清单（等 ADR 0018 合并后按顺序执行）

| 步骤 | 动作 | 所在 | 是否需服务端 |
|------|------|------|-------------|
| B1 | `KNOWN_ASSURANCES` 加入 `'verified'` | `PublishService.java` | 是（服务端） |
| B2 | `requireClaimable` 对 `verified` claim 做最小校验（accountId/handle/claimedAt 不为空，长度在限制内） | `PublishService.java` | 是 |
| B3 | 服务端在 publication 记录中持久化 `assurance` 字段 | `PublishedProject` 实体 + 仓库 | 是 |
| B4 | `readPublication` / listing 把 `owner.assurance` 读回给客户端 | `PublishService` + DTO | 是 |
| B5 | Studio `currentAccount` / `publishLane` 透传 `assurance`（客户端不生成 `verified`，只读不写） | `currentAccount.ts` / `publishLane.ts` | 否（只读） |
| B6 | `/explore` 和 `/p/{id}` 对 `assurance === 'verified'` 渲染 verified 标记 | `explore.ts` / `artifact.ts` | 否（纯展示） |
| B7 | vitest: 新增 `verified` 行的 render 用例；nexus-api: 新增 `verified` claim 校验用例 | 两端测试 | 各自端 |
| B8 | ADR 0016 ledger 记录 Stage B（新 amendment 号） | `0016-agent-runtime-hermetic-demo-loop.md` | 文档 |

## 4. 不做什么（与 ADR 0018 边界一致）

- 不生成客户端侧 `signedIn` 徽章
- 不写 session/cookie/token
- 不做半身 OAuth
- 客户端不自行签发 `verified` assurance——只有服务端在 B1–B4 之后才能下发
