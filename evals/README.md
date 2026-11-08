# evals/ — 按能力分的评测套件（§85）

这里放的是**不需要真库、不需要 provider、确定性**的能力评测。
仓库里另有一份 DB 在后台跑的 §85 基线：`scripts/eval-baseline.mts`（RAG / 设计精度 /
视觉 / 无障碍），跑法 `npm run evals:baseline`，读数与口径都在 `docs/EVALUATION.md`。
两边共用同一条纪律：**只钉结构不变式，数字由人比对**。

> 这一页是 §85 "`evals/` 下按能力分套件" 的兑现（之前 `evals/` 不存在，只有一个脚本，
> AGENTS.md §85 的写法是愿景不是现状——现在它有了：类型的形状在 `types.ts`，门在
> `lib/recorder.ts`，入口在 `run.mts`，套件在 `suites/`）。

## 跑

```bash
npm run evals                  # 全部确定性套件（export-roundtrip 不设库时打印 SKIP）
npm run evals -- --list        # 列出套件
npm run evals -- --suite code-index
NEXUS_DATABASE_URL=postgres://nexus:nexus_dev_only@localhost:55100/nexus npm run evals   # 含真库套件（55100 regress 实例）
npm test                       # scripts/test/evals-framework.test.mts 会再验一遍确定性套件全绿
```

退出码：任一结构不变式未过 → 1（不是"这次数字难看"，是回归）。未知参数 → 2。

## 套件与 §85 维度

| 套件 | §85 维度 | 量什么 | 需要库 |
|---|---|---|---|
| `code-index` | code correctness（§69 Code Index 检索） | 目录对真 codegen 产物的结构不变式 + 决定性查询检索 | 否 |
| `model-roundtrip` | 代码正确性 / 投影自洽（§16 · §19） | generate→parse 矩阵：横幅/横向带/网格/tablet none 翻转/gap+columns，每格零 issue 零补丁 | 否 |
| `export-roundtrip` | 代码正确性 / 导出保真（§144 · ADR-0024） | 真 ZIP → node zlib CRC 交叉校验清单 → 真导回 → 结构对账；需要真库（见下方示例） | 是 |
| `video-plan` | 代码正确性 / 视频模型投影自洽（§40-42） | 断句→分镜→时间线→渲染计划整链：确定性重放、`playable`/`renderable` 与"有没有帧"自洽、`splitShotAt` 时长守恒、`cardColor` 同 id 同色 | 否 |
| `world-build` | 代码正确性 / 世界模型投影自洽（§44/§46/§140） | 骨架世界（九类条目各 1）· 确定性 autoLayout · `worldGraph` 删点消边 · `validateWorld` 8 类缺陷分辨 · `buildWorldScene` 实体数 / authored / fallback 拆分 · `terrainHeightAt` / `walkToward` / `resolveWalkCollision`（mesa + cone + 重叠取最高） | 否 |

## 口径（与 scripts/eval-baseline.mts 同）

1. **不断言阈值**。读数打印进 EVALUATION.md，回归靠人眼比对；只有结构不变式失败才判红。
2. **不说谎**。没测的写进 `notMeasured`，不硬写一个"PASS"出来。本目录目前未测：
   - 语义检索 / 意图判断（词法目录没有这一半；向量化要 embedding provider，§49）；
   - Tool selection / Agent task completion（要真 provider，本机没有）；
   - 真实 provider 下目录的增量更新成本（目录目前全量重算，见 `docs/adr/`）。
3. **真实路径**。输入是真 `generateProject()` 的产物、真 `buildCodeIndex()`，
   夹具只是输入，不是"模拟输出的对照物"。

## 新增一套的形状

```ts
export const mySuite: EvalSuite = {
  name: 'my-suite',               // --suite 用它过滤
  dimension: 'code correctness',  // §85 原话
  needsDatabase: false,
  run() {
    const rec = new EvalRecorder();
    rec.check('名字说清断什么', ok, `actual=${x}`);
    rec.skip('没测的一句话');
    return { checks: rec.checks, notMeasured: rec.notMeasured };
  },
};
```

注册到 `run.mts` 的 `SUITES` 即可（**不**自动扫目录——加套件是个显式动作）。
若 suite 需要真库，声明 `needsDatabase: true`，runner 会打印 SKIP 并不影响其余套件的退出码。
