# ADR-0266 · 世界投影引擎的确定性说明

**Date**: 2026-11-14
**Status**: Accepted
**Patches**: docs/ROADMAP.md v709 / v710，§门 v709

## 背景

用户要"拓宽产品边界、史诗级宏观叙事、细节里面有魔鬼、写出新的故事与模块"，且反复强调
"无限故事"的愿景。前面交付了 v704 星图（/world/<id>/constellation）、v705 编年（/chronicle）、v708 设定集（/codex）。

## 决策

**v709「世界切片 /world/<id>/ephemeris」是确定性投影——同一份 worlds.document 永远给出同一年。**

引擎（`lib/ephemeris.ts`）：
- xor-shift32 风格散列 + remap 到 1..360 的天节点；
- 落笔节点（body.trim() 非空）按 `stableHash(id + kind)` 散射到创世年；
- 每天最多 N 条；无 Date、无 Math.random、无加密 API、无 IO；
- 摘录取节点 body 第一句话（超长截断至 96+…）；
- §159：零填写——不演化故事、不生成、不发挥。我只做投影，用户才能信任它生效。

## 为什么不加模型

真实模型（包括 gpt-6-sol）**不承诺**它"讲对故事"。把演算引擎塞给 provider，第一次返回的是
"令人眼前一亮的故事"，第 50 次是"热门模板 + 幻觉方向"。比这更糟的是：它会替用户写设定——这是造假，不是投影。

## 明确边界

1. **同一份世界文档 → 同一年**：这是投影的数学含义，不是"推荐"；如有人"改文档看新数"，实际就是看新的同构投影而已。
2. **不承诺任何人物变化、不承诺 any narrative drift**：创世年在这里是稀疏日历，不是故事年表。
3. **不来自 LLM，因为不能信任**：模型出错时世界被静默改写；本投影 "出错" = 脚本 bug + 可被单测钉住。
4. **有 ADR-0111 同口径**：provider 配置是能力标记。本页不需要 provider"也能走路"。

## 后果

- 任何人想改"世界的下一天"，pr 必须更新：`buildEphemeris` 的单测、`lib/ephemeris.ts` 自身、判据门（§FE-EPH）。
- 空 world 不会被假装成"有故事"反而会暴露"你还没写落笔"——**本来就是，什么是空白就是空白**。
- 任何对 constellation/chronicle/codex 的修改，必须保持同口径：写入真 bytes 的都是真的投影。
- 需要 LLM 生成的新内容（新的故事章节、设定解说……）：必须有 ADR，走 ADR-0111 路径，**不从投影层进入**。

## 引证

- `apps/web/src/lib/ephemeris.ts`
- `apps/web/test/ephemeris.test.ts` 7/7
- `apps/web/src/app/world/[projectId]/ephemeris/page.tsx`
- `apps/web/src/app/world/[projectId]/codex/page.tsx` (v708 同类投影同样纪律)
- ADR-0265（provider cache A/B）：该文件同时说明"上游非流/流" 这边的 provider 调用方法有明确的边界。
