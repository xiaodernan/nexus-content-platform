# ADR-0287 · Web dev/typecheck 不用 path alias 指回 agents-runtime 源码 — 2026-11-19

## 背景

并行线 cont.360 在 `apps/web/tsconfig.json` 与 `tsconfig.tools.json` 同时加了
`@nexus/agent-runtime` → `../../agents/runtime/src/index.ts` 的 **TypeScript path alias**，
理由是让 `typecheck:main`（`tsconfig.tools.json`）从源码直译、不需预建 `dist`。

这个目标对 `tsconfig.tools.json` 成立（TS 自己能把 `./x.js` 解析成 `./x.ts`），
但对 **apps/web dev（Next 16 Turbopack）** 是灾难：tsconfig paths 会把 bundler 的
解析也抬到 src/index.ts，Turbopack 不做 `./x.js → ./x.ts` 映射，于是 40+ 处
`Module not found: './checkpointPolicy.js'`，`POST /api/bible/q → 500`，页面直到
诚实兜底亮出「正典问答暂时联不上模型」。

## 选项

| 方案 | 后果 |
|---|---|
| 保留 web 侧 alias + 配 extensionAlias（turbopack 无公开 API） | 不可行 —— 没有官方钩子 |
| 删 web 侧 alias，web 类型走 package exports（dist/index.d.ts） | 可行 —— dist 已有 180 个文件 + 45 个 .d.ts；junction 正确；web `typecheck` 通过 |
| 保留 web 侧 alias + 预构建 dist | 同样可行但多一步、漂移风险 |

## 决定

- **首版决定（cont.379）**：`apps/web/tsconfig.json` 不带 `@nexus/agent-runtime` alias
  （web 走 package exports 的 dist/index.d.ts）；`tsconfig.tools.json` 保留源码直译 alias
  （cont.360 CI 目标保留）。
- **最终形态（cont.380 · 并行线 cont.373 · `6e5b04c4`）**：连 `tsconfig.tools.json` 也撤回源码
  alias —— **两侧都不从源码直译**；`.github/workflows/main-line.yml` 在 typecheck 前
  预构建 `@nexus/agent-runtime` 与 `@nexus/ai-providers` 的 dist。
  本 ADR 同时修正记录这一修订。

## 后果

- 2026-11-19 修复后 web dev 起得来（HTTP 200）、`/api/bible/q` 200、
  浏览器实测 `gpt-6.1-terra · 缓存复用 7213 tokens · （问典活答）`。
- `typecheck:main` 与 web `typecheck` 都通过。
- 纪律：**Next dev 不得通过 tsconfig paths 指向 TS 源码**。任何"改源码路径直译"
  的改动只能放进 `tsconfig.tools.json` 一侧——且现在两侧都已撤回，
  统一改由 CI workflow 预构建 dist。
- 后续实测（2026-11-19 cont.380 合并后）：web `typecheck` ✓ · `tsc -p tsconfig.tools.json --noEmit` ✓ ·
  集成/行为测试不受影响。
- 教训收据：web dev 3502→3504 之间的中断里 Ser side log 恰好展示了完整 40+ 个解析失败；
  记录放 `docs/evidence/insight-live-2026-11-19.md` 副本路径。
