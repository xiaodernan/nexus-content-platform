import { localTokenBagVector, LOCAL_EMBEDDING_DIMENSIONS, tokenizeForLocalEmbedding } from '../../apps/web/src/server/ai/embedding.ts';
import { EvalRecorder } from '../lib/recorder.ts';
import type { EvalSuite } from '../types.ts';

/**
 * §85 · §49 — the deterministic local token-bag embedder (opt-in via NEXUS_EMBEDDING_PROVIDER=local).
 *
 * It is a CONVENIENCE, not a semantic model, and this suite is written with the same discipline as
 * DEMO MODE (§159/§160): the gate runs on the cases the algorithm can deterministically answer,
 * it never pretends recall quality is measured beyond that, and every check below is either
 * bitwise determinism or an exact identity that must hold at this ref. If a number on this page
 * ever reads as a model-quality claim, that is the bug.
 */
export const localEmbeddingSuite: EvalSuite = {
  name: 'local-embedding',
  dimension: '代码正确性 / 检索自洽（§6 边界 · §49 local token-bag 语料检索）',
  needsDatabase: false,

  run() {
    const rec = new EvalRecorder();

    const CORPUS: Array<{ id: string; text: string }> = [
      { id: 'design', text: '设计文档 画布 节点 排版 组件 设计令牌 布局 栅格系统 视觉稿' },
      { id: 'game', text: '游戏设计 技能 数值 平衡 副本 关卡 怪物 AI 战斗 规则' },
      { id: 'video', text: '视频剪辑 分镜 镜头 台词 剧本 转场 时间轴 素材 渲染 输出' },
      { id: 'world', text: '世界构建 背景 势力 地理 地图 种族 神话 历史 编年' },
      { id: 'code', text: '代码 实现 编译 语法 AST 运行时 模块 写入 类型 推断' },
      { id: 'character', text: '角色对话 情绪 性格 关系 弧光 语气 记忆 创作 设定' },
      { id: 'export', text: '导出打包 构建 管道 产物 分发 压缩 清单 版本 快照' },
      { id: 'asset', text: '资产管理 图片 文件 上传 存储 配额 对象命名 元数据' },
    ];
    const QUERIES: Array<{ q: string; want: string }> = [
      { q: '设计文档的画布组件与排版', want: 'design' },
      { q: '关卡设计与战斗规则', want: 'game' },
      { q: '分镜与镜头的顺序', want: 'video' },
      { q: '世界设定的势力与地理', want: 'world' },
      { q: '类型推断与 AST', want: 'code' },
      { q: '角色的对话与性格', want: 'character' },
      { q: '导出打包的产物', want: 'export' },
      { q: '图片资产的存储', want: 'asset' },
    ];

    console.log(`\n== Local token-bag embedder（§49/§93）· 载体=确定性本地向量 · ${CORPUS.length} 个语料文档 · ${QUERIES.length} 个查询 ==`);

    // ── 结构不变式：向量的形状 ───────────────────────────────────────────────────────────
    const dims = new Set(CORPUS.map((d) => localTokenBagVector(d.text).length));
    rec.structural(
      'every corpus document yields the pgvector-column dimension',
      dims.size === 1 && dims.has(LOCAL_EMBEDDING_DIMENSIONS),
      LOCAL_EMBEDDING_DIMENSIONS,
    );

    // 非空文档 L2 归一后必为单位长度（空文本允许零向量——store 读回时 refuse，不是本套件管的）
    const normsOk = CORPUS.every((d) => {
      const v = localTokenBagVector(d.text);
      const sum = v.reduce((acc, x) => acc + x * x, 0);
      return Math.abs(sum - 1) < 1e-9;
    });
    rec.structural('every non-empty document is L2-normalized to a unit vector', normsOk, 1);

    // 确定性：同输入两次计算逐位相等（浮点归一化是确定性代码路径，同机同字节）
    const twice = CORPUS.map((d) => {
      const a = localTokenBagVector(d.text);
      const b = localTokenBagVector(d.text);
      return JSON.stringify(a) === JSON.stringify(b);
    });
    rec.structural(
      'determinism: the same text embeds to the identical bytes',
      twice.every(Boolean),
      1,
    );

    // 空输入：零向量而不是 NaN/崩溃（store 会在读回拒绝它；这里只钉这个契约）
    rec.structural(
      'the empty string yields the zero vector, never NaN',
      localTokenBagVector('   ').every((x) => x === 0),
      0,
    );

    // token 数不虚报（embed() 的 tokens_in 是真数、会覆盖这个）
    rec.structural(
      'the tokenizer recognises both ascii words and CJK bigrams',
      tokenizeForLocalEmbedding('buffer AST 类型').length === 3,
      tokenizeForLocalEmbedding('buffer AST 类型').length,
    );

    // ── 确定性质询：检索自洽（这是 §6 的“边界纪律”，不是检索效果的证明）─────────────────
    const docVecs = CORPUS.map((d) => ({ id: d.id, v: localTokenBagVector(d.text) }));
    const cos = (a: number[], b: number[]) => a.reduce((acc, x, i) => acc + x * (b[i] ?? 0), 0);
    let hits = 0;
    for (const { q, want } of QUERIES) {
      const qv = localTokenBagVector(q);
      const ranked = docVecs.map((d) => ({ id: d.id, score: cos(qv, d.v) })).sort((x, y) => y.score - x.score);
      const top = ranked[0]!;
      const ok = top.id === want;
      if (ok) hits += 1;
      rec.structural(`query ${q.slice(0, 12)}… → top-1 is ${want}`, ok, `top=${top.id} score=${top.score.toFixed(3)}`);
    }
    rec.structural(`recall@1 == 8 / 8 on this fixture (${hits}/${QUERIES.length})`, hits === QUERIES.length, hits);

    // 结构信息：数字读数由人比对（§85）
    console.log('   读数：每条查询的 top-1 得分见上方 actual 列；数字不是门，检索自洽才是门');
    return rec;
  },
};
