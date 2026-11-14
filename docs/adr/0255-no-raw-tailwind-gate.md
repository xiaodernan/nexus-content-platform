# ADR-0255：§FE-102 `tools/ci/no-raw-tailwind.mjs`——全树零裸原子钉成可执行门禁

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-37…§FE-101（71 片门面化）· `tools/ci/no-raw-tailwind.mjs` · `package.json#verify:no-raw-tailwind` · `docs/evidence/fe-102-no-raw-tailwind-gate/evidence.md`

## 背景

FE-37…FE-101 把 `apps/web/src` 全树 className 字面切到了 token 门面族。手工普查（census2/3/4）在 2026-11-13 复核出零残余——但"手工跑过一次"不是不变量：任何新片只要顺手写一个 `className="flex …"`，红线就又松了。

## 决定

1. 新增 `tools/ci/no-raw-tailwind.mjs`：纯 node、零依赖；扫描 `apps/web/src/**/*.tsx`（可传目录），抽取 `className="…"` / `` className={`…`} `` / `className={cn(…)}` 字面的每个空格 token，命中精确集（`flex/grid/items-center/antialiased/mx-auto/…`）或锚定前缀集（`px-`/`text-`/`bg-`/`rounded-`/`hover:`/`sm:` 等，排除 `text-fg-*`、`bg-bg-*` 之外的 Nexus token 形式）即逐个打印 `file:line token` 并退出 1。
2. `package.json` 新增 `verify:no-raw-tailwind`（NOT auto-wired into any hook/CI——作者本人就是手动触发；redact/test 门禁仍是第一道）。
3. 门面族前缀（`.nb-`/`.pp-`/…）对所有 PREFIXES 天然不匹配——不需要随门面族增长维护例外表（旧做法的 decoy 教训，FE-39：维护一个最长 30 项的 allowlist 没有收敛性）。
4. 变体前缀（`hover:`/`disabled:` 等）自身就在报告范围内（它们就是原子修饰）——在门面类上出现 `hover:` 的是违规用法；在 `className=".tt-fab:hover"` 这种形态不会出现变体前缀在 token 位上（tokens 不带点号），无误报。

## 取舍

- 不自动接 pre-commit——本仓 hook 由 codex-global 管理，此处只加 script；作者在每个 FE 切片 commit 前跑一次即可（已写入 FE 系列惯例）；
- 不扫 globals.css/tokens.css（那里的 `.flex`-like 选择器不存在，且扫描口径与 Tailwind 编译层无关）；
- 不承诺"语义级"检测（`cn()` 之外裸字符串拼接暂不解析）——2026-11-13 实测 tree 上所有 className 均为本工具可覆盖的三种形态。

## 后果

"全树零裸原子"从『今天跑过』变成『任何人跑 verify:no-raw-tailwind 就能复现』。门面纪律的兜底从此有据。
