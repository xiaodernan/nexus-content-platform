# ADR-0256：§ECON-1 `packages/economy`——合并 `apps/studio` 经济域引擎为共享包（集大成一步）

- 状态：Accepted
- 日期：2026-11-13
- 关联：§ECON-1 · `apps/studio`（遗留独立 Studio）· `packages/economy` · `docs/evidence/econ-1-consolidation/evidence.md`

## 背景

`apps/studio` 是一个全特性独立的 Studio 应用（Next 15，3000 端口），覆盖创作者市场经济：模板目录、点赞/打赏/订阅、退款协议、结算、钱包视图。`apps/web` 是同一产品的主干实现——它有市场发布（DB、下载交付 #120）和通知/会话/认证、但**没有**独立的经济域引擎（只有 credits 但那条链在 apps/web 里是会话级别的，没有 refundPolicy/walletView/ledger 的纯函数内核）。

`apps/studio` 里这部分是**纯函数、无 React、无 DB、无支付 provider 调用**——值得提炼到 shared packages 里，让 apps/web 未来可直接 import，并让两套 Studio 的经济语义不再漂移。

## 决定

1. **提炼 `packages/economy/`**（零依赖纯 TS，`exports` 与 creative-model/schemas 同构）：
   `credits / community / templateCatalog / monetization / economy / marketplace / refund / refundPolicy / walletView`
   外加 `pageShell / planBar`（两者是被 `economy.test.ts` 与 `u/[accountId]/route.ts` 直接用到的纯函数 libs——一并提炼，保持闭环）。
2. **apps/studio 的 11 个原文件替换为 `@nexus/economy/*` 转发 shim**——保持 39 个既有 import 站点零改动、`@/lib/planBar` 等路径继续可解析。
3. **9 个测试随包提炼**；全部 **278/278 绿**（2026-11-13 本地实跑，vitest）。ECON-1 之前 `apps/studio` 只有通过 studio 自身 config 才能跑——现在它们也能在根 vitest 下运行（`packages/economy/test`）。
4. `npm install` 一次以链接 `node_modules/@nexus/economy`（workspace symlink，`package-lock.json` 记录新增 workspace 条目——不新增任何外部依赖）。
5. 根 `typecheck:main` 增加 `packages/economy/tsconfig.json` 门禁。
6. **`apps/web` 不 import 本包（本阶段）**——落库/支付/结算的 provider 尚未配置，任何"web 现在就能收款"的暗示都是假话（§159）。本片只做**汇集**，不宣称"web 侧经济闭环完成"。

## 取舍

- **不提炼** `economyLane.ts / creditsDemo.ts / ledgerStore.ts / ...`（它们是内存 store/demo 层）——保留在 apps/studio（shim 仍能用，§159 guest-only demo 不算产品经济面）；
- **不**删 `apps/studio`（大库存、有人使用、经济模型本体迁出后它仍是 唯一的可交互 demo 经济场）；
- index 不 star-export `monetization` 与 `planBar`——二者与 `economy.ts` 各有同值重复（`planCountText/planRetiredText/PLAN_TERMS_NOTE/planPeriodText/PlanRow`），去除歧义（TS2308）；所有可达性能经 `economy`/显式 subpath 在 shim 中保持可用；
- `@nexus/economy` 没有构建步骤——按仓库 schemas 惯例直接 `main: ./src/index.ts`（tsconfig 直入，turbo 缓存可口算）；
- 不做 git mv 保历史——`fs rename` + git 的相似度重命名检测足够（本次提交呈 rename 形式）。

## 后果

"apps/studio 经济域引擎"成为 `packages/economy` 的 11 个模块 + 9 套测试：apps/web 未来随时可以 `import { balanceOf, heldRefsOf, refundPurchaseUnderPolicy } from '@nexus/economy'` 接入真 provider，而不用重新手推一遍这些规则。这是本项目第一次把 web 外的一个 apps/* 工作区内容**实际汇入 packages/**。

边界（如实）：

- `apps/studio` 仍然是 legacy 独立部署面（3000 端口）——本片没有关掉它；
- 支付 provider、结算落库、退款仲裁 UI 仍在两者都处于未接入状态——apps/web 没有它们，apps/studio 也仍是 demo 内存层；
- `economy.test.ts` 的 `data-economy-*` vs `@/lib/planBar` 链路以 shim 保持——行为完全等价。
