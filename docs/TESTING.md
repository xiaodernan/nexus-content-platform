# TESTING

开发闭环本身（§158/§192）：
`OBSERVE → PLAN → IMPLEMENT → RUN → TEST → SCREENSHOT → INSPECT → FIX → RETEST → COMMIT`

**没有跑过、没有看过的功能不算完成。** 类型检查与单测只证明代码正确，不证明功能可用。

## 分层

| 层 | 工具 | 范围 | 何时跑 |
| --- | --- | --- | --- |
| 单元 | Vitest | design-model 布局求解、Command 事务、token 解析、codegen IR、schema | 每次改动 |
| 契约 | Vitest + `contracts/*.schema.json` | web ↔ ai-service 报文：zod 为权威，导出 JSON Schema 供 Python 运行期校验，测试保证导出文件不漂移 | 每次改动 |
| 服务 | pytest（`apps/ai-service/tests`） | 契约校验、Model Router、provider 成功/失败/噪声、审批门、dryRun、体积上限 | ai-service 改动 |
| 集成 | Vitest + 真 Postgres(容器) | 项目 CRUD、snapshot/branch、publish、usage | 每里程碑 |
| 端到端 | Playwright | Studio 全流程竖向切片（见下 Golden Path） | 每里程碑 + 发布前 |
| 视觉 | Playwright screenshot + Visual Benchmark | 渲染快照、AI Diff 前后对比、参考图 vs 生成图 | Studio/渲染器改动 |
| Agent 评测 | `evals/` | design accuracy / code correctness / tool selection / RAG / accessibility | ai-service 改动 |

禁止 mock 数据库做集成测试（真实容器实例）；provider 在测试里用 Mock Provider，但必须显式标注 DEMO MODE 断言。

## Golden Path（M1 必须端到端通过）

```
1  打开 / （未登录）→ 输入一句 prompt → 60s 内 Canvas 出现设计（§137-138）
2  点击元素 → 右面板改 padding/color → 画布即时更新 → 刷新后仍在（§15-16）
3  拖动 + 缩放 + 框选多选 + Ctrl+Z/Ctrl+Shift+Z（§8/§148）
4  AI 命令栏："Make the hero 30% taller." → Plan 可见 → Activity 流式 → AI Diff → 一次 Ctrl+Z 全回滚（§7/§25-26/§149-151）
5  Layers 重命名/显隐/锁定/拖拽改父级
6  Design System：改 color.primary token → 所有绑定节点更新（§12）
7  Code 页 → 生成的 React 可编译；改一处代码 → 画布同步；不可映射片段标为 code-only（§19）
8  Preview iframe 只读渲染 + Mobile/Tablet/Desktop/Wide 切换无横向溢出（§14）
9  Screenshot 出图并出现在 Activity 与视觉 QA 结果里（§33/§87）
10 注册 → 保存项目 → Snapshot → 分支 A/B/C 比较（§27-29）
11  Publish 过 Quality Gate → /n/<user>/<slug> 可访问（private/unlisted/public 语义正确，§56-57/§179）
12 导出 ZIP 含 .nexus/ 结构，能在干净实例导入还原（§102-104/§144）
```

## 质量门禁（§179，Publish 前必须全绿）

`Build` · `Tests` · `Security`（无高危审计项）· `Performance`（LCP/CLS/INP/bundle，§91）·
`Accessibility`（对比度 + 键盘 + ARIA，§90）· `Visual QA`（无回归，§33）。
任一未达标 → Publish 阻塞并列出原因，不允许静默跳过。

## 性能测试（§146-147）

设计文档规模基准：100 / 1000 / 10000 节点。度量并记录：首帧渲染时间、pan/zoom 帧率（目标 ≥55fps）、
选中响应 <16ms、属性写入到画布更新 <50ms、内存峰值。回归即视为 bug。

## 约定

- 测试文件与被测文件同目录 `*.test.ts` / `tests/test_*.py`
- 不因"难测"跳过；难测处优先重构出纯函数（design-model 就是为此存在）
- 截图对比失败时**必须人眼看图**再决定更新基线，不允许盲目 approve
- 每个里程碑一次 commit 前至少跑：`npm run lint && npm test && npm run test:e2e:smoke`
- 改了 `packages/schemas` 必须重跑 `npm run contract:export`，否则契约漂移测试会红
- 动了 ai-service 再加：`npm run test:ai-service`（Windows 控制台建议前置 `PYTHONUTF8=1`）
