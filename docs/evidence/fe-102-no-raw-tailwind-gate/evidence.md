# §FE-102 · `tools/ci/no-raw-tailwind.mjs`——可执行门禁——验收记录

## 这次做了什么

把『className 字面零裸原子』钉成一个可执行门禁：`node tools/ci/no-raw-tailwind.mjs`（或 `npm run verify:no-raw-tailwind`）。纯 node 零依赖；命中即 `file:line token` 打印并退出 1。

## 验证（本地实跑，2026-11-13）

```
node tools/ci/no-raw-tailwind.mjs   →  no-raw-tailwind: 干净（className 零裸原子）。
```

self-test（人工制造一例含 `className="flex gap-2 items-center"` 的临时 tsx，`tools/ci/no-raw-tailwind.mjs probe-atom.tsx`）：
输出 `probe-atom.tsx:1: flex` / `gap-2` / `items-center`，退出码 1；去掉残余后再跑全 pass，退出码 0。——实测如此（2026-11-13）。

## 边界（如实）

- 口径是 token 模式，不是 Tailwind 编译器；`cn()` 之外裸字符串拼接不解析；
- 未接入任何 hook/CI（不动 codex-global）；本片只证明『目前它就是干净的，并且能报不干净的』。
