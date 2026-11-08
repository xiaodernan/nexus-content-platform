# ADR-0092：`Layout.rowGap` / `Layout.crossGap` 死字段——弃用而不实现

日期：2026-11-08
依据：`packages/design-model/src/types.ts`（`rowGap?` / `crossGap?`）、`docs/ROADMAP.md` §14、`docs/PLAN-2026-11-08.md`。

## Context

`rowGap` / `crossGap` 在 M0 地基里就同时落了类型表（d29e23c），但直到今天：

- `layout.ts` / `codegen.ts` / `code-parse.ts` / `validate.ts` / 求解器 / 面板 / 任何一处**都没有读取方**；
- `MASTER_DIRECTIVE`、PRD、ARCHITECTURE、任何 spec 里**都没有**这两个名字；
- 编辑器也从来不写、AI 配方从来不写、导入链从来不写（没什么人能填它们）。

它们是 Cargo-culted 的 schema 残渣（据测速习惯，可能想过 grid 行间隙 / 交叉轴间隙，但从未写过任何一行代码）。
Node 文档里它们可以存在——jsonb 反序列化容忍多余键，不会报错，唯一的代价是**误导每个后来读这份类型的人**。

## Options

**A. 实现**：按"猜"的选择定语义（grid row gap? wrap 交叉轴？flex 交叉轴？）。
- 代价：没有任何一份文档或历史记录支持任何一个读法；实现出来就得保留——猜错的承诺比死字段更贵。
- 结论：否（2026-11-08 已在 ROADMAP 记过同一句："先定语义再写实现，别按猜想实现"）。

**B. 删除字段**：`types.ts` 里去掉 `rowGap?`/`crossGap?`。
- 代价：可选字段删除对读库旧文档没有安全性影响（反序列化容忍、校验不拒），但这是**事实上的 schema 破坏面**——
  任何外部脚本/AI 配方（哪怕从来没写过）今天若在别处产生过这两个键，类型从工厂里消失后，那些文档会一直带着字面值
  困在库里没人清理——"安全删除"的前提（没有人写、也读不到）今天成立，但删除应当与一次有人真正需要
  清理的 migration 绑定，不该为了消失一个 `?` 单独开一次。
- 结论：**不现在删**（也不否认将来删，跟 migration 一起）。

**C. 弃用标注 + 不实现 + 不再提名**（选定）：
- 代价：类型表上多两个 `@deprecated` 注释，什么都不会跑坏；新读代码的人一眼看到"别写、别依赖、别实现"。
- 日后谁想真的做 grid 行间隙，开新 ADR：语义定（"grid 行轨道的间距；flex 没有交叉轴 gap 的概念"）、发射/回写/求解器/面板全接，
  并清掉这两个名字。

## Decision

**C。`rowGap` / `crossGap` 标记为 `@deprecated`——不删除、不实现、不再作为"缺一个面板输入口"被提名；
任何关于 grid 行间隙的真实需求须有新的 ADR 重新起名、不要复活这两个名字。**

## Consequences

- 类型表上多两行注释；没有任何行为变化。
- ROADMAP §14 的"rowGap/crossGap 面板没有输入口"整条**不再列为开放项**——它是死字段。
- 未来清理这件事（如果真的需要）并进到一次 schema migration 里，而不是零成本的单独一刀。
