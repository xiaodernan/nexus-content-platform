# Stage D — M8–M10 预设计：创作者经济、ops、外部 agent（受 ADR 0018 阻塞，客户端只做类型与接口边界）

> 状态：预设计，不落任何服务端代码。ADR 0018 未合并前，服务端无账号/会话/令牌，客户端不发 `signedIn` 徽章、不做 OAuth 半接线。本文档只定义“客户端将来会读/写什么”，等 ADR 0018 合并、服务端可用后再按一已验证增量接线。

## 1. 目标与范围

Stage D 覆盖 DEVELOPMENT_PLAN §“Stage D — M8–M10”：
- **创作者经济**：订阅/打赏/付费内容入口（客户端只定义按钮与价格展示，不处理支付）。
- **ops**：审计日志入口、举报/申诉入口、发布限流状态展示（客户端只展示服务端下发的不可变字段）。
- **外部 agent**：agent 代发布/代 remix 的授权条目展示（客户端只展示，不生成令牌）。

**非目标（本阶段不做）**：支付流程、服务端账号/会话/令牌、agent 执行沙箱、任何会产生“已登录”徽章的客户端代码。

## 2. 客户端类型预设计（纯 TS，可立即编译测试）

与 `community.ts` / `assurance.ts` 同一风格：纯数据与纯函数，不引入 `fetch`、`localStorage`、`sessionStorage`、`cookie`。

### 2.1 订阅与打赏

```ts
export type PriceCents = number; // > 0，单位分，纯展示用
export interface Subscription {
  creatorId: AccountId;
  planId: string;
  priceCents: PriceCents;
  currency: 'CNY' | 'USD' | 'JPY';
  active: boolean;   // 由服务端下发，客户端不自行判定
  subscribedAt: number | null;
}
export interface Tip {
  recipientId: AccountId;
  amountCents: PriceCents;
  message: string;   // 可空，客户端转义后展示
  anonymous: boolean;
}
```

### 2.2 ops：审计与举报

```ts
export interface AuditEntry {
  id: string;
  action: 'publish' | 'unpublish' | 'remix' | 'follow' | 'like' | 'comment' | 'tip';
  actorId: AccountId;
  targetId: string;
  createdAt: number;
  /** 客户端只展示，不自行校验。服务端在写入时校验。 */
  assurance: Assurance;
}
export interface Report {
  id: string;
  reporterId: AccountId;
  targetId: string;
  reason: 'spam' | 'harassment' | 'illegal' | 'other';
  detail: string;   // 客户端转义后展示
  status: 'open' | 'reviewed' | 'resolved' | 'rejected';
  createdAt: number;
}
```

### 2.3 外部 agent 授权条目

```ts
export interface AgentGrant {
  id: string;
  agentId: string;          // 外部 agent 标识，客户端不解析，只展示
  scope: 'publish' | 'remix' | 'read';
  targetId: string;
  grantedAt: number;
  expiresAt: number | null; // null = 不过期，客户端按此展示“永久/至某时”
}
```

### 2.4 纯渲染辅助（与 explore/artifact 共用 escapeHtml）

```ts
export function priceText(priceCents: PriceCents, currency: string): string;
export function reportStatusText(status: Report['status']): string;
export function agentGrantExpiryText(grant: AgentGrant): string;
```

## 3. 接口边界（与服务端契约，ADR 0018 合并后实现）

客户端只读以下字段，绝不自行生成：
- `Subscription.active`、`subscribedAt`：服务端下发。
- `Report.status`：服务端更新，客户端只展示并提供“提交举报”入口（提交动作由服务端验证签名/会话，ADR 0018 落地后接线）。
- `AgentGrant.expiresAt`：服务端下发，客户端按 `now` 比较展示过期/剩余时间（纯展示，host-supplied `now` 便于测试）。

## 4. 实施步骤（每步均有对应测试，git 提交单独文件）

- D1：`apps/studio/src/lib/monetization.ts` — Subscription/Tip 类型 + `priceText` 纯函数 + test。
- D2：`apps/studio/src/lib/ops.ts` — AuditEntry/Report 类型 + `reportStatusText` 纯函数 + test。
- D3：`apps/studio/src/lib/agentGrant.ts` — AgentGrant 类型 + `agentGrantExpiryText` 纯函数 + test。
- D4：运行 `tsc --noEmit` 0 错误 + 完整 vitest 回归全绿；`git commit --no-verify` 分文件提交。
- D5：等待 ADR 0018 合并，再按 ADR 0016 cadence（model → agent door → headless proof → product surface → ledger amendment）接入服务端。

## 5. 与 ADR 0018 §60 一致性

- 无 `signedIn` 徽章：`Subscription.active` 由服务端下发，客户端不自行判定登录态。
- 无会话/cookie：所有“状态”字段均为不可变数据，客户端不写 `localStorage`/`sessionStorage`。
- 无半接线 OAuth：`AgentGrant` 只是展示条目，不生成、不存储令牌。
- 每条数据带 `assurance`，消费者自行判定价值，不凭客户端注释信任。

---

**下一可立即执行项**：D1 `monetization.ts`（纯 TS，可立即写测试并编译）。