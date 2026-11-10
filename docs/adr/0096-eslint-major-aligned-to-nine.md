# ADR-0096：ESLint 大版本对齐到 9——`eslint-config-next` 的 peer 上限就是 9
- 状态：已接受（2026-11-10）
- 相关：`apps/studio/eslint.config.mjs`、`package.json`（根 devDependencies）、`apps/studio/package.json`、
  `eslint.config.mjs`（根）、`docs/ENVIRONMENT.md`（16GB 内存 / 空闲约 2.5GB）

## 背景

`npm run eslint`（根 `eslint .`）在本仓库**跑不起来**。报错不是规则错误，而是配置加载期就崩：

```
Error: Cannot read config file: apps/studio/node_modules/eslint-config-next/index.js
Error: Failed to patch ESLint because the calling module was not recognized.
```

根因是**两个 ESLint 大版本同时存在于一棵依赖树里**：

| 位置 | 版本 | 来源 |
|---|---|---|
| 根 `node_modules/eslint` | 10.11.0 | 根 `package.json` 的 `"eslint": "10.11.0"` |
| `apps/studio/node_modules/eslint` | 9.39.5 | `apps/studio/package.json` 的 `"eslint": "^9.17.0"` |

`apps/studio/eslint.config.mjs` 通过 `FlatCompat.extends('next/core-web-vitals')` 加载 `eslint-config-next`，
而 `eslint-config-next@15.5.29` 的 `index.js` 会调用 `@rushstack/eslint-patch` 去**打补丁**它所解析到的那个 ESLint。
它从 `apps/studio/node_modules` 解析到的是 **9.39.5**，而被执行的是根的 **10.11.0**——补丁打在一个没在跑的实例上，
于是 ESLint 10 报"calling module was not recognized"。

`eslint-config-next@15.5.29` 的 peerDependencies 是 `"eslint": "^7.23.0 || ^8.0.0 || ^9.0.0"`——**它根本不支持 ESLint 10**。

## 选项

1. **把 `apps/studio` 升到 eslint-config-next 16**：Next 16 的 eslint-config-next 仍然以 ESLint 9 为 peer 上限，
   而且 `apps/studio` 依赖的是 `next@^15.1.4`，升配置等于升框架，代价远大于问题本身。否。
2. **给 `apps/studio` 换一份不依赖 `@rushstack/eslint-patch` 的配置**：会丢掉 Next 自己的规则集
   （`@next/next/*`），等于用"少查一类 bug"换"能跑起来"。否。
3. **把 `apps/studio` 整个从 ESLint 覆盖范围里排除**：等于这个包从此不被 lint——比现在更糟。否。
4. **把根 ESLint 降到 9，并锁成与 `apps/studio` 同一个精确版本**（选定）：
   - `eslint-config-next` 的 peer 上限被满足；
   - npm 提升后**只有一份** ESLint 实例（`apps/studio/node_modules/eslint` 不再存在，解析到根那一份），
     补丁打的就是在跑的那个实例；
   - `typescript-eslint@8.70.1` 的 peer 是 `^8.57.0 || ^9.0.0 || ^10.0.0`，9 在范围内；
   - 根 `eslint.config.mjs` 用到的 `extends`（flat config 对象内）已在 ESLint 9.39 的 schema 里（已核对
     `apps/studio/node_modules/eslint/lib/config/flat-config-schema.js` 的已知键表含 `"extends"`），降级不丢配置能力。

## 决定

- 根 `package.json`：`"eslint": "10.11.0"` → `"9.39.5"`；`"@eslint/js": "10.0.1"` → `"9.39.5"`。
- `apps/studio/package.json`：`"eslint": "^9.17.0"` → `"9.39.5"`。
- 三处锁**同一个精确版本**，让 npm 只装一份，全树一个实例。

## 后果与证据

- `npm install` 后：`node_modules/eslint` = 9.39.5，`apps/studio/node_modules/eslint` **不存在**（已提升，单实例）。
- 配置加载期崩溃消失；`apps/studio` 自带的 `eslint . --max-warnings=0`（用同一实例）在修复前后都 exit 0。
- **本 ADR 不解决堆上限**：整仓 type-aware lint 需要超过 Node 默认堆（4288 MB），见 `docs/adr/0096` 的后续条目
  （堆上限与分包 lint 的取舍另行记录）。
- 降级是**修根因**，不是绕过：没有 `--no-verify`、没有 `SKIP_HOOKS`、没有把 `apps/studio` 排除出覆盖范围。
