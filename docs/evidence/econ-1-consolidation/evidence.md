# §ECON-1 · `packages/economy` 提炼——验收记录

## 这次做了什么

`apps/studio` 的经济域引擎（模板目录/ledger/退款/钱包视图，一共 **11 个模块、9 套测试**）提炼为 `packages/economy/`；原 `apps/studio/src/lib/*.ts` 文件换成了 `@nexus/economy/*` 的一行 re-export 转发，39 个既有 import 站点零改动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p packages/economy/tsconfig.json          → 0
npx tsc --noEmit -p apps/studio/tsconfig.json               → 0（shim 全解析）
npx vitest run packages/economy/test                        → 9 files, 278 passed
npm install（workspace 链接）                                → added 1 package
```

## 边界（如实）

- `apps/studio` 仍然在跑（legacy 独立面，3000 端口）；经济 **demo 层**（内存 store/ledgerStore/creditsDemo/settlement 落法）一直在 studio 里，没有收进本包——本包只收纯函数引擎；
- 支付 provider 未配置：apps/web 侧没有、studio 侧也仍是 demo 内存层——没有任何"web 能收款"的事实被引入；
- studio 自身的 vitest（`npm run test -w @nexus/studio`）未在本轮重跑（16GB 内存、剩余约 2.5GB；studio tsc 是链接正确性的较强证明，但测试未实跑）；
- 提交的重命名由 git 相似度检测认定——`git status` 显示 delete/modify 双侧，不强制 --find-renames 标记。

## 汇集动作的盘点

本次是本轮 FE 系列（71 片 + 门禁）之外的第一个跨工作区内容合并：`apps/studio → packages/economy`，入口为 `@nexus/economy`，无外部新依赖。
